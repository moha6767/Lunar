const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require('electron');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const APP_USER_MODEL_ID = 'com.affi.lunar';
app.setAppUserModelId(APP_USER_MODEL_ID);
app.setName('Lunar');
process.title = 'Lunar';

const applicationIcon = app.isPackaged
  ? path.join(process.resourcesPath, 'lunar-icon.ico')
  : path.join(__dirname, 'build', 'icon.ico');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.webm', '.m4v', '.avi', '.wmv', '.flv', '.ts', '.mts', '.m2ts', '.mpg', '.mpeg', '.vob', '.ogv', '.3gp']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_EXTENSION_PRIORITY = ['.webp', '.jpg', '.jpeg', '.png'];
const VIDEO_EXTENSION_PRIORITY = ['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.ts', '.mts', '.m2ts', '.mpg', '.mpeg', '.vob', '.ogv', '.3gp'];
const NATIVE_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm']);
const AUDIO_ONLY_YOUTUBE_FORMATS = new Set(['139', '140', '141', '249', '250', '251', '256', '258', '259', '260']);
const PLAYLIST_METADATA_FILE = '.lunar-playlist-metadata.json';
let mainWindow;
let state = { version: 3, theme: 'light', activeCourseId: '', courses: [], activity: [] };
let saveTimer;
let saveQueue = Promise.resolve();
let lastStateBackupAt = 0;
let playlistProcess = null;
let playlistCancelRequested = false;
let playlistJobs = [];
let activePlaylistJobId = '';
let playlistQueueRunner = null;
let youtubeSetupReady = null;
let localThumbnailFfmpegReady = null;
let customLunarRoot = '';

const taskbarIcons = {
  back: nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAC2SURBVDhPzZG9DcIwEIVdpnSZkhFSUlJmFEZwyRh0jMEIGYExKOlsvstdjCIbMEhIfNLJvvd8z/lx/0dKaUd11n5GjHHPsBBMKsDzti3BPMzjrCZl0DwXnGpeRkyZltWkGQa31KXmrRBTzzwOsQ8qZdoCqJ5bJ21XvA9g8EhdZV+h7QkIGJ+EtH8DVnmNs0qZ9oAF+kDQTa0vAgS0gRD5lS8Dll9WPYTeUYO1JZhehqmNSb/GuTsEYzz3p6SoSwAAAABJRU5ErkJggg==', 'base64')),
  play: nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACNSURBVDhP3ZKxDYAgEEUpHcHS0tIRLB3FMewcxVEcwxHcAHxnThIjBLAyvuRyBP69KGp+inOu0eU7EEzW2pXe6lYZIqBOEM20So/yYMALBCQbNehxGmZuggskC63WWBxCQYGAZKd1Gg1DIPYEea9C9iFgMP8yCXoBg+WfkwH5D3Zq1K0yEPRU+rY/gDEH4QnSjmMablgAAAAASUVORK5CYII=', 'base64')),
  pause: nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVDhPYxiG4P///w5A3ADFDrjEcAKoIhhowCWGE4AUQNSBwagBI9cAylIinQEDAwCOrELkuwTXjAAAAABJRU5ErkJggg==', 'base64')),
  forward: nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAC5SURBVDhP1ZIhEsIwFEQjkZVIZI+ARHIMJEeoxHGN3qJHQHIMJBKX8Db5VPBnMg1VvJk/2+7m77SF8H+klA7Mxm49hFu7dMQYz+RiMMtDeOHghHZmzSjTttQsj0KdoOTBHM3OfDKpWR6F5UyBkiuS3xltLxCU3JGe+a1AUPJCxnLX/gRP5MS0PwHLN6T/ypYV6AOancFaVsCifsK9WTPK8nqtQIsccH8igT/k9VpBDRY7LTM7s9YSwhsMQkDnthaUsQAAAABJRU5ErkJggg==', 'base64'))
};

function setTaskbarPlayerControls({ visible = false, playing = false } = {}) {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  if (!visible) {
    mainWindow.setThumbarButtons([]);
    return;
  }
  mainWindow.setThumbarButtons([
    { tooltip: '5 Sekunden zurück', icon: taskbarIcons.back, click: () => mainWindow.webContents.send('player:command', 'back') },
    { tooltip: playing ? 'Pause' : 'Wiedergabe', icon: playing ? taskbarIcons.pause : taskbarIcons.play, click: () => mainWindow.webContents.send('player:command', 'toggle') },
    { tooltip: '5 Sekunden vor', icon: taskbarIcons.forward, click: () => mainWindow.webContents.send('player:command', 'forward') }
  ]);
}

const STATE_BACKUP_INTERVAL = 60 * 60 * 1000;
const PLAYLIST_HISTORY_LIMIT = 8;

function lunarRoot() {
  return customLunarRoot || path.join(app.getPath('videos'), 'Lunar');
}

function storageLocationFile() {
  return path.join(app.getPath('userData'), 'lunar-storage-location.txt');
}

function loadStorageLocation() {
  try {
    const saved = fssync.readFileSync(storageLocationFile(), 'utf8').trim();
    if (saved) customLunarRoot = path.resolve(saved);
  } catch {}
}

function coursesRoot() {
  return path.join(lunarRoot(), 'Courses');
}

function legacyThumbnailRoot() {
  return path.join(lunarRoot(), 'Thumbnails');
}

function playbackRoot() {
  return path.join(lunarRoot(), 'Playback');
}

function dataFile() {
  return path.join(lunarRoot(), 'lunar-library.json');
}

function playlistQueueFile() {
  return path.join(lunarRoot(), 'lunar-download-queue.json');
}

function youtubeEngineStatusFile() {
  return path.join(lunarRoot(), 'youtube-engine.json');
}

function oldLunarDataFile() {
  return path.join(app.getPath('userData'), 'lunar-state.json');
}

function oldLunarThumbnailRoot() {
  return path.join(app.getPath('userData'), 'thumbnails');
}

function localVideoThumbnailRoot() {
  return path.join(app.getPath('userData'), 'local-video-thumbnails');
}

function legacyPassiveRoot() {
  return path.join(app.getPath('appData'), 'Passive Learning');
}

function legacyPassiveDataFile() {
  return path.join(legacyPassiveRoot(), 'passive-learning-state.json');
}

function legacyPassiveThumbnailRoot() {
  return path.join(legacyPassiveRoot(), 'thumbnails');
}

async function ensureStorage() {
  await fs.mkdir(coursesRoot(), { recursive: true });
}

function hash(value, length = 20) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, length);
}

function normalisePath(value) {
  try { return path.resolve(String(value || '')).toLowerCase(); } catch { return String(value || '').toLowerCase(); }
}

function idForCourse(rootFolder) {
  return `course-${hash(normalisePath(rootFolder), 18)}`;
}

function idForVideo(courseId, relativePath) {
  return hash(`${courseId}|${String(relativePath || '').replace(/\\/g, '/').toLowerCase()}`, 20);
}

function localFileUrl(filePath) {
  try {
    if (!filePath || !fssync.existsSync(filePath)) return '';
    return pathToFileURL(filePath).href + '?v=' + Math.round(fssync.statSync(filePath).mtimeMs);
  } catch {
    return '';
  }
}

function cleanRanges(ranges, duration = 0) {
  const max = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  const source = Array.isArray(ranges) ? ranges : [];
  const sorted = source
    .map(range => [Math.max(0, Number(range?.[0]) || 0), Math.min(max, Math.max(0, Number(range?.[1]) || 0))])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1.25) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.map(([start, end]) => [Number(start.toFixed(2)), Number(end.toFixed(2))]);
}

function watchedSeconds(video) {
  return cleanRanges(video.watchedRanges, video.duration).reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
}

