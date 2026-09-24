const $ = selector => document.querySelector(selector);
let state = { theme: 'light', activeCourseId: '', rootFolder: '', libraryName: '', videos: [], stats: {}, courses: [], activity: [], storage: {} };
let activeVideo = null;
let sessionRanges = [];
let playAnchor = null;
let lastTrackedTime = null;
let progressSaveTimer = null;
let toastTimer = null;
let pendingAutoplay = false;
let advancingToNext = false;
let modalProgressFrame = 0;
let manualControlDirty = false;
let manualProgressPromise = Promise.resolve();
let playlistSubmitting = false;
let playlistQueueState = { active: null, queued: [], recent: [], queuedCount: 0, totalCount: 0 };
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedActivityDate = localDateKey(new Date());
let coursePickerMode = 'select';
let addVideoCourseId = '';
let audioContext = null;
let audioSource = null;
let audioLeveler = null;
let audioMakeupGain = null;
let audioLimiter = null;
let playerFeedbackTimer = null;

const icons = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4c0 .9 1 1.4 1.7.9l9-6.2a1.1 1.1 0 0 0 0-1.8l-9-6.2A1 1 0 0 0 8 5.8Z"/></svg>'
};

function showPlayerFeedback(message) {
  const feedback = $('#playerFeedback');
  if (!feedback) return;
  clearTimeout(playerFeedbackTimer);
  feedback.textContent = message;
  feedback.classList.add('show');
  playerFeedbackTimer = setTimeout(() => feedback.classList.remove('show'), 650);
}

async function handlePlayerShortcut(event) {
  if ($('#videoModal').hidden || !activeVideo || event.altKey || event.ctrlKey || event.metaKey) return false;
  const player = $('#coursePlayer');
  const key = event.code === 'Space' ? 'Space' : event.key;
  if (!['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return false;
  event.preventDefault();
  event.stopPropagation();

  if (key === 'Space') {
    if (event.repeat) return true;
    if (player.paused) {
      try {
        await player.play();
      } catch {
        showPlayerFeedback('Video konnte nicht gestartet werden');
      }
    } else {
      player.pause();
    }
    return true;
  }

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const direction = key === 'ArrowRight' ? 1 : -1;
    const duration = Number.isFinite(player.duration) ? player.duration : Number(activeVideo.duration) || 0;
    player.currentTime = Math.max(0, Math.min(duration, player.currentTime + (5 * direction)));
    showPlayerFeedback(direction > 0 ? '+5 Sekunden' : '−5 Sekunden');
    return true;
  }

  const direction = key === 'ArrowUp' ? 1 : -1;
  player.muted = false;
  player.volume = Math.max(0, Math.min(1, player.volume + (0.05 * direction)));
  showPlayerFeedback(`Lautstärke ${Math.round(player.volume * 100)} %`);
  return true;
}

function syncPlayerControls() {
  const player = $('#coursePlayer');
  const shell = player?.closest('.player-shell');
  if (!player || !shell) return;
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const seek = $('#playerSeek');
  shell.classList.toggle('is-paused', player.paused);
  shell.classList.toggle('is-playing', !player.paused);
  $('#playerPlay')?.setAttribute('aria-label', player.paused ? 'Video abspielen' : 'Video pausieren');
  $('#playerCenterPlay')?.setAttribute('aria-label', player.paused ? 'Video abspielen' : 'Video pausieren');
  if (seek && document.activeElement !== seek) seek.value = String(currentTime);
  if (seek) {
    seek.max = String(duration);
    seek.style.setProperty('--player-progress', `${duration ? (currentTime / duration) * 100 : 0}%`);
  }
  if ($('#playerCurrentTime')) $('#playerCurrentTime').textContent = formatTime(currentTime);
  if ($('#playerDuration')) $('#playerDuration').textContent = formatTime(duration);
  const volume = player.muted ? 0 : player.volume;
  const volumeControl = $('#playerVolume');
  if (volumeControl && document.activeElement !== volumeControl) volumeControl.value = String(volume);
  volumeControl?.style.setProperty('--player-volume', `${volume * 100}%`);
  $('#playerMute')?.classList.toggle('is-muted', player.muted || player.volume === 0);
  $('#playerMute')?.setAttribute('aria-label', player.muted || player.volume === 0 ? 'Ton einschalten' : 'Ton ausschalten');
}

async function togglePlayerPlayback() {
  const player = $('#coursePlayer');
  if (player.paused) {
    try { await player.play(); } catch { showPlayerFeedback('Video konnte nicht gestartet werden'); }
  } else {
    player.pause();
  }
}

async function togglePictureInPicture() {
  const player = $('#coursePlayer');
  if (!document.pictureInPictureEnabled || !player.requestPictureInPicture) {
    showPlayerFeedback('Bild-in-Bild ist nicht verfügbar');
    return;
  }
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await player.requestPictureInPicture();
  } catch {
    showPlayerFeedback('Bild-in-Bild konnte nicht gestartet werden');
  }
}

async function togglePlayerFullscreen() {
  const shell = $('#coursePlayer')?.closest('.player-shell');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await shell?.requestFullscreen();
  } catch {
    showPlayerFeedback('Vollbild konnte nicht gestartet werden');
  }
}

