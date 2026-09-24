const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('learningAPI', {
  getState: () => ipcRenderer.invoke('library:get-state'),
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  selectCourse: id => ipcRenderer.invoke('library:select-course', id),
  removeCourse: id => ipcRenderer.invoke('library:remove-course', id),
  refreshLibrary: () => ipcRenderer.invoke('library:refresh'),
  openStorage: () => ipcRenderer.invoke('library:open-storage'),
  moveStorage: () => ipcRenderer.invoke('library:move-storage'),
  getPlaylistQueue: () => ipcRenderer.invoke('playlist:get-queue'),
  enqueuePlaylist: payload => ipcRenderer.invoke('playlist:enqueue', payload),
  enqueueVideo: payload => ipcRenderer.invoke('video:enqueue-import', payload),
  // Kept for a renderer that was open while Lunar is being updated.
  downloadPlaylist: payload => ipcRenderer.invoke('playlist:download', payload),
  cancelPlaylistDownload: jobId => ipcRenderer.invoke('playlist:cancel', jobId),
  preparePlayback: (id, force = false) => ipcRenderer.invoke('video:prepare-playback', { id, force }),
  updateMetadata: payload => ipcRenderer.invoke('video:update-metadata', payload),
  saveProgress: payload => ipcRenderer.invoke('video:save-progress', payload),
  resetProgress: id => ipcRenderer.invoke('video:reset-progress', id),
  markComplete: id => ipcRenderer.invoke('video:mark-complete', id),
  addManualProgress: payload => ipcRenderer.invoke('video:add-manual-progress', payload),
  getTheme: () => ipcRenderer.invoke('settings:get-theme'),
  setTheme: theme => ipcRenderer.invoke('settings:set-theme', theme),
  setTaskbarPlayerState: payload => ipcRenderer.send('player:taskbar-state', payload),
  onTaskbarPlayerCommand: callback => ipcRenderer.on('player:command', (_event, command) => callback(command)),
  onState: callback => ipcRenderer.on('library:state', (_event, next) => callback(next)),
  onPlaylistProgress: callback => ipcRenderer.on('playlist:progress', (_event, payload) => callback(payload)),
  onPlaylistQueue: callback => ipcRenderer.on('playlist:queue', (_event, queue) => callback(queue)),
  onPreparePlaybackProgress: callback => ipcRenderer.on('video:prepare-progress', (_event, payload) => callback(payload))
});
