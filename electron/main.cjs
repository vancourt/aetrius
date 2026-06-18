const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { getDatabase } = require('./db.cjs')
const { BridgeManager, bridgeLog } = require('./bridge.cjs')

let mainWindow = null
let bridge = null

const DEEPSEEK_PROXY_URL = 'https://deepseek-proxy.vercel.app/v1/chat/completions'
const DEEPSEEK_ALLOWED_MODELS = new Set(['deepseek-r1', 'deepseek-v3'])

async function requestDeepSeek(prompt, model) {
  const cleanPrompt = String(prompt || '').trim()
  const modelId = String(model || 'deepseek-r1').trim()

  if (!cleanPrompt) return { success: false, error: 'Prompt vazio' }
  if (!DEEPSEEK_ALLOWED_MODELS.has(modelId)) {
    return { success: false, error: `Modelo DeepSeek inválido: ${modelId}` }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300000)

  try {
    const response = await fetch(DEEPSEEK_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: cleanPrompt }],
        max_tokens: 8192
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `HTTP ${response.status}: ${errorText.slice(0, 500)}` }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || ''
    if (!content) return { success: false, error: 'Resposta DeepSeek vazia', raw: data }

    return { success: true, model: modelId, content, usage: data.usage || null }
  } catch (err) {
    const message = err.name === 'AbortError'
      ? 'DeepSeek demorou mais de 5 minutos para responder.'
      : err.message
    return { success: false, error: message }
  } finally {
    clearTimeout(timeout)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    const fs = require('fs')
    let port = '17173'
    try {
      port = fs.readFileSync(path.join(__dirname, '..', '.vite-port'), 'utf8').trim()
    } catch {}
    mainWindow.loadURL('http://localhost:' + port)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  const db = getDatabase()
  bridge = new BridgeManager()

  createWindow()

  // --- IPC Handlers ---

  // Session management
  ipcMain.handle('session:connect', async (_e, { provider, url }) => {
    return bridge.connectSession(provider, url)
  })

  ipcMain.handle('session:disconnect', async (_e, provider) => {
    return bridge.disconnectSession(provider)
  })

  ipcMain.handle('session:status', async () => {
    return bridge.getStatus()
  })

  // Send message to one or both providers
  ipcMain.handle('message:send', async (_e, { text, providers }) => {
    return bridge.sendMessage(text, providers)
  })

  // Forward a message from one provider to the other
  ipcMain.handle('message:forward', async (_e, { fromProvider, text }) => {
    return bridge.forwardMessage(fromProvider, text)
  })

  // Poll for new messages
  ipcMain.handle('message:poll', async () => {
    bridgeLog('POLL: start')
    const chatgpt = await bridge.getNewMessages('chatgpt')
    const gemini = await bridge.getNewMessages('gemini')
    bridgeLog('POLL: chatgpt', chatgpt.length, 'gemini', gemini.length)

    // Save to DB
    const insert = db.prepare(
      'INSERT OR IGNORE INTO messages (provider, role, content, timestamp) VALUES (?, ?, ?, ?)'
    )
    const allNew = [...chatgpt, ...gemini]
    for (const msg of allNew) {
      insert.run(msg.provider, msg.role, msg.content, msg.timestamp)
    }

    return allNew
  })

  // Clean old DOM messages
  ipcMain.handle('message:clean_dom', async (_e, { keepCount }) => {
    await bridge.cleanDOM('chatgpt', keepCount || 40)
    await bridge.cleanDOM('gemini', keepCount || 40)
    return true
  })

  // Native DeepSeek consolidation via the same proxy used by the old tester page.
  ipcMain.handle('deepseek:request', async (_e, { prompt, model }) => {
    return requestDeepSeek(prompt, model)
  })

  // History from DB
  ipcMain.handle('history:get', async (_e, { limit, offset }) => {
    const rows = db.prepare(
      'SELECT * FROM messages ORDER BY timestamp ASC LIMIT ? OFFSET ?'
    ).all(limit || 200, offset || 0)
    return rows
  })

  ipcMain.handle('history:clear', async () => {
    db.prepare('DELETE FROM messages').run()
    return true
  })

  // Project sessions
  ipcMain.handle('project:list', async () => {
    return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  })

  ipcMain.handle('project:create', async (_e, name) => {
    const id = Date.now().toString()
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name)
    return { id, name }
  })

  ipcMain.handle('project:delete', async (_e, id) => {
    db.prepare('DELETE FROM messages WHERE project_id = ?').run(id)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  if (bridge) await bridge.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  if (bridge) await bridge.close()
})