function enableMaximumLoudness() {
  const player = $('#coursePlayer');

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioContext = new AudioContextClass();
    audioSource = audioContext.createMediaElementSource(player);

    // Raise quiet material without changing the balance between bass and treble.
    audioLeveler = audioContext.createDynamicsCompressor();
    audioLeveler.threshold.value = -24;
    audioLeveler.knee.value = 18;
    audioLeveler.ratio.value = 4;
    audioLeveler.attack.value = 0.008;
    audioLeveler.release.value = 0.28;

    audioMakeupGain = audioContext.createGain();
    audioMakeupGain.gain.value = 2.25;

    // Catch peaks immediately before the output so the extra loudness does not clip.
    audioLimiter = audioContext.createDynamicsCompressor();
    audioLimiter.threshold.value = -1;
    audioLimiter.knee.value = 0;
    audioLimiter.ratio.value = 20;
    audioLimiter.attack.value = 0.001;
    audioLimiter.release.value = 0.09;

    audioSource
      .connect(audioLeveler)
      .connect(audioMakeupGain)
      .connect(audioLimiter)
      .connect(audioContext.destination);
  }

  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function formatTime(seconds, short = false) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (short && h) return `${h} Std ${m} Min`;
  if (short) return `${m} Min`;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1_000_000) return `${Math.max(1, Math.round(value / 1000))} KB`;
  if (value < 1_000_000_000) return `${Math.round(value / 1_000_000)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function mergeRanges(ranges, duration = 0) {
  const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  const sorted = (Array.isArray(ranges) ? ranges : [])
    .map(range => [Math.max(0, Number(range?.[0]) || 0), Math.min(max, Math.max(0, Number(range?.[1]) || 0))])
    .filter(([a,b]) => b > a)
    .sort((a,b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + 1.25) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

function watchedSeconds(video, extra = []) {
  return mergeRanges([...(video?.watchedRanges || []), ...extra], video?.duration || 0).reduce((sum,[a,b]) => sum + (b-a), 0);
}

function parseTimeInput(value) {
  const text = String(value || '').trim().replace(',', '.');
  if (!text) return 0;
  if (!text.includes(':')) return Math.max(0, Number(text) || 0) * 60;
  const parts = text.split(':').map(part => Number(part));
  if (parts.some(part => !Number.isFinite(part) || part < 0)) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

function toast(message) {
  const node = $('#toast');
  clearTimeout(toastTimer);
  node.textContent = message;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('show'));
  toastTimer = setTimeout(() => { node.classList.remove('show'); setTimeout(() => { node.hidden = true; }, 220); }, 3200);
}

function render() {
  document.documentElement.dataset.theme = state.theme === 'dark' ? 'dark' : 'light';
  const themeButton = $('#themeButton');
  const nextThemeLabel = state.theme === 'dark' ? 'Helles Design einschalten' : 'Dunkles Design einschalten';
  themeButton.setAttribute('aria-label', nextThemeLabel);
  themeButton.title = nextThemeLabel;
  const stats = state.stats || {};
  const pct = Math.max(0, Math.min(100, Number(stats.percentage) || 0));
  $('#heroPercent').textContent = `${pct}%`;
  $('#heroRing').style.strokeDashoffset = String(314.159 * (1 - pct / 100));
  if (state.videos.length) {
    $('#heroTitle').textContent = `${stats.completed || 0} von ${stats.videos || 0} Videos abgeschlossen`;
    $('#heroDetail').textContent = `${formatTime(stats.totalWatched, true)} angesehen · ${formatTime(stats.totalDuration, true)} Kursmaterial`;
  } else if (state.libraryName) {
    $('#heroTitle').textContent = state.libraryName;
    $('#heroDetail').textContent = 'In diesem Kurs wurden noch keine unterstützten Videos gefunden.';
  } else {
    $('#heroTitle').textContent = 'Noch kein Videokurs';
    $('#heroDetail').textContent = 'Wähle unten deinen Videokurs aus.';
  }

  $('#folderTitle').textContent = state.libraryName || 'Videokurs auswählen';
  $('#folderPath').textContent = state.rootFolder || 'Lokalen Kursordner öffnen oder eine YouTube-Playlist direkt in Lunar laden.';
  $('#libraryHeading').textContent = state.libraryName || 'Kurse & Kapitel';
  $('#statVideos').textContent = String(stats.videos || 0);
  $('#statChapters').textContent = String(stats.chapters || 0);
  const showChapterStat = Number(stats.chapters) > 1;
  $('#chapterStat').hidden = !showChapterStat;
  $('#statsPanel').dataset.itemCount = showChapterStat ? '4' : '3';
  $('#statWatched').textContent = formatTime(stats.totalWatched, true);
  $('#statCompleted').textContent = String(stats.completed || 0);
  $('#videoCount').textContent = `${stats.videos || 0} ${(stats.videos || 0) === 1 ? 'Video' : 'Videos'}`;
  $('#refreshButton').disabled = !state.rootFolder;

  const groups = new Map();
  for (const video of state.videos) {
    if (!groups.has(video.chapter)) groups.set(video.chapter, []);
    groups.get(video.chapter).push(video);
  }
  const chapterGroups = [...groups];
  const showChapterHeaders = chapterGroups.length > 1;
  $('#library').innerHTML = chapterGroups.map(([chapter, videos]) => {
    const chapterDuration = videos.reduce((sum, video) => sum + (video.duration || 0), 0);
    return `<section class="chapter-section">
      ${showChapterHeaders ? `<div class="chapter-head"><h3>${escapeHTML(chapter)}</h3><span>${videos.length} ${videos.length === 1 ? 'Video' : 'Videos'}${chapterDuration ? ` · ${formatTime(chapterDuration, true)}` : ''}</span></div>` : ''}
      <div class="video-grid">${videos.map(videoCard).join('')}</div>
    </section>`;
  }).join('');

  if (!$('#coursePickerModal').hidden) renderCoursePicker();
  if (!$('#activityModal').hidden) renderActivityModal();
}

function videoCard(video) {
  const pct = Number(video.percentage) || 0;
  const thumb = video.thumbnailUrl
    ? `<img src="${escapeHTML(video.thumbnailUrl)}" alt="" loading="lazy" decoding="async">`
    : `<div class="thumbnail-placeholder">${icons.play}</div>`;
  const playlistIndex = Number(video.playlistIndex) > 0 ? `<span class="playlist-index">${Math.round(Number(video.playlistIndex))}</span>` : '';
  const durationPill = Number(video.duration) > 0 ? `<span class="duration-pill">${formatTime(video.duration)}</span>` : '';
  return `<button class="video-card" type="button" data-video-id="${video.id}">
    <div class="thumbnail">${thumb}${playlistIndex}${video.completed ? '<span class="complete-badge">ANGESEHEN</span>' : ''}${durationPill}</div>
    <div class="card-copy">
      <h4 title="${escapeHTML(video.name)}">${escapeHTML(video.name)}</h4>
      <div class="card-meta"><span>${video.watchedSeconds ? `Bis ${formatTime(video.watchedSeconds)} angesehen` : formatBytes(video.size)}</span><strong>${pct}%</strong></div>
      <div class="progress-track"><i style="width:${pct}%"></i></div>
    </div>
  </button>`;
}

function groupedActivity() {
  const map = new Map();
  for (const entry of state.activity || []) {
    const key = entry.date || localDateKey(entry.activityAt);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  for (const entries of map.values()) entries.sort((left, right) => new Date(right.activityAt) - new Date(left.activityAt));
  return map;
}

function activityMetrics(entries = []) {
  const seconds = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.watchedSeconds) || 0), 0);
  const videos = new Set(entries.filter(entry => (Number(entry.watchedSeconds) || 0) > 0 || entry.manualUpdate).map(entry => entry.videoId)).size;
  const completed = new Set(entries.filter(entry => entry.completed).map(entry => entry.videoId)).size;
  const courses = new Set(entries.map(entry => entry.courseId).filter(Boolean)).size;
  return { seconds, videos, completed, courses };
}

function entriesForMonth(map, year, month) {
  const entries = [];
  for (const [key, dayEntries] of map) {
    const date = dateFromKey(key);
    if (date.getFullYear() === year && date.getMonth() === month) entries.push(...dayEntries);
  }
  return entries;
}

function moveCalendarMonth(offset) {
  const target = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + offset, 1);
  const selectedDate = dateFromKey(selectedActivityDate);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  selectedActivityDate = localDateKey(new Date(target.getFullYear(), target.getMonth(), Math.min(selectedDate.getDate(), lastDay)));
  calendarCursor = target;
  renderActivityModal();
}

function renderTrend(map) {
  const container = $('#activityTrend');
  const days = [];
  let maximum = 1;
  let total = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const metrics = activityMetrics(map.get(localDateKey(date)) || []);
    maximum = Math.max(maximum, metrics.seconds);
    total += metrics.seconds;
    days.push({ date, ...metrics });
  }
  $('#trendTotal').textContent = formatTime(total, true);
  container.innerHTML = days.map(({ date, seconds, videos }) => {
    const height = seconds ? Math.max(14, Math.round((seconds / maximum) * 100)) : 5;
    const label = seconds ? formatTime(seconds, true) : 'Keine Lernzeit';
    return `<button class="trend-column" type="button" data-date="${localDateKey(date)}" title="${date.toLocaleDateString('de-DE')}: ${label} · ${videos} Videos">
      <span class="trend-value">${seconds >= 60 ? Math.max(1, Math.round(seconds / 60)) : ''}</span>
      <i style="height:${height}%"></i>
      <small>${date.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}</small>
    </button>`;
  }).join('');
}

function renderCalendarGrid(map) {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $('#calendarMonthLabel').textContent = calendarCursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const numberOfDays = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());
  const cells = [];
  for (let index = 0; index < firstDayOffset; index += 1) cells.push('<span class="calendar-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= numberOfDays; day += 1) {
    const date = new Date(year, month, day);
    const key = localDateKey(date);
    const metrics = activityMetrics(map.get(key) || []);
    const hasActivity = metrics.seconds > 0 || metrics.completed > 0;
    const classes = ['calendar-day'];
    if (hasActivity) classes.push('has-activity');
    if (key === todayKey) classes.push('today');
    if (key === selectedActivityDate) classes.push('selected');
    const minutes = metrics.seconds > 0 ? Math.max(1, Math.round(metrics.seconds / 60)) : 0;
    const content = metrics.seconds > 0
      ? `<strong>${minutes}</strong><small>Min</small>${metrics.completed ? `<span class="calendar-complete-count">✓ ${metrics.completed}</span>` : ''}`
      : metrics.completed
        ? `<strong class="complete-only">✓ ${metrics.completed}</strong><small>abgeschlossen</small>`
        : '<i></i>';
    cells.push(`<button class="${classes.join(' ')}" type="button" data-date="${key}" aria-label="${date.toLocaleDateString('de-DE')}, ${minutes} Minuten Lernzeit, ${metrics.videos} Videos">
      <span class="day-number">${day}</span>${content}
    </button>`);
  }
  $('#calendarGrid').innerHTML = cells.join('');
}

function renderSelectedDay(map) {
  const date = dateFromKey(selectedActivityDate);
  const entries = map.get(selectedActivityDate) || [];
  const metrics = activityMetrics(entries);
  const todayKey = localDateKey(new Date());
  $('#selectedDayEyebrow').textContent = selectedActivityDate === todayKey ? 'HEUTE' : date.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase();
  $('#selectedDayLabel').textContent = date.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  $('#selectedDayCount').textContent = `${formatTime(metrics.seconds, true)} · ${metrics.videos} ${metrics.videos === 1 ? 'Video' : 'Videos'}${metrics.completed ? ` · ${metrics.completed} abgeschlossen` : ''}`;
  if (!entries.length) {
    $('#activityList').innerHTML = '<div class="activity-empty"><strong>Noch keine Lernaktivität</strong><span>An diesem Tag wurde in Lunar noch keine Wiedergabe protokolliert.</span></div>';
    return;
  }
  $('#activityList').innerHTML = entries.map(entry => {
    const thumb = entry.thumbnailUrl ? `<img src="${escapeHTML(entry.thumbnailUrl)}" alt="">` : `<div class="activity-thumb-placeholder">${icons.play}</div>`;
    const seconds = Math.max(0, Number(entry.watchedSeconds) || 0);
    const detail = seconds > 0 ? `${formatTime(seconds, true)} aktiv angesehen` : 'Fortschritt manuell nachgetragen';
    const time = entry.activityAt ? new Date(entry.activityAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    const badges = `${entry.completed ? '<span class="activity-badge complete">ABGESCHLOSSEN</span>' : ''}${entry.manualUpdate ? '<span class="activity-badge manual">MANUELL</span>' : ''}`;
    return `<article class="activity-item">
      <div class="activity-thumb">${thumb}</div>
      <div class="activity-item-copy"><h4>${escapeHTML(entry.videoName)}</h4><p>${escapeHTML(entry.courseName)}${entry.chapter ? ` · ${escapeHTML(entry.chapter)}` : ''}</p><span>${escapeHTML(detail)}${time ? ` · ${time}` : ''}</span></div>
      <div class="activity-badges">${badges}</div>
    </article>`;
  }).join('');
}

function renderActivityModal() {
  const map = groupedActivity();
  const today = new Date();
  const todayKey = localDateKey(today);
  const selectedMetrics = activityMetrics(map.get(selectedActivityDate) || []);
  const monthMetrics = activityMetrics(entriesForMonth(map, calendarCursor.getFullYear(), calendarCursor.getMonth()));
  const isCurrentMonth = calendarCursor.getFullYear() === today.getFullYear() && calendarCursor.getMonth() === today.getMonth();
  const monthLabel = calendarCursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  $('#activityDayLabel').textContent = selectedActivityDate === todayKey
    ? 'HEUTE'
    : dateFromKey(selectedActivityDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' }).toUpperCase();
  $('#activityMonthLabel').textContent = isCurrentMonth ? 'DIESER MONAT' : monthLabel.toUpperCase();
  $('#activityVideosDetail').textContent = isCurrentMonth ? 'diesen Monat angesehen' : `im ${monthLabel} angesehen`;
  $('#activityCompletedDetail').textContent = isCurrentMonth ? 'diesen Monat' : `im ${monthLabel}`;
  $('#activityToday').textContent = formatTime(selectedMetrics.seconds, true);
  $('#activityMonth').textContent = formatTime(monthMetrics.seconds, true);
  $('#activityVideos').textContent = String(monthMetrics.videos);
  $('#activityCompleted').textContent = String(monthMetrics.completed);
  renderTrend(map);
  renderCalendarGrid(map);
  renderSelectedDay(map);
}

function showModal(node) {
  if (!node) return;
  clearTimeout(node._hideTimer);
  node.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('visible')));
}

function hideModal(node, after) {
  if (!node || node.hidden) {
    if (typeof after === 'function') after();
    return;
  }
  node.classList.remove('visible');
  clearTimeout(node._hideTimer);
  node._hideTimer = setTimeout(() => {
    node.hidden = true;
    if (typeof after === 'function') after();
    if (![...document.querySelectorAll('.modal-backdrop')].some(modal => !modal.hidden)) document.body.classList.remove('modal-open');
  }, 230);
}

function openActivityModal() {
  const selectedDate = dateFromKey(selectedActivityDate);
  calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderActivityModal();
  showModal($('#activityModal'));
  setTimeout(() => $('#activityClose').focus(), 120);
}

function closeActivityModal() {
  hideModal($('#activityModal'));
}

function openCoursePicker(mode = 'select') {
  coursePickerMode = mode === 'import' ? 'import' : 'select';
  $('#youtubePanel').hidden = true;
  renderCoursePicker();
  showModal($('#coursePickerModal'));
  setTimeout(() => $('#coursePickerClose').focus(), 120);
}

function closeCoursePicker() {
  hideModal($('#coursePickerModal'), () => { $('#youtubePanel').hidden = true; addVideoCourseId = ''; });
}

function renderCoursePicker() {
  const importing = coursePickerMode === 'import';
  $('#coursePickerTitle').textContent = importing ? 'Videokurs importieren' : 'Videokurs auswählen';
  $('#storagePath').textContent = importing
    ? 'Ordner auswählen oder eine YouTube-Playlist angeben.'
    : 'Wähle einen bereits gespeicherten Videokurs.';
  $('#courseSourceGrid').hidden = !importing;
  $('#savedCoursesSection').hidden = importing;

  const courses = Array.isArray(state.courses) ? state.courses : [];
  $('#noSavedCourses').hidden = courses.length > 0;
  $('#savedCourses').innerHTML = courses.map(course => {
    const stats = course.stats || {};
    const active = course.id === state.activeCourseId;
    const isYoutube = course.sourceType === 'youtube';
    const source = isYoutube ? 'YOUTUBE' : 'ORDNER';
    const sourceEmoji = isYoutube ? '▶️' : '📁';
    const previewThumbnail = String(course.previewThumbnailUrl || '');
    const unavailable = !course.available;
    return `<div class="saved-course-card${active ? ' active' : ''}${unavailable ? ' unavailable' : ''}">
      <button class="saved-course-open" type="button" data-course-id="${escapeHTML(course.id)}" ${unavailable ? 'title="Kursordner wurde nicht gefunden" disabled' : ''}>
        <span class="saved-course-icon ${isYoutube ? 'youtube' : 'folder'}${previewThumbnail ? ' has-thumbnail' : ''}" aria-hidden="true">${sourceEmoji}${previewThumbnail ? `<img src="${escapeHTML(previewThumbnail)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
        <div class="saved-course-main">
          <span class="saved-course-source">${source}</span>
          <h4>${escapeHTML(course.name)}</h4>
          <p>${unavailable ? 'Ordner nicht gefunden' : escapeHTML(course.rootFolder)}</p>
        </div>
        <div class="saved-course-progress">
          <strong>${Number(stats.percentage) || 0}%</strong>
          <span>${stats.completed || 0}/${stats.videos || 0} Videos</span>
          <div class="progress-track"><i style="width:${Number(stats.percentage) || 0}%"></i></div>
        </div>
        ${active ? '<span class="active-course-badge">AKTIV</span>' : '<span class="course-arrow">→</span>'}
      </button>
      ${unavailable ? '' : `<button class="saved-course-add-video" type="button" data-add-video-course-id="${escapeHTML(course.id)}" aria-expanded="${addVideoCourseId === course.id}" title="YouTube-Video zu diesem Kurs hinzufügen"><span>＋</span> Video</button>`}
      <button class="saved-course-remove" type="button" data-remove-course-id="${escapeHTML(course.id)}" aria-label="Videokurs aus Lunar entfernen" title="Nur aus Lunar entfernen – Videodateien bleiben erhalten">×</button>
      ${addVideoCourseId === course.id ? `<form class="add-video-form" data-add-video-form="${escapeHTML(course.id)}">
        <label for="addVideoUrl-${escapeHTML(course.id)}">NEUES VIDEO IMPORTIEREN</label>
        <div><input id="addVideoUrl-${escapeHTML(course.id)}" name="videoUrl" type="url" inputmode="url" placeholder="YouTube-Link zum Video einfügen …" autocomplete="off" required><button class="primary-button" type="submit">Hinzufügen</button></div>
      </form>` : ''}
    </div>`;
  }).join('');
  renderPlaylistQueue();
}