function rangeSeconds(ranges, duration = 0) {
  return cleanRanges(ranges, duration).reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function safeActivityEntry(entry) {
  const thumbnailPath = String(entry?.thumbnailPath || thumbnailPathForVideoId(entry?.videoId) || '');
  return {
    id: String(entry?.id || ''),
    date: String(entry?.date || localDateKey(entry?.activityAt)),
    activityAt: String(entry?.activityAt || ''),
    courseId: String(entry?.courseId || ''),
    courseName: String(entry?.courseName || 'Videokurs'),
    videoId: String(entry?.videoId || ''),
    videoName: String(entry?.videoName || 'Video'),
    chapter: String(entry?.chapter || ''),
    watchedSeconds: Math.max(0, Number(entry?.watchedSeconds) || 0),
    completed: Boolean(entry?.completed),
    manualUpdate: Boolean(entry?.manualUpdate),
    thumbnailUrl: localFileUrl(thumbnailPath)
  };
}

function recordLearningActivity(course, video, { watched = 0, completed = false, manualUpdate = false } = {}) {
  const watchedDelta = Math.max(0, Number(watched) || 0);
  if (!course || !video || (watchedDelta <= 0 && !completed && !manualUpdate)) return;
  if (!Array.isArray(state.activity)) state.activity = [];
  const now = new Date();
  const date = localDateKey(now);
  const id = `${date}:${course.id}:${video.id}`;
  let entry = state.activity.find(item => item.id === id);
  if (!entry) {
    entry = {
      id,
      date,
      activityAt: now.toISOString(),
      courseId: course.id,
      courseName: course.name || path.basename(course.rootFolder || '') || 'Videokurs',
      videoId: video.id,
      videoName: video.name || 'Video',
      chapter: video.chapter || '',
      thumbnailPath: video.thumbnailPath || '',
      watchedSeconds: 0,
      completed: false,
      manualUpdate: false
    };
    state.activity.push(entry);
  }
  entry.activityAt = now.toISOString();
  entry.courseName = course.name || entry.courseName;
  entry.videoName = video.name || entry.videoName;
  entry.chapter = video.chapter || entry.chapter;
  entry.thumbnailPath = video.thumbnailPath || entry.thumbnailPath || '';
  entry.watchedSeconds = Math.max(0, Number(entry.watchedSeconds) || 0) + watchedDelta;
  entry.completed = Boolean(entry.completed || completed);
  entry.manualUpdate = Boolean(entry.manualUpdate || manualUpdate);
  state.activity.sort((a, b) => String(b.activityAt || '').localeCompare(String(a.activityAt || '')));
}

function activeCourse() {
  return state.courses.find(course => course.id === state.activeCourseId) || null;
}

function thumbnailPathForVideoId(videoId) {
  const id = String(videoId || '');
  if (!id) return '';
  for (const course of state.courses || []) {
    const video = (course.videos || []).find(item => String(item.id || '') === id);
    if (video?.thumbnailPath) return String(video.thumbnailPath);
  }
  return '';
}

function courseStats(course) {
  const videos = Array.isArray(course?.videos) ? course.videos.map(safeVideo) : [];
  const chapters = [...new Set(videos.map(video => video.chapter))];
  const totalDuration = videos.reduce((sum, video) => sum + video.duration, 0);
  const totalWatched = videos.reduce((sum, video) => sum + video.watchedSeconds, 0);
  const completed = videos.filter(video => video.completed).length;
  const percentage = videos.length
    ? Math.min(100, Math.round(videos.reduce((sum, video) => sum + video.percentage, 0) / videos.length))
    : 0;
  return {
    videos: videos.length,
    chapters: chapters.length,
    totalDuration,
    totalWatched,
    completed,
    percentage
  };
}

function safeVideo(video) {
  const duration = Math.max(0, Number(video.duration) || 0);
  const ranges = cleanRanges(video.watchedRanges, duration);
  const watched = ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
  const percentage = duration ? Math.min(100, Math.round((watched / duration) * 100)) : 0;
  const thumbnailPath = String(video.thumbnailPath || '');
  return {
    id: String(video.id),
    name: String(video.name || 'Video'),
    chapter: String(video.chapter || 'Kurs'),
    playlistIndex: Math.max(0, Number(video.playlistIndex) || 0),
    relativePath: String(video.relativePath || ''),
    displayPath: String(video.displayPath || video.relativePath || ''),
    filePath: String(video.filePath || ''),
    fileUrl: video.filePath && fssync.existsSync(video.filePath) ? pathToFileURL(video.filePath).href : '',
    size: Math.max(0, Number(video.size) || 0),
    modifiedAt: String(video.modifiedAt || ''),
    duration,
    resumePosition: Math.min(duration || Number.MAX_SAFE_INTEGER, Math.max(0, Number(video.resumePosition) || 0)),
    watchedRanges: ranges,
    watchedSeconds: watched,
    percentage,
    completed: duration > 0 && percentage >= 95,
    lastOpenedAt: String(video.lastOpenedAt || ''),
    thumbnailUrl: localFileUrl(thumbnailPath)
  };
}

function safeCourseSummary(course) {
  const stats = courseStats(course);
  const previewVideo = (Array.isArray(course.videos) ? course.videos : [])
    .find(video => video?.thumbnailPath && fssync.existsSync(video.thumbnailPath));
  return {
    id: String(course.id),
    name: String(course.name || path.basename(course.rootFolder || '') || 'Videokurs'),
    rootFolder: String(course.rootFolder || ''),
    sourceType: course.sourceType === 'youtube' ? 'youtube' : 'folder',
    sourceUrl: String(course.sourceUrl || ''),
    addedAt: String(course.addedAt || ''),
    lastOpenedAt: String(course.lastOpenedAt || ''),
    available: Boolean(course.rootFolder && fssync.existsSync(course.rootFolder)),
    previewThumbnailUrl: localFileUrl(String(previewVideo?.thumbnailPath || '')),
    stats
  };
}

function serialiseState() {
  const course = activeCourse();
  const videos = course ? course.videos.map(safeVideo) : [];
  return {
    version: 3,
    theme: state.theme === 'dark' ? 'dark' : 'light',
    activeCourseId: state.activeCourseId,
    rootFolder: course?.rootFolder || '',
    libraryName: course?.name || '',
    sourceType: course?.sourceType || '',
    sourceUrl: course?.sourceUrl || '',
    videos,
    stats: courseStats(course),
    courses: state.courses
      .map(safeCourseSummary)
      .sort((a, b) => String(b.lastOpenedAt || '').localeCompare(String(a.lastOpenedAt || ''))),
    activity: (Array.isArray(state.activity) ? state.activity : []).map(safeActivityEntry),
    storage: {
      root: lunarRoot(),
      coursesRoot: coursesRoot(),
      dataFile: dataFile()
    }
  };
}

function plainVideo(video) {
  return {
    id: video.id,
    name: video.name,
    chapter: video.chapter,
    playlistIndex: video.playlistIndex || 0,
    relativePath: video.relativePath,
    displayPath: video.displayPath || video.relativePath || '',
    filePath: video.filePath,
    thumbnailPath: video.thumbnailPath || '',
    size: video.size,
    modifiedAt: video.modifiedAt,
    duration: video.duration || 0,
    resumePosition: video.resumePosition || 0,
    watchedRanges: cleanRanges(video.watchedRanges, video.duration),
    lastOpenedAt: video.lastOpenedAt || ''
  };
}

function statePayload() {
  return {
    version: 3,
    theme: state.theme,
    activeCourseId: state.activeCourseId,
    activity: (Array.isArray(state.activity) ? state.activity : []).map(entry => ({
      id: entry.id, date: entry.date, activityAt: entry.activityAt, courseId: entry.courseId, courseName: entry.courseName,
      videoId: entry.videoId, videoName: entry.videoName, chapter: entry.chapter, thumbnailPath: entry.thumbnailPath || '', watchedSeconds: Number(entry.watchedSeconds) || 0,
      completed: Boolean(entry.completed), manualUpdate: Boolean(entry.manualUpdate)
    })),
    courses: state.courses.map(course => ({
      id: course.id,
      name: course.name,
      rootFolder: course.rootFolder,
      sourceType: course.sourceType === 'youtube' ? 'youtube' : 'folder',
      sourceUrl: course.sourceUrl || '',
      addedAt: course.addedAt || '',
      lastOpenedAt: course.lastOpenedAt || '',
      videos: (course.videos || []).map(plainVideo)
    }))
  };
}

async function writeFileAtomically(target, contents) {
  const temp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  let handle;
  try {
    handle = await fs.open(temp, 'w');
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle?.close();
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.rename(temp, target);
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 90 * (attempt + 1)));
    }
  }
  try { await fs.rm(temp, { force: true }); } catch {}
  throw lastError;
}

async function persistState(payload) {
  await ensureStorage();
  const target = dataFile();
  const backup = `${target}.backup`;
  const now = Date.now();
  if (fssync.existsSync(target) && now - lastStateBackupAt >= STATE_BACKUP_INTERVAL) {
    try {
      await fs.copyFile(target, backup);
      lastStateBackupAt = now;
    } catch {}
  }
  await writeFileAtomically(target, JSON.stringify(payload, null, 2));
}

function saveStateNow() {
  const payload = statePayload();
  saveQueue = saveQueue.catch(() => {}).then(() => persistState(payload));
  return saveQueue;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveStateNow().catch(console.error), 120);
}

function convertSingleCourseState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const rootFolder = typeof parsed.rootFolder === 'string' ? parsed.rootFolder : '';
  if (!rootFolder && !Array.isArray(parsed.videos)) return null;
  const id = idForCourse(rootFolder || `legacy-${Date.now()}`);
  const videos = Array.isArray(parsed.videos) ? parsed.videos.map(video => {
    const relativePath = String(video.relativePath || (video.filePath ? path.basename(video.filePath) : video.name || 'Video'));
    return {
      ...video,
      id: idForVideo(id, relativePath),
      relativePath,
      watchedRanges: cleanRanges(video.watchedRanges, video.duration)
    };
  }) : [];
  return {
    id,
    name: String(parsed.libraryName || (rootFolder ? path.basename(rootFolder) : 'Videokurs')),
    rootFolder,
    sourceType: 'folder',
    sourceUrl: '',
    addedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    videos
  };
}

async function migrateLegacyData() {
  await ensureStorage();
  if (fssync.existsSync(dataFile())) return;

  let parsed = null;
  for (const candidate of [
    { file: oldLunarDataFile() },
    { file: legacyPassiveDataFile() }
  ]) {
    if (!fssync.existsSync(candidate.file)) continue;
    try {
      parsed = JSON.parse(await fs.readFile(candidate.file, 'utf8'));
      break;
    } catch {}
  }

  if (!parsed) return;
  const course = convertSingleCourseState(parsed);
  state = {
    version: 3,
    theme: parsed.theme === 'dark' ? 'dark' : 'light',
    activeCourseId: course?.id || '',
    courses: course ? [course] : [],
    activity: Array.isArray(parsed.activity) ? parsed.activity : []
  };
  await saveStateNow();
}

