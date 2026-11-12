'use strict';

// The only bridge between the pages and the main process. Keep it small.
// Every call is checked again in src/main/ipc.js; nothing here is trusted.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winlog', {
  platform: process.platform,

  // Wins
  getTodayWins: () => ipcRenderer.invoke('wins:today'),
  listWins: () => ipcRenderer.invoke('wins:list'),
  addWins: (text) => ipcRenderer.invoke('wins:add', text),
  editWin: (id, text) => ipcRenderer.invoke('wins:edit', id, text),
  deleteWin: (id) => ipcRenderer.invoke('wins:delete', id),
  /** Calls `callback` whenever wins are added, edited, deleted or imported. */
  onWinsChanged: (callback) => {
    ipcRenderer.on('wins:changed', () => callback());
  },

  // Export: the options are { preset, from, to, format, includeDates }
  previewExport: (options) => ipcRenderer.invoke('export:preview', options),
  copyExport: (options) => ipcRenderer.invoke('export:copy', options),
  saveExport: (options) => ipcRenderer.invoke('export:save', options),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (changes) => ipcRenderer.invoke('settings:update', changes),

  // Your data. Files and folders are always picked in a dialog shown by the app.
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  exportBackup: () => ipcRenderer.invoke('data:export-backup'),
  importBackup: () => ipcRenderer.invoke('data:import-backup'),
  chooseBackupFolder: () => ipcRenderer.invoke('data:choose-backup-folder'),
  clearBackupFolder: () => ipcRenderer.invoke('data:clear-backup-folder'),

  // App and windows
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  /** name: 'releases' | 'issues' | 'website'. Opens in the user's browser. */
  openLink: (name) => ipcRenderer.invoke('link:open', name),
  /** name: 'entry' | 'wins' | 'export' | 'settings' | 'about' */
  openWindow: (name) => ipcRenderer.invoke('window:open', name),
});