async function chooseCourseFolder() {
  try {
    state = await window.learningAPI.chooseFolder();
    render();
    closeCoursePicker();
    toast(`Videokurs „${state.libraryName || 'Kurs'}“ geöffnet.`);
  } catch (error) {
    toast(error.message || 'Videokurs konnte nicht geladen werden.');
  }
}

async function selectSavedCourse(id) {
  if (id === state.activeCourseId) {
    if (id === state.activeCourseId) closeCoursePicker();
    return;
  }
  try {
    state = await window.learningAPI.selectCourse(id);
    render();
    closeCoursePicker();
    toast(`Zu „${state.libraryName}“ gewechselt. Fortschritt wurde geladen.`);
  } catch (error) {
    toast(error.message || 'Videokurs konnte nicht geöffnet werden.');
  }
}


async function removeSavedCourse(id) {
  try {
    const course = (state.courses || []).find(item => item.id === id);
    state = await window.learningAPI.removeCourse(id);
    render();
    renderCoursePicker();
    toast(course ? `„${course.name}“ wurde aus Lunar entfernt. Die Videodateien bleiben erhalten.` : 'Videokurs wurde aus Lunar entfernt.');
  } catch (error) {
    toast(error.message || 'Videokurs konnte nicht entfernt werden.');
  }
}