async function readJsonFile(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function hydrateState(parsed) {
  if (Number(parsed?.version) >= 2 && Array.isArray(parsed.courses)) {
    state = {
      version: 3,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      activeCourseId: typeof parsed.activeCourseId === 'string' ? parsed.activeCourseId : '',
      courses: parsed.courses.map(course => ({
        id: String(course.id || idForCourse(course.rootFolder || `course-${Date.now()}`)),
        name: String(course.name || path.basename(course.rootFolder || '') || 'Videokurs'),
        rootFolder: String(course.rootFolder || ''),
        sourceType: course.sourceType === 'youtube' ? 'youtube' : 'folder',
        sourceUrl: String(course.sourceUrl || ''),
        addedAt: String(course.addedAt || ''),
        lastOpenedAt: String(course.lastOpenedAt || ''),
        videos: Array.isArray(course.videos) ? course.videos : []
      })),
      activity: Array.isArray(parsed.activity) ? parsed.activity : []
    };
    if (!state.courses.some(course => course.id === state.activeCourseId)) state.activeCourseId = state.courses[0]?.id || '';
    return false;
  }

  const course = convertSingleCourseState(parsed);
  state = {
    version: 3,
    theme: parsed?.theme === 'dark' ? 'dark' : 'light',
    activeCourseId: course?.id || '',
    courses: course ? [course] : [],
    activity: Array.isArray(parsed?.activity) ? parsed.activity : []
  };
  return true;
}

async function loadState() {
  await ensureStorage();
  const primary = dataFile();
  const backup = `${primary}.backup`;
  const parsed = await readJsonFile(primary);
  if (parsed) {
    if (hydrateState(parsed)) await saveStateNow();
    return;
  }

  const recovered = await readJsonFile(backup);
  if (recovered) {
    hydrateState(recovered);
    console.warn('Lunar hat die letzte intakte Bibliotheks-Sicherung wiederhergestellt.');
    await saveStateNow();
    return;
  }

  state = { version: 3, theme: 'light', activeCourseId: '', courses: [], activity: [] };
}

function mediaIdentity(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const originalStem = path.basename(fileName, extension);
  const technicalMatch = originalStem.match(/\.f(\d{2,4})(?:-\d+)?$/i);
  const logicalStem = technicalMatch ? originalStem.slice(0, technicalMatch.index) : originalStem;
  const playlistMatch = logicalStem.match(/^\s*(\d{1,5})\s*(?:[-–—_.])\s*(.+?)\s*$/);
  const playlistIndex = playlistMatch ? Number(playlistMatch[1]) : 0;
  const title = String(playlistMatch?.[2] || logicalStem || originalStem).trim();
  return {
    extension,
    originalStem,
    logicalStem,
    playlistIndex: Number.isFinite(playlistIndex) ? playlistIndex : 0,
    title: title || originalStem,
    technicalFormat: technicalMatch?.[1] || ''
  };
}

function cleanMetadataText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function metadataTitleKey(value) {
  return cleanMetadataText(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('de-DE')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function metadataDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

async function loadPlaylistMetadata(rootFolder) {
  const empty = { playlistTitle: '', byIndex: new Map(), byTitle: new Map() };
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(path.join(rootFolder, PLAYLIST_METADATA_FILE), 'utf8'));
  } catch {
    return empty;
  }

  const byIndex = new Map();
  const byTitle = new Map();
  for (const item of Array.isArray(parsed?.videos) ? parsed.videos : []) {
    const index = Math.max(0, Math.round(Number(item?.playlistIndex) || 0));
    const title = cleanMetadataText(item?.title);
    const duration = metadataDuration(item?.duration);
    if (!title && !duration) continue;
    const metadata = { title, duration };
    if (index > 0) byIndex.set(index, metadata);
    const key = metadataTitleKey(title);
    if (key && !byTitle.has(key)) byTitle.set(key, metadata);
  }

  return {
    playlistTitle: cleanMetadataText(parsed?.playlist?.title || parsed?.playlistTitle),
    byIndex,
    byTitle
  };
}

function playlistMetadataFor(identity, metadata) {
  if (!metadata) return null;
  const index = Math.max(0, Number(identity?.playlistIndex) || 0);
  if (index > 0 && metadata.byIndex.has(index)) return metadata.byIndex.get(index);
  const key = metadataTitleKey(identity?.title);
  return key ? metadata.byTitle.get(key) || null : null;
}

function thumbnailStemCandidates(identity) {
  return [...new Set([
    identity.originalStem,
    identity.logicalStem,
    identity.originalStem + '.lunar-thumbnail',
    identity.logicalStem + '.lunar-thumbnail'
  ].filter(Boolean))];
}

function thumbnailBesideVideo(imagesByName, identity) {
  for (const stem of thumbnailStemCandidates(identity)) {
    for (const extension of IMAGE_EXTENSION_PRIORITY) {
      const image = imagesByName.get((stem + extension).toLowerCase());
      if (image) return image;
    }
  }
  return '';
}

function folderThumbnail(imagesByName) {
  for (const stem of ['thumbnail', 'cover', 'folder']) {
    for (const extension of IMAGE_EXTENSION_PRIORITY) {
      const image = imagesByName.get((stem + extension).toLowerCase());
      if (image) return image;
    }
  }
  return '';
}

function isAudioOnlyYoutubeStream(identity) {
  return Boolean(identity.technicalFormat && AUDIO_ONLY_YOUTUBE_FORMATS.has(String(identity.technicalFormat)));
}

function presentationPriority(video) {
  const extensionRank = VIDEO_EXTENSION_PRIORITY.indexOf(video.extension);
  return [video.technicalFormat ? 1 : 0, extensionRank < 0 ? 99 : extensionRank, String(video.relativePath || '').toLowerCase()];
}

function isPreferredPresentation(candidate, current) {
  const left = presentationPriority(candidate);
  const right = presentationPriority(current);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] < right[index];
  }
  return false;
}

function choosePresentationVideos(candidates) {
  const byLogicalMedia = new Map();
  for (const candidate of candidates) {
    const key = String(candidate.mediaKey || candidate.relativePath || '').toLowerCase();
    const current = byLogicalMedia.get(key);
    if (!current || isPreferredPresentation(candidate, current)) byLogicalMedia.set(key, candidate);
  }
  return [...byLogicalMedia.values()];
}

function legacyThumbnailCandidates(video) {
  const id = String(video?.id || '');
  if (!id) return [];
  return [
    { file: path.join(legacyThumbnailRoot(), id + '.jpg'), removeAfterMigration: true },
    { file: path.join(oldLunarThumbnailRoot(), id + '.jpg'), removeAfterMigration: false },
    { file: path.join(legacyPassiveThumbnailRoot(), id + '.jpg'), removeAfterMigration: false }
  ];
}

