'use strict';

// The only bridge between the pages and the main process. Keep it small.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winlog', {
  platform: process.platform,
  getTodayWins: () => ipcRenderer.invoke('wins:today'),
  addWins: (text) => ipcRenderer.invoke('wins:add', text),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (changes) => ipcRenderer.invoke('settings:update', changes),
});