function toggleAddVideo(courseId) {
  addVideoCourseId = addVideoCourseId === courseId ? '' : courseId;
  renderCoursePicker();
  if (addVideoCourseId) setTimeout(() => $(`[data-add-video-form="${CSS.escape(addVideoCourseId)}"] input`)?.focus(), 0);
}

async function addVideoToCourse(form) {
  if (playlistSubmitting) return;
  const courseId = String(form.dataset.addVideoForm || '');
  const urlInput = form.elements.videoUrl;
  const url = String(urlInput?.value || '').trim();
  if (!url) return urlInput?.focus();
  playlistSubmitting = true;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) { submit.disabled = true; submit.textContent = 'Wird vorgemerkt …'; }
  try {
    const result = await window.learningAPI.enqueueVideo({ courseId, url, quality: 'balanced' });
    if (result?.queue) setPlaylistQueue(result.queue);
    addVideoCourseId = '';
    renderCoursePicker();
    toast(result?.duplicate ? 'Dieses Video läuft bereits oder wartet schon.' : 'Video wird im Hintergrund zum Kurs hinzugefügt.');
  } catch (error) {
    toast(userErrorMessage(error, 'Video konnte nicht hinzugefügt werden.'));
    if (submit) { submit.disabled = false; submit.textContent = 'Hinzufügen'; }
  } finally {
    playlistSubmitting = false;
  }
}

function showYoutubePanel(focus = true) {
  $('#youtubePanel').hidden = false;
  renderPlaylistQueue();
  if (focus) setTimeout(() => $('#playlistUrl').focus(), 0);
}