async function migrateLegacyThumbnail(video) {
  if (!video?.filePath) return false;
  const source = legacyThumbnailCandidates(video).find(item => fssync.existsSync(item.file));
  if (!source) return false;

  if (video.thumbnailPath && fssync.existsSync(video.thumbnailPath)) {
    if (source.removeAfterMigration) await fs.rm(source.file, { force: true }).catch(() => {});
    return false;
  }

  const parsed = path.parse(video.filePath);
  const target = path.join(parsed.dir, parsed.name + '.lunar-thumbnail.jpg');
  try {
    if (!fssync.existsSync(target)) await fs.copyFile(source.file, target);
    if (!fssync.existsSync(target)) return false;
    video.thumbnailPath = target;
    if (source.removeAfterMigration) await fs.rm(source.file, { force: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function removeEmptyLegacyThumbnailFolder() {
  try { await fs.rmdir(legacyThumbnailRoot()); } catch {}
}

async function localThumbnailFfmpeg() {
  if (localThumbnailFfmpegReady) return localThumbnailFfmpegReady;
  localThumbnailFfmpegReady = (async () => {
    try {
      const system = await spawnCapture('ffmpeg', ['-version']);
      if (system.code === 0) return 'ffmpeg';
    } catch {}
    const python = await detectPython();
    return python ? findFfmpeg(python) : '';
  })();
  return localThumbnailFfmpegReady;
}

async function generateLocalVideoThumbnail(video, ffmpegLocation) {
  if (!video?.filePath || !ffmpegLocation || video.thumbnailPath) return false;
  const targetFolder = localVideoThumbnailRoot();
  const target = path.join(targetFolder, `${video.id}.jpg`);
  try {
    await fs.mkdir(targetFolder, { recursive: true });
    const sourceStat = await fs.stat(video.filePath);
    const targetStat = await fs.stat(target).catch(() => null);
    if (targetStat && targetStat.size >= 1024 && targetStat.mtimeMs >= sourceStat.mtimeMs) {
      video.thumbnailPath = target;
      return true;
    }

    const temporary = path.join(targetFolder, `${video.id}.${process.pid}.tmp.jpg`);
    const common = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', video.filePath,
      '-frames:v', '1',
      '-vf', "scale='min(640,iw)':-2:force_original_aspect_ratio=decrease",
      '-q:v', '3', temporary
    ];
    let result = await spawnCapture(ffmpegLocation, ['-ss', '5', ...common]);
    if (result.code !== 0 || !fssync.existsSync(temporary)) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      result = await spawnCapture(ffmpegLocation, ['-ss', '0.2', ...common]);
    }
    if (result.code !== 0 || !fssync.existsSync(temporary)) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      return false;
    }
    await fs.rename(temporary, target).catch(async () => {
      await fs.copyFile(temporary, target);
      await fs.rm(temporary, { force: true }).catch(() => {});
    });
    video.thumbnailPath = target;
    return true;
  } catch {
    return false;
  }
}

function durationFromFfmpegOutput(output = '') {
  const match = String(output).match(/Duration:\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

async function readLocalVideoDuration(video, ffmpegLocation) {
  if (!video?.filePath || !ffmpegLocation || Number(video.duration) > 0) return false;
  try {
    const result = await spawnCapture(ffmpegLocation, ['-hide_banner', '-i', video.filePath]);
    const duration = durationFromFfmpegOutput(`${result.stderr || ''}\n${result.stdout || ''}`);
    if (!(duration > 0)) return false;
    video.duration = duration;
    return true;
  } catch {
    return false;
  }
}

async function walkVideos(root, courseId, current = root, playlistMetadata = null, courseName = '') {
  let entries = [];
  try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return []; }
  const result = [];
  const imagesByName = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    imagesByName.set(entry.name.toLowerCase(), path.join(current, entry.name));
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      result.push(...await walkVideos(root, courseId, fullPath, playlistMetadata, courseName));
      continue;
    }
    if (!entry.isFile() || entry.name.startsWith('.') || !VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    try {
      const identity = mediaIdentity(entry.name);
      if (isAudioOnlyYoutubeStream(identity)) continue;
      const stat = await fs.stat(fullPath);
      const relative = path.relative(root, fullPath);
      const dir = path.dirname(relative);
      const metadata = playlistMetadataFor(identity, playlistMetadata);
      const displayCourseName = courseName || playlistMetadata?.playlistTitle || path.basename(root);
      const video = {
        id: idForVideo(courseId, relative),
        name: metadata?.title || identity.title,
        chapter: dir === '.' ? displayCourseName : dir,
        playlistIndex: identity.playlistIndex,
        relativePath: relative,
        displayPath: dir === '.' ? displayCourseName : `${displayCourseName} · ${dir}`,
        filePath: fullPath,
        thumbnailPath: thumbnailBesideVideo(imagesByName, identity) || folderThumbnail(imagesByName),
        mediaKey: path.join(dir, identity.logicalStem).toLowerCase(),
        extension: identity.extension,
        technicalFormat: identity.technicalFormat,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
      // Playlist durations come from the metadata request that already happens
      // before the download. This keeps cards complete without opening videos.
      if (metadata?.duration) video.duration = metadata.duration;
      result.push(video);
    } catch {}
  }
  return result;
}

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function scanCourse(course, { broadcast = true } = {}) {
  if (!course?.rootFolder || !fssync.existsSync(course.rootFolder)) return false;
  const previousByRelative = new Map((course.videos || []).map(video => [String(video.relativePath || '').replace(/\\/g, '/').toLowerCase(), video]));
  const playlistMetadata = await loadPlaylistMetadata(course.rootFolder);
  if (course.sourceType === 'youtube' && playlistMetadata.playlistTitle) course.name = playlistMetadata.playlistTitle;
  const discovered = choosePresentationVideos(await walkVideos(course.rootFolder, course.id, course.rootFolder, playlistMetadata, course.name));
  const collator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' });
  discovered.sort((a, b) => {
    const chapter = collator.compare(a.chapter, b.chapter);
    if (chapter) return chapter;
    const index = (a.playlistIndex || Number.MAX_SAFE_INTEGER) - (b.playlistIndex || Number.MAX_SAFE_INTEGER);
    return index || collator.compare(a.name, b.name);
  });
  course.videos = discovered.map(video => {
    const key = String(video.relativePath || '').replace(/\\/g, '/').toLowerCase();
    const old = previousByRelative.get(key);
    return old ? { ...old, ...video, id: video.id } : { ...video, duration: 0, resumePosition: 0, watchedRanges: [], lastOpenedAt: '' };
  });
  const hasLegacyCache = [legacyThumbnailRoot(), oldLunarThumbnailRoot(), legacyPassiveThumbnailRoot()].some(folder => fssync.existsSync(folder));
  if (hasLegacyCache) {
    await runWithConcurrency(course.videos, 4, migrateLegacyThumbnail);
    await removeEmptyLegacyThumbnailFolder();
  }
  const videosWithoutThumbnail = course.videos.filter(video => !video.thumbnailPath || !fssync.existsSync(video.thumbnailPath));
  const videosWithoutDuration = course.videos.filter(video => !(Number(video.duration) > 0));
  if (videosWithoutThumbnail.length || videosWithoutDuration.length) {
    const ffmpegLocation = await localThumbnailFfmpeg();
    if (ffmpegLocation) {
      if (videosWithoutThumbnail.length) await runWithConcurrency(videosWithoutThumbnail, 3, video => generateLocalVideoThumbnail(video, ffmpegLocation));
      if (videosWithoutDuration.length) await runWithConcurrency(videosWithoutDuration, 5, video => readLocalVideoDuration(video, ffmpegLocation));
    }
  }
  await saveStateNow();
  if (broadcast) broadcastState();
  return true;
}

async function addOrActivateCourse(rootFolder, options = {}) {
  if (!rootFolder || !fssync.existsSync(rootFolder)) throw new Error('Der ausgewählte Videokurs wurde nicht gefunden.');
  const activate = options.activate !== false;
  const normalized = normalisePath(rootFolder);
  let course = state.courses.find(item => normalisePath(item.rootFolder) === normalized);
  if (!course) {
    const now = new Date().toISOString();
    course = {
      id: idForCourse(rootFolder),
      name: String(options.name || path.basename(rootFolder) || 'Videokurs'),
      rootFolder,
      sourceType: options.sourceType === 'youtube' ? 'youtube' : 'folder',
      sourceUrl: String(options.sourceUrl || ''),
      addedAt: now,
      lastOpenedAt: now,
      videos: []
    };
    state.courses.push(course);
  } else {
    if (options.name) course.name = String(options.name);
    if (options.sourceType) course.sourceType = options.sourceType === 'youtube' ? 'youtube' : 'folder';
    if (options.sourceUrl) course.sourceUrl = String(options.sourceUrl);
    course.lastOpenedAt = new Date().toISOString();
  }
  if (activate) state.activeCourseId = course.id;
  await scanCourse(course, { broadcast: false });
  await saveStateNow();
  broadcastState();
  return course;
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:state', serialiseState());
}

function findVideo(id) {
  const course = activeCourse();
  return course?.videos?.find(video => video.id === id) || null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1020,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#f4efe8',
    icon: applicationIcon,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: state.theme === 'dark' ? '#f8f5f0' : '#1d1c1a',
      height: 46
    },
    title: 'Lunar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.loadFile('index.html');
}

function activePlaylistJob() {
  return playlistJobs.find(job => job.id === activePlaylistJobId) || null;
}

function publicPlaylistJob(job) {
  if (!job) return null;
  return {
    id: String(job.id || ''),
    url: String(job.url || ''),
    quality: String(job.quality || 'balanced'),
    status: String(job.status || 'queued'),
    phase: String(job.phase || ''),
    message: String(job.message || ''),
    percent: Math.max(0, Math.min(100, Number(job.percent) || 0)),
    queuedAt: String(job.queuedAt || ''),
    startedAt: String(job.startedAt || ''),
    finishedAt: String(job.finishedAt || ''),
    courseId: String(job.courseId || ''),
    courseName: String(job.courseName || ''),
    playlistTitle: String(job.playlistTitle || ''),
    thumbnailUrl: String(job.thumbnailUrl || '')
  };
}

function playlistQueueSnapshot() {
  const active = activePlaylistJob();
  const queued = playlistJobs.filter(job => job.status === 'queued');
  const recent = playlistJobs
    .filter(job => ['done', 'warning', 'error', 'cancelled'].includes(job.status))
    .slice(-PLAYLIST_HISTORY_LIMIT)
    .reverse();
  return {
    active: publicPlaylistJob(active),
    queued: queued.map(publicPlaylistJob),
    recent: recent.map(publicPlaylistJob),
    queuedCount: queued.length,
    totalCount: (active ? 1 : 0) + queued.length
  };
}

function persistPlaylistQueue() {
  try {
    fssync.mkdirSync(path.dirname(playlistQueueFile()), { recursive: true });
    const target = playlistQueueFile();
    const temporary = `${target}.${process.pid}.tmp`;
    fssync.writeFileSync(temporary, JSON.stringify({ version: 1, jobs: playlistJobs }, null, 2), 'utf8');
    fssync.renameSync(temporary, target);
  } catch (error) {
    console.warn('Lunar konnte die Download-Warteschlange nicht speichern:', error.message);
  }
}

function loadPlaylistQueue() {
  try {
    const parsed = JSON.parse(fssync.readFileSync(playlistQueueFile(), 'utf8'));
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    playlistJobs = jobs
      .filter(job => job && typeof job.url === 'string' && isYouTubeUrl(job.url))
      .map(job => ({
        ...job,
        status: ['done', 'warning', 'error', 'cancelled'].includes(job.status) ? job.status : 'queued',
        phase: ['done', 'warning', 'error', 'cancelled'].includes(job.status) ? job.phase : 'queued',
        message: ['done', 'warning', 'error', 'cancelled'].includes(job.status)
          ? String(job.message || '')
          : 'Wird nach dem Neustart fortgesetzt …',
        percent: ['done', 'warning', 'error', 'cancelled'].includes(job.status) ? Number(job.percent) || 0 : 0,
        startedAt: ['done', 'warning', 'error', 'cancelled'].includes(job.status) ? String(job.startedAt || '') : '',
        finishedAt: ['done', 'warning', 'error', 'cancelled'].includes(job.status) ? String(job.finishedAt || '') : ''
      }));
    trimPlaylistHistory();
  } catch {
    playlistJobs = [];
  }
}

function broadcastPlaylistQueue() {
  persistPlaylistQueue();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('playlist:queue', playlistQueueSnapshot());
}

function trimPlaylistHistory() {
  const finished = playlistJobs.filter(job => ['done', 'warning', 'error', 'cancelled'].includes(job.status));
  if (finished.length <= PLAYLIST_HISTORY_LIMIT) return;
  const removable = finished.slice(0, finished.length - PLAYLIST_HISTORY_LIMIT);
  const ids = new Set(removable.map(job => job.id));
  playlistJobs = playlistJobs.filter(job => !ids.has(job.id));
}

function sendPlaylistProgress(payload = {}) {
  const job = activePlaylistJob();
  const percent = Number(payload.percent);
  if (job) {
    if (payload.phase) job.phase = String(payload.phase);
    if (typeof payload.message === 'string' && payload.message) job.message = payload.message;
    if (typeof payload.playlistTitle === 'string' && payload.playlistTitle) job.playlistTitle = payload.playlistTitle;
    if (typeof payload.thumbnailUrl === 'string' && payload.thumbnailUrl) job.thumbnailUrl = payload.thumbnailUrl;
    if (Number.isFinite(percent)) job.percent = Math.max(0, Math.min(100, percent));
  }
  const eventPayload = job
    ? { ...payload, jobId: job.id, queuedCount: playlistJobs.filter(item => item.status === 'queued').length }
    : payload;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('playlist:progress', eventPayload);
}

function normalisePlaylistQuality(value) {
  return ['compact', 'balanced', 'high', 'audiobook'].includes(value) ? value : 'balanced';
}

function createPlaylistJob(url, requestedQuality = 'balanced', targetCourseId = '') {
  const cleanUrl = String(url || '').trim();
  if (!isYouTubeUrl(cleanUrl)) throw new Error('Bitte füge einen gültigen YouTube-Link ein.');
  const targetCourse = targetCourseId ? state.courses.find(course => course.id === String(targetCourseId)) : null;
  if (targetCourseId && (!targetCourse || !targetCourse.rootFolder || !fssync.existsSync(targetCourse.rootFolder))) {
    throw new Error('Der ausgewählte Videokurs wurde nicht gefunden.');
  }
  const duplicate = playlistJobs.find(job => ['queued', 'running'].includes(job.status) && job.url === cleanUrl && job.targetCourseId === String(targetCourseId || ''));
  if (duplicate) {
    return { duplicate: true, job: publicPlaylistJob(duplicate), queue: playlistQueueSnapshot(), position: null };
  }
  const job = {
    id: `playlist-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
    url: cleanUrl,
    quality: normalisePlaylistQuality(String(requestedQuality || 'balanced')),
    status: 'queued',
    phase: 'queued',
    message: 'Wartet auf den nächsten freien Download-Platz …',
    percent: 0,
    queuedAt: new Date().toISOString(),
    startedAt: '',
    finishedAt: '',
    courseId: '',
    courseName: String(targetCourse?.name || ''),
    targetCourseId: String(targetCourseId || ''),
    targetCourseName: String(targetCourse?.name || ''),
    targetFolder: String(targetCourse?.rootFolder || ''),
    playlistTitle: '',
    thumbnailUrl: ''
  };
  playlistJobs.push(job);
  const position = playlistJobs.filter(item => item.status === 'queued').findIndex(item => item.id === job.id) + 1 + (activePlaylistJob() ? 1 : 0);
  broadcastPlaylistQueue();
  void processPlaylistQueue();
  return { duplicate: false, job: publicPlaylistJob(job), queue: playlistQueueSnapshot(), position };
}

async function processPlaylistQueue() {
  if (playlistQueueRunner) return playlistQueueRunner;
  playlistQueueRunner = (async () => {
    while (true) {
      const job = playlistJobs.find(item => item.status === 'queued');
      if (!job) break;
      activePlaylistJobId = job.id;
      playlistCancelRequested = false;
      job.status = 'running';
      job.phase = 'setup';
      job.message = 'Import wird vorbereitet …';
      job.startedAt = new Date().toISOString();
      broadcastPlaylistQueue();
      try {
        const result = await runPlaylistDownloader(job.url, job.quality, job.targetFolder, job.targetCourseId);
        const imported = result?.importedCourse || {};
        const warningCount = Math.max(0, Number(result?.warningCount) || 0);
        job.status = warningCount ? 'warning' : 'done';
        job.phase = job.status;
        job.percent = 100;
        job.courseId = String(imported.id || '');
        job.courseName = String(imported.name || '');
        job.message = String(result?.statusMessage || (job.courseName ? `„${job.courseName}“ ist bereit.` : 'Playlist ist bereit.'));
        job.finishedAt = new Date().toISOString();
        sendPlaylistProgress({ running: false, phase: job.phase, message: job.message, percent: 100 });
      } catch (error) {
        const message = String(error?.message || 'Die Playlist konnte nicht heruntergeladen werden.');
        const cancelled = playlistCancelRequested || /^Download abgebrochen/i.test(message);
        job.status = cancelled ? 'cancelled' : 'error';
        job.phase = job.status;
        job.message = message;
        job.finishedAt = new Date().toISOString();
        sendPlaylistProgress({ running: false, phase: job.phase, message, percent: job.percent || 0 });
      } finally {
        activePlaylistJobId = '';
        playlistCancelRequested = false;
        trimPlaylistHistory();
        broadcastPlaylistQueue();
      }
    }
  })().finally(() => {
    playlistQueueRunner = null;
    if (playlistJobs.some(job => job.status === 'queued')) void processPlaylistQueue();
  });
  return playlistQueueRunner;
}

function spawnCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout = appendLimited(stdout, chunk.toString(), 512 * 1024); });
    child.stderr?.on('data', chunk => { stderr = appendLimited(stderr, chunk.toString(), 512 * 1024); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function detectPython() {
  const candidates = process.platform === 'win32'
    ? [{ cmd: 'py', prefix: ['-3'] }, { cmd: 'python', prefix: [] }]
    : [{ cmd: 'python3', prefix: [] }, { cmd: 'python', prefix: [] }];
  for (const candidate of candidates) {
    try {
      const result = await spawnCapture(candidate.cmd, [...candidate.prefix, '-c', 'import sys; print(sys.executable)']);
      if (result.code === 0) return candidate;
    } catch {}
  }
  return null;
}

function conciseProcessOutput(result, limit = 620) {
  const raw = `${result?.stderr || ''}\n${result?.stdout || ''}`
    .replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return raw.length > limit ? `…${raw.slice(-limit)}` : raw;
}

async function inspectYtDlp(python) {
  try {
    const result = await spawnCapture(python.cmd, [
      ...python.prefix,
      '-c', 'import yt_dlp, yt_dlp_ejs, imageio_ffmpeg; print(yt_dlp.version.__version__)'
    ]);
    if (result.code === 0) return {
      ready: result.code === 0,
      version: result.code === 0 ? String(result.stdout || '').trim() : '',
      detail: conciseProcessOutput(result),
      enginePath: ''
    };
    const standalone = standaloneYtDlpFile();
    if (fssync.existsSync(standalone)) {
      const standaloneResult = await spawnCapture(python.cmd, [...python.prefix, standalone, '--version']);
      if (standaloneResult.code === 0) return {
        ready: true,
        version: String(standaloneResult.stdout || '').trim(),
        detail: '',
        enginePath: standalone
      };
    }
    return { ready: false, version: '', detail: conciseProcessOutput(result), enginePath: '' };
  } catch (error) {
    return { ready: false, version: '', detail: error.message || '', enginePath: '' };
  }
}

function standaloneYtDlpFile() {
  return path.join(lunarRoot(), 'engine', 'yt-dlp');
}

function downloadFile(url, target, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error('Zu viele Weiterleitungen beim Laden der YouTube-Engine.'));
      return;
    }
    const request = https.get(url, { headers: { 'User-Agent': 'Lunar/2.0.0' } }, response => {
      const location = response.headers.location;
      if (location && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        downloadFile(new URL(location, url).toString(), target, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download der YouTube-Engine fehlgeschlagen (HTTP ${response.statusCode}).`));
        return;
      }
      const stream = fssync.createWriteStream(target);
      response.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
      stream.on('error', reject);
    });
    request.setTimeout(60000, () => request.destroy(new Error('Zeitüberschreitung beim Laden der YouTube-Engine.')));
    request.on('error', reject);
  });
}

