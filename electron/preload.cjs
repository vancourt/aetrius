const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Session
  connectSession: (provider, url) => ipcRenderer.invoke('session:connect', { provider, url }),
  disconnectSession: (provider) => ipcRenderer.invoke('session:disconnect', provider),
  getSessionStatus: () => ipcRenderer.invoke('session:status'),

  // Messages
  sendMessage: (text, providers) => ipcRenderer.invoke('message:send', { text, providers }),
  forwardMessage: (fromProvider, text) => ipcRenderer.invoke('message:forward', { fromProvider, text }),
  requestDeepSeek: (prompt, model) => ipcRenderer.invoke('deepseek:request', { prompt, model }),
  consolidateDeepSeek: (prompt, model) => ipcRenderer.invoke('deepseek:request', { prompt, model }),
  pollMessages: () => ipcRenderer.invoke('message:poll'),
  cleanDOM: (keepCount) => ipcRenderer.invoke('message:clean_dom', { keepCount }),

  // History
  getHistory: (limit, offset) => ipcRenderer.invoke('history:get', { limit, offset }),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Projects
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (name) => ipcRenderer.invoke('project:create', name),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id)
})