function userErrorMessage(error, fallback = 'Playlist konnte nicht heruntergeladen werden.') {
  const raw = String(error?.message || fallback).trim();
  return raw
    .replace(/^Error invoking remote method .*?:\s*Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .slice(0, 900) || fallback;
}

function setPlaylistFormBusy(busy) {
  $('#downloadPlaylistButton').disabled = busy;
  $('#playlistUrl').disabled = busy;
  $('#playlistQuality').disabled = busy;
}

function playlistJobTitle(job = {}) {
  if (job.courseName) return String(job.courseName);
  if (job.playlistTitle) return String(job.playlistTitle);
  try {
    const parsed = new URL(String(job.url || ''));
    const list = parsed.searchParams.get('list');
    return list ? `YouTube-Playlist · ${list.slice(0, 16)}` : parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'YouTube-Playlist';
  }
}

function normalisePlaylistQueue(next = {}) {
  return {
    active: next?.active ? { ...next.active } : null,
    queued: Array.isArray(next?.queued) ? next.queued.map(item => ({ ...item })) : [],
    recent: Array.isArray(next?.recent) ? next.recent.map(item => ({ ...item })) : [],
    queuedCount: Math.max(0, Number(next?.queuedCount) || 0),
    totalCount: Math.max(0, Number(next?.totalCount) || 0)
  };
}

function renderBackgroundImportButton() {
  const button = $('#backgroundImportButton');
  const active = playlistQueueState.active;
  const queued = playlistQueueState.queued || [];
  const recent = playlistQueueState.recent || [];
  const latest = recent[0] || null;
  const subject = active || queued[0] || latest;
  if (!subject) {
    button.hidden = false;
    button.dataset.phase = 'idle';
    button.title = 'Import und Warteschlange öffnen';
    button.setAttribute('aria-label', 'Import und Warteschlange öffnen');
    return;
  }
  const isActive = Boolean(active);
  const isQueued = !active && queued.length > 0;
  const status = isActive ? 'running' : isQueued ? 'queued' : String(subject.status || 'done');
  const queuedSuffix = queued.length ? ` · +${queued.length}` : '';
  $('#backgroundImportLabel').textContent = isActive
    ? `IMPORT LÄUFT${queuedSuffix}`
    : isQueued
      ? `IMPORT WARTET${queuedSuffix}`
      : subject.status === 'done'
        ? 'IMPORT BEREIT'
        : subject.status === 'warning'
          ? 'IMPORT PRÜFEN'
        : subject.status === 'cancelled'
          ? 'IMPORT ABGEBROCHEN'
          : 'IMPORT HINWEIS';
  $('#backgroundImportText').textContent = String(subject.message || playlistJobTitle(subject));
  $('#backgroundImportPercent').textContent = subject.status === 'done' ? '✓' : ['warning', 'error', 'cancelled'].includes(subject.status) ? '!' : `${Math.round(Number(subject.percent) || 0)}%`;
  button.dataset.phase = status;
  button.title = active
    ? `${playlistJobTitle(active)}${queued.length ? ` · ${queued.length} weitere in der Warteschlange` : ''}`
    : String(subject.message || 'Importstatus öffnen');
  button.setAttribute('aria-label', button.title);
  button.hidden = false;
}

function queueItemMarkup(job, kind = '') {
  const status = String(job.status || kind || 'queued');
  const percent = Math.max(0, Math.min(100, Number(job.percent) || 0));
  const action = status === 'queued'
    ? `<button class="queue-item-action" type="button" data-cancel-playlist-id="${escapeHTML(job.id)}">Entfernen</button>`
    : ['done', 'warning'].includes(status) && job.courseId
      ? `<button class="queue-item-action" type="button" data-open-import-course-id="${escapeHTML(job.courseId)}">Öffnen</button>`
      : '';
  const stateLabel = status === 'running' ? 'LÄUFT' : status === 'queued' ? 'WARTET' : status === 'done' ? 'BEREIT' : status === 'warning' ? 'PRÜFEN' : status === 'cancelled' ? 'ABGEBROCHEN' : 'FEHLER';
  const thumbnailUrl = String(job.thumbnailUrl || '');
  const thumbnail = thumbnailUrl
    ? `<img src="${escapeHTML(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<article class="playlist-queue-item" data-status="${escapeHTML(status)}">
    <div class="queue-item-thumb" aria-hidden="true"><span>▶</span>${thumbnail}</div>
    <div class="queue-item-copy"><span>${stateLabel}</span><strong title="${escapeHTML(String(job.url || ''))}">${escapeHTML(playlistJobTitle(job))}</strong><small>${escapeHTML(String(job.message || ''))}</small><div class="queue-progress"><i style="width:${percent}%"></i></div></div>
    <div class="queue-item-side"><b>${status === 'done' ? '✓' : ['warning', 'error', 'cancelled'].includes(status) ? '!' : `${Math.round(percent)}%`}</b>${action}</div>
  </article>`;
}

function renderPlaylistQueue() {
  const active = playlistQueueState.active;
  const queued = playlistQueueState.queued || [];
  const recent = playlistQueueState.recent || [];
  const panel = $('#playlistQueuePanel');
  const items = [
    ...(active ? [{ ...active, status: 'running' }] : []),
    ...queued,
    ...recent.slice(0, 3)
  ];
  panel.hidden = items.length === 0;
  if (items.length) {
    const activeLabel = active ? `1 aktiv${queued.length ? ` · ${queued.length} wartet` : ''}` : queued.length ? `${queued.length} wartet` : 'Zuletzt';
    $('#playlistQueueSummary').textContent = activeLabel;
    $('#playlistQueueItems').innerHTML = items.map(job => queueItemMarkup(job)).join('');
  }
  renderBackgroundImportButton();
}

function setPlaylistQueue(next) {
  playlistQueueState = normalisePlaylistQueue(next);
  const active = playlistQueueState.active;
  if (active) updatePlaylistStatus({ running: true, phase: active.phase, message: active.message, percent: active.percent });
  renderPlaylistQueue();
}

function updatePlaylistStatus(payload = {}) {
  const running = Boolean(payload.running);
  const phase = String(payload.phase || '');
  const percent = Math.max(0, Math.min(100, Number(payload.percent) || 0));
  if (running || ['done', 'warning', 'error', 'cancelled'].includes(phase)) $('#playlistDownloadStatus').hidden = false;
  $('#playlistDownloadStatus').dataset.phase = phase;
  if (payload.message) $('#playlistStatusText').textContent = payload.message;
  $('#playlistStatusPercent').textContent = ['warning', 'error', 'cancelled'].includes(phase) ? '!' : `${Math.round(percent)}%`;
  $('#playlistStatusFill').style.width = `${percent}%`;
  const cancel = $('#cancelPlaylistButton');
  const cancellable = running && Boolean(playlistQueueState.active) && !['done', 'warning', 'error', 'cancelled'].includes(phase);
  cancel.hidden = !cancellable;
  cancel.disabled = phase === 'cancelling';
  cancel.textContent = phase === 'cancelling' ? 'Wird abgebrochen …' : 'Abbrechen';
}

async function downloadPlaylist() {
  if (playlistSubmitting) return;
  const url = $('#playlistUrl').value.trim();
  const quality = $('#playlistQuality').value;
  if (!url) {
    toast('Füge zuerst den YouTube-Playlist-Link ein.');
    $('#playlistUrl').focus();
    return;
  }
  playlistSubmitting = true;
  setPlaylistFormBusy(true);
  updatePlaylistStatus({ running: true, phase: 'queued', message: 'Playlist wird zur Warteschlange hinzugefügt …', percent: 0 });
  try {
    const result = await window.learningAPI.enqueuePlaylist({ url, quality });
    if (result?.queue) setPlaylistQueue(result.queue);
    $('#playlistUrl').value = '';
    if (result?.duplicate) {
      toast('Diese Playlist läuft bereits oder wartet schon in der Warteschlange.');
    } else {
      const position = Math.max(1, Number(result?.position) || 1);
      toast(position > 1 ? `Playlist vorgemerkt · Position ${position}.` : 'Playlist wird im Hintergrund vorbereitet.');
    }
  } catch (error) {
    const message = userErrorMessage(error);
    updatePlaylistStatus({ running: false, phase: 'error', message, percent: 100 });
    toast('Playlist konnte nicht geladen werden. Der Grund steht im Fenster.');
  } finally {
    playlistSubmitting = false;
    setPlaylistFormBusy(false);
  }
}

async function cancelPlaylistDownload(jobId = '') {
  const targetId = String(jobId || playlistQueueState.active?.id || '');
  const button = targetId === playlistQueueState.active?.id ? $('#cancelPlaylistButton') : null;
  if (button) {
    button.disabled = true;
    button.textContent = 'Wird abgebrochen …';
  }
  try {
    const result = await window.learningAPI.cancelPlaylistDownload(targetId);
    if (result?.queue) setPlaylistQueue(result.queue);
    if (!result?.cancelled) toast('Dieser Import konnte nicht mehr abgebrochen werden.');
  } catch {
    toast('Der Download konnte nicht automatisch abgebrochen werden.');
  }
}

function handlePlaylistProgress(payload = {}) {
  const active = playlistQueueState.active;
  if (active && (!payload.jobId || payload.jobId === active.id)) {
    if (payload.phase) active.phase = String(payload.phase);
    if (payload.message) active.message = String(payload.message);
    if (payload.playlistTitle) active.playlistTitle = String(payload.playlistTitle);
    if (payload.thumbnailUrl) active.thumbnailUrl = String(payload.thumbnailUrl);
    if (Number.isFinite(Number(payload.percent))) active.percent = Math.max(0, Math.min(100, Number(payload.percent)));
  }
  updatePlaylistStatus(payload);
  renderPlaylistQueue();
}

function openBackgroundImport() {
  openCoursePicker('import');
  showYoutubePanel(false);
}

async function refreshLibrary() {
  const button = $('#refreshButton');
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-label', 'Kurs wird aktualisiert');
    button.title = 'Kurs wird aktualisiert …';
  }
  try {
    state = await window.learningAPI.refreshLibrary();
    if (state.playlistVerification?.queue) setPlaylistQueue(state.playlistVerification.queue);
    render();
    const repaired = Number(state.repairReport?.repaired) || 0;
    const verifyingYoutube = Boolean(state.playlistVerification);
    if (repaired && verifyingYoutube) {
      toast(`${repaired} Video${repaired === 1 ? '' : 's'} zusammengeführt. YouTube prüft nur noch echte Lücken.`);
    } else if (repaired) {
      toast(`${repaired} Video${repaired === 1 ? '' : 's'} mit Bild und Ton zusammengeführt.`);
    } else if (verifyingYoutube) {
      toast('Bild und Ton sind geprüft. YouTube gleicht nur fehlende Videos ab.');
    } else {
      toast('Videokurs geprüft und aktualisiert.');
    }
  } catch (error) {
    toast(error.message || 'Videokurs konnte nicht aktualisiert werden.');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.setAttribute('aria-label', 'Kurs aktualisieren');
      button.title = 'Kurs aktualisieren';
    }
  }
}