async function ensureStandaloneYtDlp(python) {
  const target = standaloneYtDlpFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', temporary);
    const result = await spawnCapture(python.cmd, [...python.prefix, temporary, '--version']);
    if (result.code !== 0) throw new Error(conciseProcessOutput(result) || 'Die geladene YouTube-Engine ist ungültig.');
    try { await fs.unlink(target); } catch {}
    await fs.rename(temporary, target);
  } finally {
    try { await fs.unlink(temporary); } catch {}
  }
}

async function ensureYtDlp(python, { forceUpdate = false } = {}) {
  if (youtubeSetupReady && !forceUpdate) return youtubeSetupReady;

  const installed = await inspectYtDlp(python);
  const setup = await readJsonFile(youtubeEngineStatusFile());
  const checkedAt = Date.parse(String(setup?.checkedAt || '')) || 0;
  const refreshDue = !checkedAt || Date.now() - checkedAt > 3 * 24 * 60 * 60 * 1000;
  if (installed.ready && !forceUpdate && !refreshDue) {
    youtubeSetupReady = installed;
    return installed;
  }

  sendPlaylistProgress({ running: true, phase: 'setup', message: installed.ready ? 'YouTube-Engine wird kurz aktualisiert …' : 'YouTube-Engine wird eingerichtet …', percent: 0 });
  let result;
  try {
    result = await spawnCapture(python.cmd, [
      ...python.prefix,
      '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--upgrade-strategy', 'only-if-needed', '-U', 'yt-dlp[default]', 'imageio-ffmpeg'
    ]);
  } catch (error) {
    result = { code: 1, stdout: '', stderr: error.message || '' };
  }

  let checked = await inspectYtDlp(python);
  if (!checked.ready) {
    sendPlaylistProgress({ running: true, phase: 'setup', message: 'Portable YouTube-Engine wird geladen …', percent: 0 });
    try {
      await ensureStandaloneYtDlp(python);
      checked = await inspectYtDlp(python);
    } catch (error) {
      result.stderr = `${result.stderr || ''}\n${error.message || ''}`;
    }
  }
  if (!checked.ready) {
    const detail = conciseProcessOutput(result) || checked.detail;
    throw new Error(`Lunars YouTube-Engine konnte nicht eingerichtet werden.${detail ? ` ${detail}` : ''}`);
  }

  // A temporary pip/network error must not block a working existing engine.
  if (result.code !== 0 && installed.ready) {
    sendPlaylistProgress({ running: true, phase: 'setup', message: 'Vorhandene YouTube-Engine wird verwendet …', percent: 0 });
  }
  try {
    await writeFileAtomically(youtubeEngineStatusFile(), JSON.stringify({ checkedAt: new Date().toISOString(), version: checked.version }, null, 2));
  } catch {}
  youtubeSetupReady = checked;
  return checked;
}

