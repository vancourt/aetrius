const isElectron = !!window.api

const mock = {
  connectSession: async () => ({ success: false, error: 'Not running in Electron' }),
  disconnectSession: async () => ({ success: true }),
  getSessionStatus: async () => ({ chatgpt: { connected: false, messageCount: 0 }, gemini: { connected: false, messageCount: 0 } }),
  sendMessage: async () => ({}),
  forwardMessage: async () => ({ success: false, error: 'Not running in Electron' }),
  requestDeepSeek: async () => ({ success: false, error: 'Not running in Electron' }),
  consolidateDeepSeek: async () => ({ success: false, error: 'Not running in Electron' }),
  pollMessages: async () => [],
  cleanDOM: async () => {},
  getHistory: async () => [],
  clearHistory: async () => {},
  listProjects: async () => [],
  createProject: async () => ({}),
  deleteProject: async () => {}
}

export const api = isElectron ? window.api : mock
export { isElectron }