function findVideo(id) { return state.videos.find(video => video.id === id); }

function nextVideoAfter(id) {
  const index = state.videos.findIndex(video => video.id === id);
  return index >= 0 && index < state.videos.length - 1 ? state.videos[index + 1] : null;
}

function renderNextVideo() {
  if (!activeVideo) return;
  const next = nextVideoAfter(activeVideo.id);
  const label = $('#nextVideoName');
  if (label) label.textContent = next ? next.name : 'Letztes Video im Kurs';
}

async function openVideo(id, options = {}) {
  const video = findVideo(id);
  if (!video?.fileUrl) return;
  if (!/\.(mp4|m4v|webm)$/i.test(video.relativePath || video.fileUrl)) {
    toast('Video wird einmalig für Lunar vorbereitet …');
    try {
      Object.assign(video, await window.learningAPI.preparePlayback(video.id));
    } catch (error) {
      toast(error.message || 'Das Video konnte nicht vorbereitet werden.');
      return;
    }
  }
  if (modalProgressFrame) {
    cancelAnimationFrame(modalProgressFrame);
    modalProgressFrame = 0;
  }
  activeVideo = video;
  manualControlDirty = false;
  pendingAutoplay = Boolean(options.autoplay);
  sessionRanges = [];
  playAnchor = null;
  lastTrackedTime = null;
  const playlistIndex = Math.round(Number(video.playlistIndex) || 0);
  $('#modalChapter').textContent = playlistIndex > 0 ? `VIDEO ${playlistIndex}` : String(video.chapter || 'VIDEO').toUpperCase();
  $('#modalTitle').textContent = video.name;
  $('#modalPath').textContent = state.libraryName || video.chapter || video.displayPath || video.relativePath;
  const player = $('#coursePlayer');
  player.src = video.fileUrl;
  showModal($('#videoModal'));
  window.learningAPI.setTaskbarPlayerState({ visible: true, playing: false });
  renderModalProgress();
  renderNextVideo();
  player.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
}

async function handleLoadedMetadata() {
  const player = $('#coursePlayer');
  if (!activeVideo) return;
  if (Number.isFinite(player.duration) && player.duration > 0) {
    activeVideo.duration = player.duration;
    const updated = await window.learningAPI.updateMetadata({ id: activeVideo.id, duration: player.duration });
    Object.assign(activeVideo, updated);
  }
  if ((activeVideo.resumePosition || 0) > 2 && (activeVideo.resumePosition || 0) < player.duration - 3) player.currentTime = activeVideo.resumePosition;
  renderModalProgress();
  if (pendingAutoplay) {
    pendingAutoplay = false;
    try { await player.play(); } catch { toast('Nächstes Video ist bereit – zum Starten auf Play drücken.'); }
  }
}

function extendSessionRange(time) {
  if (!activeVideo || !Number.isFinite(time) || time < 0) return;
  if (lastTrackedTime === null) { lastTrackedTime = time; return; }
  const delta = time - lastTrackedTime;
  if (delta > 0 && delta <= 2.2) sessionRanges.push([lastTrackedTime, time]);
  lastTrackedTime = time;
  if (sessionRanges.length > 30) sessionRanges = mergeRanges(sessionRanges, activeVideo.duration);
}

function scheduleProgressSave(immediate = false) {
  clearTimeout(progressSaveTimer);
  const run = () => saveProgress().catch(() => {});
  if (immediate) run();
  else progressSaveTimer = setTimeout(run, 900);
}

async function saveProgress() {
  if (!activeVideo) return;
  const player = $('#coursePlayer');
  const rangesToSave = mergeRanges(sessionRanges, activeVideo.duration);
  sessionRanges = [];
  try {
    const updated = await window.learningAPI.saveProgress({
      id: activeVideo.id,
      duration: Number.isFinite(player.duration) ? player.duration : activeVideo.duration,
      resumePosition: Number.isFinite(player.currentTime) ? player.currentTime : activeVideo.resumePosition,
      watchedRanges: rangesToSave
    });
    Object.assign(activeVideo, updated);
    renderModalProgress();
  } catch (error) {
    sessionRanges = mergeRanges([...rangesToSave, ...sessionRanges], activeVideo.duration);
    throw error;
  }
}