function versionTuple(value) {
  const match = String(value || '').match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  return match ? [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)] : [0, 0, 0];
}

function versionAtLeast(value, minimum) {
  const current = versionTuple(value);
  for (let i = 0; i < 3; i += 1) {
    if (current[i] > minimum[i]) return true;
    if (current[i] < minimum[i]) return false;
  }
  return true;
}

async function detectJsRuntime() {
  const candidates = [
    { name: 'deno', cmd: 'deno', args: ['--version'], minimum: [2, 3, 0] }
  ];
  const foundUnsupported = [];
  for (const candidate of candidates) {
    try {
      const result = await spawnCapture(candidate.cmd, candidate.args);
      if (result.code !== 0) continue;
      const versionText = `${result.stdout || ''} ${result.stderr || ''}`.trim();
      if (versionAtLeast(versionText, candidate.minimum)) return { name: candidate.name, version: versionText.split(/\r?\n/)[0] || '' };
      foundUnsupported.push(`${candidate.name} ${versionText.split(/\r?\n/)[0] || ''}`.trim());
    } catch {}
  }
  return {
    name: '',
    version: '',
    warning: foundUnsupported.length
      ? `JavaScript-Runtime zu alt (${foundUnsupported.join(', ')})`
      : 'Deno 2.3+ wurde nicht gefunden'
  };
}

async function findFfmpeg(python) {
  try {
    const result = await spawnCapture('ffmpeg', ['-version']);
    if (result.code === 0) return 'ffmpeg';
  } catch {}
  try {
    const result = await spawnCapture(python.cmd, [
      ...python.prefix,
      '-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
    ]);
    const candidate = String(result.stdout || '').trim().split(/\r?\n/).pop();
    if (result.code === 0 && candidate && fssync.existsSync(candidate)) return candidate;
  } catch {}
  return '';
}

function playlistHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'playlist_downloader_lunar.py')
    : path.join(__dirname, 'playlist_downloader_lunar.py');
}

async function repairLocalCourseMedia(course) {
  const empty = { repaired: 0, cleaned: 0, remaining: 0, errors: [] };
  if (!course?.rootFolder || !fssync.existsSync(course.rootFolder)) return empty;
  const python = await detectPython();
  if (!python) throw new Error('Python wurde nicht gefunden. Die Bild- und Tonspuren konnten nicht geprüft werden.');
  const ffmpegLocation = await findFfmpeg(python);
  if (!ffmpegLocation) throw new Error('ffmpeg wurde nicht gefunden. Die Bild- und Tonspuren konnten nicht zusammengeführt werden.');
  const helper = playlistHelperPath();
  if (!fssync.existsSync(helper)) throw new Error('Lunars Medienreparatur fehlt.');
  const result = await spawnCapture(python.cmd, [
    ...python.prefix,
    helper,
    '--repair',
    course.rootFolder,
    ffmpegLocation
  ]);
  const report = parseJsonMarker(result.stdout, 'LUNAR_REPAIR=');
  if (result.code !== 0 || !report) {
    throw new Error(conciseProcessOutput(result) || 'Bild und Ton konnten nicht automatisch geprüft werden.');
  }
  return { ...empty, ...report };
}

function parseJsonMarker(output, marker) {
  const lines = String(output || '').split(/\r?\n/).reverse();
  const line = lines.find(item => item.startsWith(marker));
  if (!line) return null;
  try { return JSON.parse(line.slice(marker.length)); } catch { return null; }
}

function appendLimited(text, chunk, limit = 160 * 1024) {
  const next = `${text}${chunk}`;
  return next.length > limit ? next.slice(-limit) : next;
}

function isYouTubeUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host);
  } catch {
    return false;
  }
}

function stopPlaylistDownload(jobId = '') {
  const job = activePlaylistJob();
  if (!job || (jobId && job.id !== String(jobId))) return false;
  playlistCancelRequested = true;
  sendPlaylistProgress({ running: true, phase: 'cancelling', message: 'Download wird abgebrochen …' });
  if (playlistProcess) {
    try { playlistProcess.kill(); } catch {}
  }
  return true;
}

