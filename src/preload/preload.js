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

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (changes) => ipcRenderer.invoke('settings:update', changes),

  // Windows
  openWindow: (name) => ipcRenderer.invoke('window:open', name),
});