function renderModalProgress({ rebuildWatchedMap = true, updateManualControl = true } = {}) {
  if (!activeVideo) return;
  const player = $('#coursePlayer');
  const duration = Number(activeVideo.duration) || (Number.isFinite(player.duration) ? player.duration : 0);
  const ranges = mergeRanges([...(activeVideo.watchedRanges || []), ...sessionRanges], duration);
  const watched = ranges.reduce((sum,[a,b]) => sum + (b-a), 0);
  const pct = duration ? Math.min(100, Math.round((watched / duration) * 100)) : 0;
  $('#modalPercent').textContent = `${pct}%`;
  $('#modalTime').textContent = `Bis ${formatTime(watched)} angesehen`;
  const manual = $('#manualPosition');
  const manualInput = $('#manualTimeInput');
  if (updateManualControl) {
    const position = Math.max(0, Math.min(duration, Number.isFinite(player.currentTime) ? player.currentTime : Number(activeVideo.resumePosition) || 0));
    if (manual) {
      manual.max = String(Math.max(0, Math.floor(duration)));
      if (document.activeElement !== manual) manual.value = String(Math.round(position));
    }
    if (manualInput && document.activeElement !== manualInput) manualInput.value = formatTime(position);
    if ($('#manualTimeLabel')) $('#manualTimeLabel').textContent = formatTime(position);
  }
  if (!rebuildWatchedMap) {
    renderWatchedMap(ranges, duration);
    return;
  }
  renderWatchedMap(ranges, duration);
}

function renderWatchedMap(ranges, duration) {
  const map = $('#watchedMap');
  const visibleRanges = duration > 0 ? mergeRanges(ranges, duration) : [];
  const nodes = Array.from(map.querySelectorAll('.watched-range'));
  while (nodes.length > visibleRanges.length) nodes.pop().remove();
  while (nodes.length < visibleRanges.length) {
    const node = document.createElement('i');
    node.className = 'watched-range';
    map.appendChild(node);
    nodes.push(node);
  }
  if (!(duration > 0)) return;

  const mapWidth = Math.max(1, map.clientWidth);
  visibleRanges.forEach(([start, end], index) => {
    const left = Math.max(0, start / duration * 100);
    const width = Math.max(.35, (end - start) / duration * 100);
    const node = nodes[index];
    node.style.left = `${left}%`;
    node.style.width = `${width}%`;
    // Every visible part samples one shared course-wide gradient instead of
    // restarting orange -> yellow for each pause/resume segment.
    node.style.backgroundSize = `${mapWidth}px 100%`;
    node.style.backgroundPosition = `${-(start / duration) * mapWidth}px 0`;
  });
}

function queueLiveProgressRender() {
  if (!activeVideo || modalProgressFrame) return;
  modalProgressFrame = requestAnimationFrame(() => {
    modalProgressFrame = 0;
    // Keep the saved and currently playing ranges merged into one visual bar.
    renderModalProgress({ rebuildWatchedMap: false, updateManualControl: false });
  });
}

async function playNextVideo() {
  if (!activeVideo || advancingToNext) return;
  const currentId = activeVideo.id;
  const next = nextVideoAfter(currentId);
  if (!next) {
    await saveProgress().catch(() => {});
    state = await window.learningAPI.getState();
    render();
    renderNextVideo();
    toast('Kursende erreicht.');
    return;
  }

  advancingToNext = true;
  try {
    await saveProgress().catch(() => {});
    const current = findVideo(currentId);
    if (current) Object.assign(current, activeVideo);
    toast(`Als Nächstes: ${next.name}`);
    await openVideo(next.id, { autoplay: true });
  } finally {
    advancingToNext = false;
  }
}

async function closeVideo() {
  if (!activeVideo) { hideModal($('#videoModal')); return; }
  if (modalProgressFrame) {
    cancelAnimationFrame(modalProgressFrame);
    modalProgressFrame = 0;
  }
  await manualProgressPromise.catch(() => {});
  const player = $('#coursePlayer');
  extendSessionRange(player.currentTime);
  await saveProgress().catch(() => {});
  player.pause();
  player.removeAttribute('src');
  player.load();
  hideModal($('#videoModal'));
  window.learningAPI.setTaskbarPlayerState({ visible: false, playing: false });
  activeVideo = null;
  manualControlDirty = false;
  sessionRanges = [];
  state = await window.learningAPI.getState();
  render();
}

async function resetProgress() {
  if (!activeVideo) return;
  await manualProgressPromise.catch(() => {});
  const updated = await window.learningAPI.resetProgress(activeVideo.id);
  Object.assign(activeVideo, updated);
  sessionRanges = [];
  $('#coursePlayer').currentTime = 0;
  renderModalProgress();
  toast('Fortschritt zurückgesetzt.');
}

function applyManualProgress() {
  if (!activeVideo || !manualControlDirty) return manualProgressPromise;
  const duration = Number(activeVideo.duration) || 0;
  const entered = parseTimeInput($('#manualTimeInput').value);
  if (!Number.isFinite(entered)) {
    toast('Bitte einen gültigen Zeitstempel eingeben, zum Beispiel 12:30.');
    return manualProgressPromise;
  }
  const positionSeconds = Math.max(0, Math.min(duration, entered));
  const videoId = activeVideo.id;
  manualControlDirty = false;
  const save = async () => {
    const updated = await window.learningAPI.addManualProgress({ id: videoId, positionSeconds });
    if (!activeVideo || activeVideo.id !== videoId) return;
    Object.assign(activeVideo, updated);
    sessionRanges = [];
    $('#coursePlayer').currentTime = positionSeconds;
    renderModalProgress();
    toast(`Fortschritt automatisch auf ${formatTime(positionSeconds)} gesetzt.`);
  };
  manualProgressPromise = manualProgressPromise.then(save, save);
  return manualProgressPromise;
}

async function markComplete() {
  if (!activeVideo) return;
  await manualProgressPromise.catch(() => {});
  const updated = await window.learningAPI.markComplete(activeVideo.id);
  Object.assign(activeVideo, updated);
  sessionRanges = [];
  renderModalProgress();
  toast('Video als vollständig angesehen markiert.');
}