async function runPlaylistDownloader(url, requestedQuality = 'balanced', targetFolder = '', targetCourseId = '') {
  if (playlistProcess) throw new Error('Es wird bereits eine YouTube-Playlist heruntergeladen.');
  if (!isYouTubeUrl(url)) throw new Error('Bitte füge einen gültigen YouTube-Playlist-Link ein.');
  const quality = normalisePlaylistQuality(requestedQuality);
  await ensureStorage();
  if (playlistCancelRequested) throw new Error('Download abgebrochen. Bereits vollständig geladene Videos bleiben im Kursordner erhalten.');

  const python = await detectPython();
  if (!python) throw new Error('Python wurde nicht gefunden. Installiere Python oder starte Lunar auf einem PC mit Python.');
  const engine = await ensureYtDlp(python);
  if (playlistCancelRequested) throw new Error('Download abgebrochen. Bereits vollständig geladene Videos bleiben im Kursordner erhalten.');
  const jsRuntime = await detectJsRuntime();
  if (!jsRuntime.name) {
    throw new Error('Deno 2.3+ wurde nicht gefunden. Installiere Deno mit „winget install DenoLand.Deno“, schließe Lunar vollständig und starte die App danach neu.');
  }
  const ffmpegLocation = await findFfmpeg(python);
  if (playlistCancelRequested) throw new Error('Download abgebrochen. Bereits vollständig geladene Videos bleiben im Kursordner erhalten.');
  const ffmpegAvailable = Boolean(ffmpegLocation);
  const runtimeLabel = jsRuntime.name
    ? `${jsRuntime.name}${jsRuntime.version ? ` ${jsRuntime.version.replace(/^v/i, '')}` : ''}`
    : 'Deno fehlt';
  sendPlaylistProgress({
    running: true,
    phase: 'setup',
    message: `YouTube-Engine ${engine.version || 'bereit'} · ${runtimeLabel}${ffmpegAvailable ? '' : ' · ohne ffmpeg'}`,
    percent: 0
  });

  const helper = playlistHelperPath();
  if (!fssync.existsSync(helper)) throw new Error('Lunars YouTube-Downloader fehlt.');
  if (playlistCancelRequested) throw new Error('Download abgebrochen. Bereits vollständig geladene Videos bleiben im Kursordner erhalten.');

  sendPlaylistProgress({ running: true, phase: 'metadata', message: 'Playlist wird gelesen …', percent: 0 });

  return new Promise((resolve, reject) => {
    if (playlistCancelRequested) {
      reject(new Error('Download abgebrochen. Bereits vollständig geladene Videos bleiben im Kursordner erhalten.'));
      return;
    }
    const args = [
      ...python.prefix,
      helper,
      url,
      coursesRoot(),
      lunarRoot(),
      app.getPath('downloads'),
      jsRuntime.name,
      ffmpegLocation || '0',
      quality,
      targetFolder || ''
    ];
    const child = spawn(python.cmd, args, {
      windowsHide: true,
      env: { ...process.env, LUNAR_YTDLP_PATH: engine.enginePath || '' }
    });
    playlistProcess = child;
    let stdout = '';
    let stderr = '';
    let buffer = '';
    let settled = false;

    const clearProcess = () => {
      if (playlistProcess === child) playlistProcess = null;
    };
    const fail = message => {
      if (settled) return;
      settled = true;
      clearProcess();
      sendPlaylistProgress({ running: false, phase: 'error', message });
      reject(new Error(message));
    };
    const processLine = line => {
      if (!line || !line.startsWith('LUNAR_PROGRESS=')) return;
      const payload = parseJsonMarker(line, 'LUNAR_PROGRESS=');
      if (payload) sendPlaylistProgress({ running: true, ...payload });
    };

    child.stdout?.on('data', chunk => {
      const text = chunk.toString();
      stdout = appendLimited(stdout, text);
      buffer = appendLimited(buffer, text, 32 * 1024);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) processLine(line.trim());
    });
    child.stderr?.on('data', chunk => { stderr = appendLimited(stderr, chunk.toString()); });
    child.on('error', error => fail(error.message || 'Der YouTube-Downloader konnte nicht gestartet werden.'));
    child.on('close', async code => {
      if (settled) return;
      if (buffer.trim()) processLine(buffer.trim());
      clearProcess();
      if (playlistCancelRequested) {
        fail('Download abgebrochen. Bereits vollständig geladene Videos bleiben im Kursordner erhalten.');
        return;
      }
      if (code !== 0) {
        const detail = parseJsonMarker(stdout, 'LUNAR_ERROR=')?.message || conciseProcessOutput({ stdout, stderr }) || 'Die Playlist konnte nicht heruntergeladen werden.';
        fail(detail);
        return;
      }
      const result = parseJsonMarker(stdout, 'LUNAR_RESULT=');
      if (!result?.course_folder || !fssync.existsSync(result.course_folder)) {
        fail('Die Playlist wurde verarbeitet, aber der Kursordner konnte nicht gefunden werden.');
        return;
      }
      try {
        // A playlist may finish while the user is learning in another course.
        // Preserve that active course; only open the new one automatically when
        // Lunar had no course open at all.
        const activateImportedCourse = !targetCourseId && !state.activeCourseId;
        const importedCourse = await addOrActivateCourse(result.course_folder, {
          name: targetCourseId ? (state.courses.find(course => course.id === targetCourseId)?.name || path.basename(result.course_folder)) : (result.course_name || path.basename(result.course_folder)),
          sourceType: targetCourseId ? (state.courses.find(course => course.id === targetCourseId)?.sourceType || 'folder') : 'youtube',
          sourceUrl: targetCourseId ? (state.courses.find(course => course.id === targetCourseId)?.sourceUrl || '') : url,
          activate: activateImportedCourse
        });
        settled = true;
        sendPlaylistProgress({ running: false, phase: 'done', message: result.status_message || 'Playlist ist bereit.', percent: 100 });
        resolve({
          ...serialiseState(),
          statusMessage: String(result.status_message || 'Playlist ist bereit.'),
          warningCount: Math.max(0, Number(result.warning_count) || 0),
          importedCourse: {
            id: importedCourse.id,
            name: importedCourse.name,
            activated: activateImportedCourse
          }
        });
      } catch (error) {
        fail(error.message || 'Der Kurs konnte nach dem Download nicht geöffnet werden.');
      }
    });
  });
}

ipcMain.handle('library:get-state', async () => serialiseState());

ipcMain.handle('library:choose-folder', async () => {
  await saveStateNow();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Videokurs auswählen',
    defaultPath: coursesRoot(),
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return serialiseState();
  await addOrActivateCourse(result.filePaths[0], { sourceType: 'folder' });
  return serialiseState();
});

ipcMain.handle('library:select-course', async (_event, id) => {
  await saveStateNow();
  const course = state.courses.find(item => item.id === String(id || ''));
  if (!course) throw new Error('Der Videokurs wurde nicht gefunden.');
  if (!course.rootFolder || !fssync.existsSync(course.rootFolder)) throw new Error('Der gespeicherte Kursordner existiert nicht mehr. Wähle ihn erneut über „Ordner auswählen“ aus.');
  state.activeCourseId = course.id;
  course.lastOpenedAt = new Date().toISOString();
  await scanCourse(course, { broadcast: false });
  await saveStateNow();
  broadcastState();
  return serialiseState();
});


ipcMain.handle('library:remove-course', async (_event, id) => {
  await saveStateNow();
  const courseId = String(id || '');
  const index = state.courses.findIndex(item => item.id === courseId);
  if (index < 0) throw new Error('Der Videokurs wurde nicht gefunden.');
  const wasActive = state.activeCourseId === courseId;
  state.courses.splice(index, 1);
  if (wasActive) {
    const next = state.courses.find(item => item.rootFolder && fssync.existsSync(item.rootFolder)) || state.courses[0] || null;
    state.activeCourseId = next?.id || '';
    if (next?.rootFolder && fssync.existsSync(next.rootFolder)) {
      next.lastOpenedAt = new Date().toISOString();
      await scanCourse(next, { broadcast: false });
    }
  }
  await saveStateNow();
  broadcastState();
  return serialiseState();
});

ipcMain.handle('library:refresh', async () => {
  const course = activeCourse();
  let repairReport = { repaired: 0, cleaned: 0, remaining: 0, errors: [] };
  let playlistVerification = null;
  if (course) {
    repairReport = await repairLocalCourseMedia(course);
    await scanCourse(course);
    if (course.sourceType === 'youtube' && isYouTubeUrl(course.sourceUrl)) {
      playlistVerification = createPlaylistJob(course.sourceUrl, 'balanced');
    }
  }
  return { ...serialiseState(), repairReport, playlistVerification };
});

ipcMain.handle('library:open-storage', async () => {
  await ensureStorage();
  return shell.openPath(lunarRoot());
});

ipcMain.handle('library:move-storage', async () => {
  if (playlistJobs.some(job => job.status === 'running')) {
    throw new Error('Warte, bis der laufende Download beendet oder abgebrochen ist. Danach kannst du den Speicherort verschieben.');
  }
  const oldRoot = lunarRoot();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Neuen Lunar-Speicherordner auswählen',
    defaultPath: path.dirname(oldRoot),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Hierher verschieben'
  });
  if (result.canceled || !result.filePaths[0]) return serialiseState();

  const newRoot = path.resolve(result.filePaths[0]);
  if (normalisePath(newRoot) === normalisePath(oldRoot)) return serialiseState();
  if (normalisePath(newRoot).startsWith(`${normalisePath(oldRoot)}${path.sep}`)) {
    throw new Error('Der neue Speicherordner darf nicht im bisherigen Lunar-Ordner liegen.');
  }
  if ((await fs.readdir(newRoot)).length) throw new Error('Bitte wähle einen leeren Ordner. So werden keine vorhandenen Dateien überschrieben.');

  await saveStateNow();
  await fs.rm(newRoot, { recursive: true });
  try {
    await fs.rename(oldRoot, newRoot);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.cp(oldRoot, newRoot, { recursive: true, errorOnExist: true });
    await fs.rm(oldRoot, { recursive: true });
  }

  const movePath = value => {
    const resolved = path.resolve(String(value || ''));
    return normalisePath(resolved).startsWith(`${normalisePath(oldRoot)}${path.sep}`)
      ? path.join(newRoot, path.relative(oldRoot, resolved))
      : value;
  };
  for (const course of state.courses) {
    course.rootFolder = movePath(course.rootFolder);
    for (const video of course.videos || []) {
      video.filePath = movePath(video.filePath);
      video.thumbnailPath = movePath(video.thumbnailPath);
    }
  }
  customLunarRoot = newRoot;
  await fs.mkdir(path.dirname(storageLocationFile()), { recursive: true });
  await writeFileAtomically(storageLocationFile(), newRoot);
  await saveStateNow();
  broadcastState();
  return serialiseState();
});

ipcMain.handle('playlist:get-queue', async () => playlistQueueSnapshot());

ipcMain.handle('playlist:enqueue', async (_event, payload = {}) => {
  const url = String(payload.url || '').trim();
  return createPlaylistJob(url, String(payload.quality || 'balanced'));
});

ipcMain.handle('video:enqueue-import', async (_event, payload = {}) => {
  const url = String(payload.url || '').trim();
  const courseId = String(payload.courseId || '');
  if (!courseId) throw new Error('Wähle zuerst einen Videokurs aus.');
  return createPlaylistJob(url, String(payload.quality || 'balanced'), courseId);
});