$('#activityButton').addEventListener('click', openActivityModal);
$('#activityClose').addEventListener('click', closeActivityModal);
$('#activityModal').addEventListener('click', event => { if (event.target === $('#activityModal')) closeActivityModal(); });
$('#calendarPrev').addEventListener('click', () => moveCalendarMonth(-1));
$('#calendarNext').addEventListener('click', () => moveCalendarMonth(1));
$('#calendarGrid').addEventListener('click', event => {
  const day = event.target.closest('[data-date]');
  if (!day) return;
  selectedActivityDate = day.dataset.date;
  renderActivityModal();
});
$('#activityTrend').addEventListener('click', event => {
  const day = event.target.closest('[data-date]');
  if (!day) return;
  selectedActivityDate = day.dataset.date;
  const date = dateFromKey(selectedActivityDate);
  calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
  renderActivityModal();
});
$('#chooseCourseButton').addEventListener('click', () => openCoursePicker('select'));
$('#importCourseButton').addEventListener('click', openBackgroundImport);
$('#backgroundImportButton').addEventListener('click', openBackgroundImport);
$('#coursePickerClose').addEventListener('click', closeCoursePicker);
$('#coursePickerModal').addEventListener('click', event => { if (event.target === $('#coursePickerModal')) closeCoursePicker(); });
$('#chooseFolderOption').addEventListener('click', chooseCourseFolder);
$('#youtubeOption').addEventListener('click', showYoutubePanel);
$('#downloadPlaylistButton').addEventListener('click', downloadPlaylist);
$('#cancelPlaylistButton').addEventListener('click', cancelPlaylistDownload);
$('#playlistUrl').addEventListener('keydown', event => { if (event.key === 'Enter') downloadPlaylist(); });
$('#playlistQueueItems').addEventListener('click', event => {
  const cancel = event.target.closest('[data-cancel-playlist-id]');
  if (cancel) {
    cancelPlaylistDownload(cancel.dataset.cancelPlaylistId);
    return;
  }
  const open = event.target.closest('[data-open-import-course-id]');
  if (open) selectSavedCourse(open.dataset.openImportCourseId);
});
$('#savedCourses').addEventListener('click', event => {
  const addVideo = event.target.closest('[data-add-video-course-id]');
  if (addVideo) {
    event.stopPropagation();
    toggleAddVideo(addVideo.dataset.addVideoCourseId);
    return;
  }
  const remove = event.target.closest('[data-remove-course-id]');
  if (remove) {
    event.stopPropagation();
    removeSavedCourse(remove.dataset.removeCourseId);
    return;
  }
  const card = event.target.closest('[data-course-id]');
  if (card && !card.disabled) selectSavedCourse(card.dataset.courseId);
});
$('#savedCourses').addEventListener('submit', event => {
  const form = event.target.closest('[data-add-video-form]');
  if (!form) return;
  event.preventDefault();
  addVideoToCourse(form);
});
$('#openStorageButton').addEventListener('click', () => window.learningAPI.openStorage());
$('#moveStorageButton').addEventListener('click', async () => {
  try {
    $('#moveStorageButton').disabled = true;
    state = await window.learningAPI.moveStorage();
    renderAll();
  } catch (error) {
    window.alert(error.message || 'Der Lunar-Ordner konnte nicht verschoben werden.');
  } finally {
    $('#moveStorageButton').disabled = false;
  }
});
$('#refreshButton').addEventListener('click', refreshLibrary);
$('#themeButton').addEventListener('click', async () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  await window.learningAPI.setTheme(state.theme);
  render();
});
$('#library').addEventListener('click', event => {
  const card = event.target.closest('[data-video-id]');
  if (card) openVideo(card.dataset.videoId);
});
$('#modalClose').addEventListener('click', closeVideo);
$('#videoModal').addEventListener('click', event => { if (event.target === $('#videoModal')) closeVideo(); });
$('#resetProgressButton').addEventListener('click', resetProgress);
$('#markCompleteButton').addEventListener('click', markComplete);
$('#manualPosition').addEventListener('input', event => {
  manualControlDirty = true;
  const seconds = Number(event.target.value) || 0;
  $('#manualTimeLabel').textContent = formatTime(seconds);
  $('#manualTimeInput').value = formatTime(seconds);
});
$('#manualPosition').addEventListener('change', applyManualProgress);
$('#manualTimeInput').addEventListener('input', event => {
  manualControlDirty = true;
  const seconds = parseTimeInput(event.target.value);
  if (!Number.isFinite(seconds)) return;
  const duration = Number(activeVideo?.duration) || 0;
  const position = Math.max(0, Math.min(duration, seconds));
  $('#manualPosition').value = String(Math.round(position));
  $('#manualTimeLabel').textContent = formatTime(position);
});
$('#manualTimeInput').addEventListener('blur', applyManualProgress);
$('#manualTimeInput').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.target.blur();
});

const player = $('#coursePlayer');
player.addEventListener('error', async () => {
  if (!activeVideo || player.dataset.fallback === activeVideo.id) return;
  player.dataset.fallback = activeVideo.id;
  toast('Codec wird für Lunar vorbereitet …');
  try {
    Object.assign(activeVideo, await window.learningAPI.preparePlayback(activeVideo.id, true));
    player.src = activeVideo.fileUrl;
    await player.play().catch(() => {});
  } catch (error) {
    toast(error.message || 'Dieses Video konnte nicht abgespielt werden.');
  }
});
player.addEventListener('play', () => { enableMaximumLoudness(); playAnchor = player.currentTime; lastTrackedTime = player.currentTime; window.learningAPI.setTaskbarPlayerState({ visible: true, playing: true }); syncPlayerControls(); });
player.addEventListener('timeupdate', () => { extendSessionRange(player.currentTime); syncPlayerControls(); queueLiveProgressRender(); scheduleProgressSave(); });
player.addEventListener('pause', () => { extendSessionRange(player.currentTime); window.learningAPI.setTaskbarPlayerState({ visible: Boolean(activeVideo), playing: false }); syncPlayerControls(); renderModalProgress(); scheduleProgressSave(true); });
player.addEventListener('seeking', () => { extendSessionRange(player.currentTime); lastTrackedTime = null; });
player.addEventListener('seeked', () => { lastTrackedTime = player.currentTime; syncPlayerControls(); renderModalProgress(); });
player.addEventListener('loadedmetadata', syncPlayerControls);
player.addEventListener('volumechange', syncPlayerControls);
player.addEventListener('ended', async () => { extendSessionRange(player.duration); await playNextVideo(); });
player.addEventListener('click', togglePlayerPlayback);
player.addEventListener('dblclick', togglePlayerFullscreen);
$('#playerPlay').addEventListener('click', togglePlayerPlayback);
$('#playerCenterPlay').addEventListener('click', togglePlayerPlayback);
$('#playerSeek').addEventListener('input', event => {
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  player.currentTime = Math.max(0, Math.min(duration, Number(event.target.value) || 0));
  syncPlayerControls();
});
$('#playerVolume').addEventListener('input', event => {
  player.muted = false;
  player.volume = Math.max(0, Math.min(1, Number(event.target.value) || 0));
  syncPlayerControls();
});
$('#playerMute').addEventListener('click', () => { player.muted = !player.muted; syncPlayerControls(); });
$('#playerPip').addEventListener('click', togglePictureInPicture);
$('#playerFullscreen').addEventListener('click', togglePlayerFullscreen);
document.addEventListener('fullscreenchange', () => $('#coursePlayer')?.closest('.player-shell')?.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement)));
window.learningAPI.onTaskbarPlayerCommand(command => {
  if (!activeVideo) return;
  if (command === 'toggle') {
    togglePlayerPlayback();
    return;
  }
  const direction = command === 'forward' ? 1 : command === 'back' ? -1 : 0;
  if (!direction) return;
  const duration = Number.isFinite(player.duration) ? player.duration : Number(activeVideo.duration) || 0;
  player.currentTime = Math.max(0, Math.min(duration, player.currentTime + (5 * direction)));
  syncPlayerControls();
});

window.addEventListener('keydown', event => {
  if (!$('#videoModal').hidden && ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code === 'Space' ? 'Space' : event.key)) {
    handlePlayerShortcut(event);
    return;
  }
  if (event.key !== 'Escape') return;
  if (!$('#videoModal').hidden) closeVideo();
  else if (!$('#coursePickerModal').hidden) closeCoursePicker();
  else if (!$('#activityModal').hidden) closeActivityModal();
}, true);
window.addEventListener('beforeunload', () => { if (activeVideo) scheduleProgressSave(true); });
window.learningAPI.onState(next => {
  state = next;
  if ($('#videoModal').hidden) render();
});
window.learningAPI.onPlaylistProgress(handlePlaylistProgress);
window.learningAPI.onPlaylistQueue(setPlaylistQueue);
window.learningAPI.onPreparePlaybackProgress(payload => toast(payload.message));

(async () => {
  const [nextState, queue] = await Promise.all([
    window.learningAPI.getState(),
    window.learningAPI.getPlaylistQueue()
  ]);
  state = nextState;
  setPlaylistQueue(queue);
  render();
})();