// Kept for older renderer builds that may still be running during an update.
ipcMain.handle('playlist:download', async (_event, payload = {}) => {
  const url = String(payload.url || '').trim();
  return createPlaylistJob(url, String(payload.quality || 'balanced'));
});

ipcMain.handle('playlist:cancel', async (_event, jobId = '') => {
  const targetId = String(jobId || '');
  const queued = playlistJobs.find(job => job.id === targetId && job.status === 'queued');
  if (queued) {
    queued.status = 'cancelled';
    queued.phase = 'cancelled';
    queued.message = 'Aus der Warteschlange entfernt.';
    queued.finishedAt = new Date().toISOString();
    trimPlaylistHistory();
    broadcastPlaylistQueue();
    return { cancelled: true, queue: playlistQueueSnapshot() };
  }
  return { cancelled: stopPlaylistDownload(targetId), queue: playlistQueueSnapshot() };
});

ipcMain.handle('video:prepare-playback', async (event, payload) => {
  const id = typeof payload === 'object' ? payload.id : payload;
  const force = Boolean(payload && typeof payload === 'object' && payload.force);
  const video = findVideo(String(id || ''));
  if (!video) throw new Error('Video wurde nicht gefunden.');
  if (!force && NATIVE_VIDEO_EXTENSIONS.has(path.extname(video.filePath).toLowerCase())) return safeVideo(video);

  event.sender.send('video:prepare-progress', { id: video.id, message: 'FFmpeg wird gestartet …', percent: 0 });
  const ffmpegLocation = await localThumbnailFfmpeg();
  if (!ffmpegLocation) throw new Error('Dieses Video benötigt FFmpeg. Installiere FFmpeg, damit Lunar alle Formate abspielen kann.');
  const targetFolder = playbackRoot();
  await fs.mkdir(targetFolder, { recursive: true });
  const target = path.join(targetFolder, `${video.id}.mp4`);
  const temporary = path.join(targetFolder, `.${video.id}.${process.pid}.tmp.mp4`);
  const source = await fs.stat(video.filePath);
  const existing = await fs.stat(target).catch(() => null);
  if (!existing?.size || existing.mtimeMs < source.mtimeMs) {
    if (existing) await fs.rm(target, { force: true });
    const result = await new Promise((resolve, reject) => {
      const child = spawn(ffmpegLocation, [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', video.filePath,
        '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
        '-progress', 'pipe:1', '-nostats', temporary
      ], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let progressBuffer = '';
      child.stdout.on('data', chunk => {
        const text = chunk.toString();
        stdout = appendLimited(stdout, text);
        progressBuffer += text;
        const lines = progressBuffer.split(/\r?\n/);
        progressBuffer = lines.pop() || '';
        for (const line of lines) {
          const match = line.match(/^out_time_(?:ms|us)=(\d+)$/);
          if (!match) continue;
          const seconds = Number(match[1]) / 1_000_000;
          const percent = video.duration > 0 ? Math.min(99, Math.round(seconds / video.duration * 100)) : 0;
          event.sender.send('video:prepare-progress', {
            id: video.id,
            percent,
            message: percent ? `Video wird vorbereitet … ${percent}%` : `Video wird vorbereitet … ${Math.round(seconds)} Sek.`
          });
        }
      });
      child.stderr.on('data', chunk => { stderr = appendLimited(stderr, chunk.toString()); });
      child.on('error', reject);
      child.on('close', code => resolve({ code, stdout, stderr }));
    });
    const converted = await fs.stat(temporary).catch(() => null);
    if (result.code !== 0 || !converted?.size) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw new Error(conciseProcessOutput(result) || 'Das Video konnte nicht in ein kompatibles Format umgewandelt werden.');
    }
    await fs.rename(temporary, target);
  }

  event.sender.send('video:prepare-progress', { id: video.id, message: 'Video ist bereit.', percent: 100 });
  return safeVideo({ ...video, filePath: target, extension: '.mp4' });
});

ipcMain.handle('video:update-metadata', async (_event, payload = {}) => {
  const video = findVideo(String(payload.id || ''));
  if (!video) throw new Error('Video wurde nicht gefunden.');
  const duration = Math.max(0, Number(payload.duration) || 0);
  if (duration && Math.abs(duration - Number(video.duration || 0)) > 0.1) {
    video.duration = duration;
    video.resumePosition = Math.min(video.resumePosition || 0, duration);
    video.watchedRanges = cleanRanges(video.watchedRanges, duration);
    scheduleSave();
  }
  return safeVideo(video);
});

ipcMain.handle('video:save-progress', async (_event, payload = {}) => {
  const course = activeCourse();
  const video = findVideo(String(payload.id || ''));
  if (!video || !course) throw new Error('Video wurde nicht gefunden.');
  const wasCompleted = safeVideo(video).completed;
  if (Number(payload.duration) > 0) video.duration = Number(payload.duration);
  const sessionRanges = cleanRanges(Array.isArray(payload.watchedRanges) ? payload.watchedRanges : [], video.duration);
  const sessionSeconds = rangeSeconds(sessionRanges, video.duration);
  video.resumePosition = Math.max(0, Number(payload.resumePosition) || 0);
  video.lastOpenedAt = new Date().toISOString();
  video.watchedRanges = cleanRanges([...(video.watchedRanges || []), ...sessionRanges], video.duration);
  const isCompleted = safeVideo(video).completed;
  recordLearningActivity(course, video, { watched: sessionSeconds, completed: !wasCompleted && isCompleted });
  await saveStateNow();
  return safeVideo(video);
});

ipcMain.handle('video:reset-progress', async (_event, id) => {
  const video = findVideo(String(id || ''));
  if (!video) throw new Error('Video wurde nicht gefunden.');
  video.resumePosition = 0;
  video.watchedRanges = [];
  video.lastOpenedAt = '';
  await saveStateNow();
  broadcastState();
  return safeVideo(video);
});

ipcMain.handle('video:add-manual-progress', async (_event, payload = {}) => {
  const course = activeCourse();
  const video = findVideo(String(payload.id || ''));
  if (!video || !course) throw new Error('Video wurde nicht gefunden.');
  const wasCompleted = safeVideo(video).completed;
  const duration = Math.max(0, Number(video.duration) || 0);
  const positionSeconds = Math.max(0, Math.min(duration, Number(payload.positionSeconds) || 0));
  if (duration > 0) {
    video.watchedRanges = positionSeconds > 0 ? [[0, positionSeconds]] : [];
    video.resumePosition = positionSeconds;
    video.lastOpenedAt = new Date().toISOString();
    const isCompleted = safeVideo(video).completed;
    recordLearningActivity(course, video, { completed: !wasCompleted && isCompleted, manualUpdate: true });
    await saveStateNow();
    broadcastState();
  }
  return safeVideo(video);
});

ipcMain.handle('video:mark-complete', async (_event, id) => {
  const course = activeCourse();
  const video = findVideo(String(id || ''));
  if (!video || !course) throw new Error('Video wurde nicht gefunden.');
  const wasCompleted = safeVideo(video).completed;
  if (Number(video.duration) > 0) video.watchedRanges = [[0, Number(video.duration)]];
  video.resumePosition = Number(video.duration) || 0;
  video.lastOpenedAt = new Date().toISOString();
  recordLearningActivity(course, video, { completed: !wasCompleted && safeVideo(video).completed, manualUpdate: true });
  await saveStateNow();
  broadcastState();
  return safeVideo(video);
});

ipcMain.handle('settings:get-theme', async () => state.theme === 'dark' ? 'dark' : 'light');
ipcMain.on('player:taskbar-state', (_event, payload = {}) => setTaskbarPlayerControls(payload));
ipcMain.handle('settings:set-theme', async (_event, theme) => {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: state.theme === 'dark' ? '#f8f5f0' : '#1d1c1a',
      height: 46
    });
  }
  await saveStateNow();
  broadcastState();
  return state.theme;
});

app.whenReady().then(async () => {
  loadStorageLocation();
  await ensureStorage();
  await migrateLegacyData();
  await loadState();
  loadPlaylistQueue();
  const course = activeCourse();
  if (course?.rootFolder && fssync.existsSync(course.rootFolder)) await scanCourse(course, { broadcast: false });
  createWindow();
  if (playlistJobs.some(job => job.status === 'queued')) void processPlaylistQueue();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  if (saveTimer) clearTimeout(saveTimer);
  // A normal close stops the child process, but never loses the job. The
  // downloader will continue it from its .part file on the next launch.
  const running = playlistJobs.find(job => job.status === 'running');
  if (running) {
    running.status = 'queued';
    running.phase = 'queued';
    running.message = 'Wird beim nächsten Start fortgesetzt …';
    running.startedAt = '';
    running.finishedAt = '';
    activePlaylistJobId = '';
  }
  persistPlaylistQueue();
  if (playlistProcess) { try { playlistProcess.kill(); } catch {} }
  try {
    fssync.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const target = dataFile();
    const temp = `${target}.${process.pid}.shutdown.tmp`;
    fssync.writeFileSync(temp, JSON.stringify(statePayload(), null, 2), 'utf8');
    fssync.renameSync(temp, target);
  } catch {}
});
