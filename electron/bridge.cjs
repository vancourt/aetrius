const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const { app, clipboard } = require('electron')

function bridgeLog(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a)).join(' ')}\n`
  try {
    if (app && app.getPath) {
      fs.appendFileSync(path.join(app.getPath('userData'), 'bridge.log'), line)
    }
  } catch {}
  console.log(`[bridge] ${line.trim()}`)
}

// DOM extraction — evaluated each poll, no persistent injection

const DOM_TO_MARKDOWN_HELPERS = String.raw`
  const NL = String.fromCharCode(10);
  const TICK = String.fromCharCode(96);
  const FENCE = String.fromCharCode(96, 96, 96);

  function normalizeMarkdown(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeInline(s) {
    return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  }

  function shouldSkipNode(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'button', 'form', 'textarea', 'input'].includes(tag)) return true;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    return false;
  }

  function childMarkdown(el) {
    let out = '';
    for (const child of el.childNodes || []) out += nodeMarkdown(child);
    return out;
  }

  function getCodeLanguage(el) {
    let p = el;
    for (let i = 0; p && i < 4; i++, p = p.parentElement) {
      const cls = String(p.className || '');
      const m = cls.match(/language-([a-zA-Z0-9_+.-]+)/) || cls.match(/lang-([a-zA-Z0-9_+.-]+)/);
      if (m) return m[1];
    }
    return '';
  }

  function tableMarkdown(el) {
    const rows = [...el.querySelectorAll('tr')]
      .map(tr => [...tr.children]
        .filter(cell => ['TH', 'TD'].includes(cell.tagName))
        .map(cell => normalizeInline(cell.innerText || cell.textContent || '').trim().replace(/\|/g, '\\|')))
      .filter(row => row.length);
    if (!rows.length) return childMarkdown(el);
    const header = rows[0];
    const separator = header.map(() => '---');
    return NL + [header, separator, ...rows.slice(1)].map(row => '| ' + row.join(' | ') + ' |').join(NL) + NL + NL;
  }

  function nodeMarkdown(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return normalizeInline(node.nodeValue);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    if (shouldSkipNode(el)) return '';

    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return NL;
    if (tag === 'pre') {
      const codeEl = el.querySelector('code') || el;
      const code = String(codeEl.textContent || codeEl.innerText || '').replace(/\n+$/g, '');
      const lang = getCodeLanguage(codeEl);
      return NL + FENCE + lang + NL + code + NL + FENCE + NL + NL;
    }
    if (tag === 'code' && !el.closest('pre')) return TICK + String(el.textContent || '').trim().replace(new RegExp(TICK, 'g'), '\\' + TICK) + TICK;
    if (tag === 'strong' || tag === 'b') return '**' + normalizeMarkdown(childMarkdown(el)) + '**';
    if (tag === 'em' || tag === 'i') return '*' + normalizeMarkdown(childMarkdown(el)) + '*';
    if (tag === 's' || tag === 'del') return '~~' + normalizeMarkdown(childMarkdown(el)) + '~~';
    if (tag === 'a') {
      const text = normalizeMarkdown(childMarkdown(el)) || normalizeInline(el.textContent || '').trim();
      const href = el.getAttribute('href') || '';
      return href ? '[' + text + '](' + href + ')' : text;
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return NL + '#'.repeat(level) + ' ' + normalizeMarkdown(childMarkdown(el)) + NL + NL;
    }
    if (tag === 'blockquote') {
      const text = normalizeMarkdown(childMarkdown(el));
      return NL + text.split('\n').map(line => '> ' + line).join(NL) + NL + NL;
    }
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      const items = [...el.children].filter(child => child.tagName && child.tagName.toLowerCase() === 'li');
      return NL + items.map((li, i) => (ordered ? (i + 1) + '. ' : '- ') + normalizeMarkdown(childMarkdown(li)).replace(/\n/g, NL + '  ')).join(NL) + NL + NL;
    }
    if (tag === 'li') return '- ' + normalizeMarkdown(childMarkdown(el)) + NL;
    if (tag === 'table') return tableMarkdown(el);
    if (['p', 'article', 'section'].includes(tag)) return NL + normalizeMarkdown(childMarkdown(el)) + NL + NL;

    return childMarkdown(el);
  }

  function markdownFromElement(el) {
    const md = normalizeMarkdown(nodeMarkdown(el));
    return md || normalizeMarkdown(el.innerText || el.textContent || '');
  }
`

const EXTRACT_CHATGPT = `(() => {
${DOM_TO_MARKDOWN_HELPERS}
  const all = document.querySelectorAll('[data-message-author-role]');
  // Only outermost elements (parent does NOT have the same attr)
  const outer = [...all].filter(el => {
    const p = el.parentElement;
    return !p || !p.closest || !p.closest('[data-message-author-role]');
  });
  return outer.map(el => ({
    role: el.getAttribute('data-message-author-role'),
    text: markdownFromElement(el)
  }));
})()`

const EXTRACT_GEMINI = `(() => {
${DOM_TO_MARKDOWN_HELPERS}
  const root = document.body;
  const skipTags = ['NAV','HEADER','FOOTER','ASIDE','FORM','TEXTAREA','BUTTON','A','SCRIPT','STYLE','SVG'];

  function normalize(s) {
    return (s || '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\r\\n/g, '\\n')
      .replace(/\\r/g, '\\n')
      .replace(/[ \t]+\\n/g, '\\n')
      .replace(/\\n[ \t]+/g, '\\n')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
  }

  function isExcluded(el) {
    let p = el;
    while (p && p !== document.body) {
      if (skipTags.includes(p.tagName)) return true;
      const role = p.getAttribute && p.getAttribute('role');
      if (role === 'navigation' || role === 'complementary' || role === 'banner') return true;
      if (p.hasAttribute && p.hasAttribute('contenteditable')) return true;
      const cls = (p.getAttribute && p.getAttribute('class') || '').toLowerCase();
      if (cls.indexOf('sidebar') >= 0 || cls.indexOf('side-bar') >= 0) return true;
      p = p.parentElement;
    }
    return false;
  }

  function isUIText(t) {
    const lo = t.toLowerCase();
    if (!t || t.length < 10) return true;
    if ((lo.indexOf('conheça o gemini') === 0 || lo.indexOf('meet gemini') === 0 || lo.indexOf('get to know gemini') === 0) && lo.indexOf('assist') >= 0) return true;
    if ((lo.indexOf('terms') >= 0 || lo.indexOf('termos') >= 0) && (lo.indexOf('privacy') >= 0 || lo.indexOf('privacidade') >= 0) && t.length < 400) return true;
    if ((lo.indexOf('abre em') >= 0 && lo.indexOf('nova janela') >= 0) || (lo.indexOf('open in') >= 0 && lo.indexOf('new window') >= 0)) return true;
    if ((lo.indexOf('pode cometer erros') >= 0 || lo.indexOf('may display inaccurate') >= 0 || lo.indexOf('can make mistakes') >= 0) && t.length < 220) return true;
    return false;
  }

  function stripLabels(t) {
    const geminiLabels = ['O Gemini disse', 'Gemini said', 'Gemini disse'];
    const userLabels = ['Você disse', 'You said'];
    let hasGemini = false;
    let hasUser = false;
    for (const l of geminiLabels) if (t.indexOf(l) >= 0) hasGemini = true;
    for (const l of userLabels) if (t.indexOf(l) >= 0) hasUser = true;

    if (!hasGemini && hasUser) return '';

    for (const l of geminiLabels) {
      const idx = t.indexOf(l);
      if (idx >= 0) {
        if (idx < 140 || hasUser) {
          t = t.slice(idx + l.length).trim();
          break;
        }
      }
    }
    return isUIText(t) ? '' : t;
  }

  function uniquePush(out, text) {
    if (!text || text.length < 10) return;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === text) return;
      if (out[i].length > text.length && out[i].indexOf(text) >= 0) return;
    }
    for (let i = out.length - 1; i >= 0; i--) {
      if (text.length > out[i].length && text.indexOf(out[i]) >= 0) out.splice(i, 1);
    }
    out.push(text);
  }

  // Try specific selectors first.
  const selectors = [
    'model-response',
    '[data-message-author-role="model"], [data-message-author-role="assistant"]',
    '.model-response-text, [class*="model-response-text"]',
    '[class*="model-response"], [class*="response-content"], [class*="response-container"]',
    '[data-response-id], [data-testid*="response"]',
    '.markdown, [class*="markdown"]'
  ];

  for (const selector of selectors) {
    let els = [];
    try { els = [...root.querySelectorAll(selector)].filter(el => !isExcluded(el)); } catch (e) { continue; }
    if (!els.length) continue;

    const selected = new Set(els);
    const out = [];
    for (const el of els) {
      const text = stripLabels(markdownFromElement(el));
      if (!text) continue;

      let p = el.parentElement;
      let covered = false;
      while (p && p !== root) {
        if (selected.has(p)) {
          const pt = stripLabels(markdownFromElement(p));
          if (pt && pt.length > text.length && pt.indexOf(text) >= 0) { covered = true; break; }
        }
        p = p.parentElement;
      }
      if (covered) continue;
      uniquePush(out, text);
    }
    if (out.length) return out.map(text => ({ role: 'model', text }));
  }

  // Fallback: split whole body text by explicit labels.
  const full = normalize(root.innerText || root.textContent || '');
  const labels = ['O Gemini disse', 'Gemini said', 'Gemini disse'];
  const userLabels = ['Você disse', 'You said'];
  const out = [];
  for (const label of labels) {
    if (full.indexOf(label) < 0) continue;
    const parts = full.split(label).slice(1);
    for (const part of parts) {
      let cut = part;
      for (const ul of userLabels) {
        const idx = cut.indexOf(ul);
        if (idx >= 0) cut = cut.slice(0, idx);
      }
      const cleaned = stripLabels(cut.trim());
      uniquePush(out, cleaned);
    }
    if (out.length) return out.map(text => ({ role: 'model', text }));
  }

  // Last resort: return cleaned whole body text.
  const cleaned = stripLabels(full);
  return cleaned && cleaned.length > 10 ? [{ role: 'model', text: cleaned }] : [];
})()`

const COUNT_CHATGPT = `document.querySelectorAll('[data-message-author-role]').length`
const COUNT_GEMINI = `(() => {
  const scrollArea = document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
  const all = scrollArea.querySelectorAll('p, div, span, article');
  const sorted = [...all]
    .map(el => ({ el, text: el.textContent.trim(), len: el.textContent.trim().length }))
    .filter(x => x.len > 80)
    .sort((a, b) => b.len - a.len);
  const seen = new Set();
  let count = 0;
  for (const { el, text } of sorted) {
    if (seen.has(text)) continue;
    if (el.closest('nav, header, footer, [role="navigation"], form, textarea, [contenteditable="true"], .input-area, [role="complementary"], aside')) continue;
    if ([...el.children].some(c => c.textContent.trim() === text)) continue;
    seen.add(text);
    count++;
  }
  return count;
})()`

const GEMINI_IS_GENERATING = `(() => {
  const words = ['stop', 'cancel', 'parar', 'interromper', 'cancelar'];
  const context = ['response', 'generat', 'resposta', 'gerar'];
  const controls = [...document.querySelectorAll('button, [role="button"]')];
  return controls.some(el => {
    const label = [
      el.innerText || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || ''
    ].join(' ').toLowerCase();
    return words.some(w => label.includes(w)) &&
      (context.some(c => label.includes(c)) || label.includes('parar'));
  });
})()`

const CLEAN_CHATGPT = `((keep) => {
  const msgs = document.querySelectorAll('[data-message-author-role]');
  if (msgs.length > keep) {
    for (let i = 0; i < msgs.length - keep; i++) {
      let el = msgs[i];
      for (let j = 0; j < 6; j++) {
        if (el.parentElement && el.parentElement.children.length <= 4) el = el.parentElement;
        else break;
      }
      el.remove();
    }
  }
})(__KEEP__)`

const CLEAN_GEMINI = `((keep) => {
  const msgs = document.querySelectorAll('.model-response-text, [data-message-content], .response-content, [class*="response-text"], [class*="model-response"]');
  if (msgs.length > keep) {
    for (let i = 0; i < msgs.length - keep; i++) {
      let el = msgs[i];
      for (let j = 0; j < 6; j++) {
        if (el.parentElement && el.parentElement.children.length <= 4) el = el.parentElement;
        else break;
      }
      el.remove();
    }
  }
})(__KEEP__)`

const INPUT_SELECTORS = {
  chatgpt: {
    input: '#prompt-textarea, div[contenteditable="true"][data-id]',
    send: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
    pageReady: '[data-message-author-role], main form'
  },
  gemini: {
    input: 'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [role="textbox"][contenteditable="true"], [aria-label*="prompt"][contenteditable="true"], [aria-label*="Prompt"][contenteditable="true"], [aria-label*="mensagem"][contenteditable="true"], [aria-label*="Mensagem"][contenteditable="true"], [aria-label*="digite"][contenteditable="true"], [aria-label*="Digite"][contenteditable="true"], div[contenteditable="true"]',
    send: 'button[aria-label="Send message"], button[aria-label="Send"], button[aria-label*="Enviar"], button[aria-label*="enviar"], button[aria-label*="send"], button[data-testid="send-button"]',
    pageReady: 'main, .conversation-container'
  }
}

class BridgeManager {
  constructor() {
    this.browser = null
    this.pages = { chatgpt: null, gemini: null }
    this.connected = { chatgpt: false, gemini: false }
    this.emittedTexts = { chatgpt: new Set(), gemini: new Set() }
    this.pendingTexts = { chatgpt: new Map(), gemini: new Map() }
    this.messageCount = { chatgpt: 0, gemini: 0 }
    // Gemini combined-text state (waits for full response before emitting ONE message)
    this._geminiLastCombined = ''
    this._geminiStableSince = 0
    this._geminiEmittedCombined = ''
    this._geminiSentTexts = new Set() // texts we sent → filter out from Gemini responses
    this._geminiLastSentAt = 0
  }

  async _ensureBrowser() {
    if (this.browser) return
    if (this._browserPromise) return this._browserPromise

    this._browserPromise = (async () => {
      const userDataDir = path.join(app.getPath('userData'), 'playwright-profile')
      this.browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=ChromeWhatsNewUI,Translate'
        ],
        viewport: { width: 1280, height: 900 }
      })

      const pages = this.browser.pages()
      if (pages.length > 1) {
        for (let i = 1; i < pages.length; i++) {
          await pages[i].close().catch(() => {})
        }
      }

      return this.browser
    })()

    return this._browserPromise
  }

  async connectSession(provider, url) {
    try {
      await this._ensureBrowser()

      if (this.pages[provider]) {
        await this.pages[provider].close().catch(() => {})
        this.pages[provider] = null
      }

      let page = null
      const allPages = this.browser.pages()
      for (const p of allPages) {
        const u = p.url()
        if ((u === 'about:blank' || u.startsWith('chrome://newtab')) && !Object.values(this.pages).includes(p)) {
          page = p
          break
        }
      }
      if (!page) page = await this.browser.newPage()
      this.pages[provider] = page

      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      if (resp && resp.status() >= 400) {
        throw new Error(`HTTP ${resp.status()}: page may require login or URL is invalid`)
      }

      const currentUrl = page.url()
      if (provider === 'chatgpt' && currentUrl.includes('auth.openai.com')) {
        throw new Error('ChatGPT login required')
      }
      if (provider === 'gemini' && currentUrl.includes('accounts.google.com')) {
        throw new Error('Gemini login required')
      }

      const sel = INPUT_SELECTORS[provider]
      try { await page.waitForSelector(sel.pageReady, { timeout: 15000 }) } catch {
        await page.waitForTimeout(5000)
      }

      // Mark existing messages as already emitted
      const extractFn = provider === 'chatgpt' ? EXTRACT_CHATGPT : EXTRACT_GEMINI
      const existing = await page.evaluate(extractFn).catch(() => [])
      for (const m of existing) {
        if (m.text && m.text.length > 10 && m.role !== 'user') {
          this.emittedTexts[provider].add(m.text)
        }
      }
      // Gemini: set combined-text baseline so stability tracking starts fresh
      if (provider === 'gemini') {
        const modelTexts = existing
          .filter(m => m.role !== 'user' && m.text && m.text.length > 10)
          .map(m => m.text)
        this._geminiLastCombined = modelTexts.join('\n\n')
        this._geminiStableSince = Date.now()
        this._geminiEmittedCombined = this._geminiLastCombined
      }
      this.messageCount[provider] = existing.length
      this.connected[provider] = true

      return { success: true, provider, messageCount: existing.length, url: currentUrl }
    } catch (err) {
      this.connected[provider] = false
      return { success: false, provider, error: err.message }
    }
  }

  async disconnectSession(provider) {
    if (this.pages[provider]) {
      await this.pages[provider].close().catch(() => {})
      this.pages[provider] = null
    }
    this.connected[provider] = false
    return { success: true }
  }

  async _findInput(page, selector) {
    const selectors = selector.split(',').map(s => s.trim()).filter(Boolean)
    for (const sel of selectors) {
      const handles = await page.$$(sel).catch(() => [])
      for (let i = handles.length - 1; i >= 0; i--) {
        const handle = handles[i]
        const usable = await handle.evaluate(el => {
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true'
          const readOnly = el.readOnly || el.getAttribute('aria-readonly') === 'true'
          return rect.width > 0 && rect.height > 0 &&
            style.visibility !== 'hidden' && style.display !== 'none' &&
            !disabled && !readOnly
        }).catch(() => false)
        if (usable) return handle
      }
    }
    return null
  }

  async _findSendButton(page, selector, timeout = 5000) {
    const selectors = selector.split(',').map(s => s.trim()).filter(Boolean)
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      for (const sel of selectors) {
        const handles = await page.$$(sel).catch(() => [])
        for (let i = handles.length - 1; i >= 0; i--) {
          const handle = handles[i]
          const usable = await handle.evaluate(el => {
            const rect = el.getBoundingClientRect()
            const style = window.getComputedStyle(el)
            const disabled = el.disabled ||
              el.getAttribute('disabled') !== null ||
              el.getAttribute('aria-disabled') === 'true'
            return rect.width > 0 && rect.height > 0 &&
              style.visibility !== 'hidden' && style.display !== 'none' &&
              !disabled
          }).catch(() => false)
          if (usable) return handle
        }
      }
      await page.waitForTimeout(150)
    }

    return null
  }

  async _setInputText(inputEl, text) {
    return inputEl.evaluate((el, value) => {
      el.focus()

      const fireInput = (inputType, data = null) => {
        try {
          el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data }))
        } catch {}
        try {
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }))
        } catch {
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }

      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(el)
        selection.removeAllRanges()
        selection.addRange(range)
        document.execCommand('delete')
        if (value) document.execCommand('insertText', false, value)

        // Fallback if execCommand did not update the editor DOM.
        const current = (el.innerText || el.textContent || '').trim()
        if ((value || '').trim() && current !== String(value).trim()) {
          el.textContent = value
        }
        if (!value) {
          el.textContent = ''
          el.innerHTML = ''
        }
        fireInput(value ? 'insertText' : 'deleteContentBackward', value || null)
        return true
      }

      if ('value' in el) {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
        if (descriptor && descriptor.set) descriptor.set.call(el, value)
        else el.value = value
        fireInput(value ? 'insertText' : 'deleteContentBackward', value || null)
        return true
      }

      return false
    }, text).catch(() => false)
  }

  async _getInputText(inputEl) {
    return inputEl.evaluate((el) => {
      if ('value' in el) return el.value || ''
      return el.innerText || el.textContent || ''
    }).catch(() => '')
  }

  async _pasteInputText(page, inputEl, text) {
    const previousClipboard = clipboard.readText()
    try {
      await inputEl.click().catch(() => {})
      await page.keyboard.press('Control+A').catch(() => {})
      await page.keyboard.press('Backspace').catch(() => {})
      await page.waitForTimeout(120)

      clipboard.writeText(text)
      await page.keyboard.press('Control+V')
      await page.waitForTimeout(Math.min(2500, 500 + Math.ceil(String(text).length / 1200) * 250))

      // If Chromium paste did not update the editor, fall back to DOM insertion.
      const current = await this._getInputText(inputEl)
      if (!String(current || '').trim()) {
        await this._setInputText(inputEl, text)
        await page.waitForTimeout(800)
      }

      return true
    } finally {
      clipboard.writeText(previousClipboard || '')
    }
  }

  async sendMessage(text, providers = ['chatgpt', 'gemini']) {
    // Track text sent to Gemini so we can filter it out of the response extraction
    if (providers.includes('gemini')) {
      this._geminiSentTexts.add(text)
      this._geminiLastSentAt = Date.now()
      const baseline = this._geminiEmittedCombined || this._geminiLastCombined
      this._geminiLastCombined = baseline
      this._geminiStableSince = Date.now()
      this._geminiEmittedCombined = baseline
    }

    const sendOne = async (provider) => {
      if (!this.connected[provider] || !this.pages[provider]) {
        return { success: false, error: 'Not connected' }
      }
      try {
        const page = this.pages[provider]
        const sel = INPUT_SELECTORS[provider]
        bridgeLog(`sendOne ${provider}: finding input`)
        const inputEl = await this._findInput(page, sel.input)
        if (!inputEl) {
          bridgeLog(`sendOne ${provider}: input not found`)
          return { success: false, error: 'Input not found' }
        }

        bridgeLog(`sendOne ${provider}: setting input text`)
        await inputEl.click().catch(() => {})
        await this._setInputText(inputEl, '')
        await page.waitForTimeout(80)

        // Gemini's editor often shows large DOM-inserted text but does not enable send.
        // Real clipboard paste triggers the framework's own input pipeline.
        if (provider === 'gemini' || String(text).length > 3000) {
          await this._pasteInputText(page, inputEl, text)
        } else {
          await this._setInputText(inputEl, text)
        }
        await page.waitForTimeout(provider === 'gemini' ? 1500 : 250)

        const sendBtn = await this._findSendButton(page, sel.send, provider === 'gemini' || text.length > 4000 ? 10000 : 5000)
        bridgeLog(`sendOne ${provider}: sendBtn=${!!sendBtn}`)
        if (sendBtn) {
          await sendBtn.click()
        } else {
          bridgeLog(`sendOne ${provider}: enabled send button not found, pressing Enter fallback`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(400)
          await page.keyboard.press('Control+Enter').catch(() => {})
        }

        await page.waitForTimeout(1000)
        bridgeLog(`sendOne ${provider}: done`)
        return { success: true }
      } catch (err) {
        bridgeLog(`sendOne ${provider} error:`, err.message)
        return { success: false, error: err.message }
      }
    }

    // Sequential send avoids cross-page keyboard/focus conflicts.
    const results = {}
    for (const provider of providers) {
      results[provider] = await sendOne(provider)
    }
    return results
  }

  async getNewMessages(provider) {
    bridgeLog(`getNewMessages ${provider}: start, connected=${this.connected[provider]}, hasPage=${!!this.pages[provider]}`)
    if (!this.connected[provider] || !this.pages[provider]) return []

    try {
      const page = this.pages[provider]
      try { await page.evaluate('1') } catch {
        bridgeLog(`getNewMessages ${provider}: page evaluate failed, marking disconnected`)
        this.connected[provider] = false; return []
      }

      const extractFn = provider === 'chatgpt' ? EXTRACT_CHATGPT : EXTRACT_GEMINI
      const all = await page.evaluate(extractFn).catch((err) => {
        bridgeLog(`getNewMessages ${provider}: extract error`, err.message)
        return []
      })
      bridgeLog(`getNewMessages ${provider}: extracted`, all.length)
      if (!all.length) return []

      if (provider === 'gemini') {
        bridgeLog('GEMINI extracted count', all.length)
        bridgeLog('GEMINI first items', all.slice(0, 3).map(m => ({ role: m.role, text: (m.text || '').slice(0, 120) })))

        // ── Gemini: accumulate all model texts and emit ONE message once stable ──
        const modelTexts = []
        for (const m of all) {
          if (!m.text || m.text.length < 10) continue
          if (m.role === 'user') continue
          let text = m.text.trim()

          // Skip texts we sent as prompts.
          let isSentPrompt = false
          for (const sent of this._geminiSentTexts) {
            if (text === sent || text.includes(sent) || sent.includes(text)) {
              isSentPrompt = true
              break
            }
          }
          if (isSentPrompt) continue

          modelTexts.push(text)
        }

        bridgeLog('GEMINI modelTexts count', modelTexts.length)
        bridgeLog('GEMINI modelTexts preview', modelTexts.map(t => t.slice(0, 120)))

        if (!modelTexts.length) return []

        const combined = modelTexts.join('\n\n')
        const elapsedSinceSend = Date.now() - (this._geminiLastSentAt || 0)
        const isGenerating = await page.evaluate(GEMINI_IS_GENERATING).catch(() => false)
        const stable = combined === this._geminiLastCombined

        bridgeLog('GEMINI poll', { elapsedSinceSend, isGenerating, stable, combinedLength: combined.length, emittedLength: this._geminiEmittedCombined.length })

        // Still accumulating / streaming: update baseline and wait.
        if (!stable) {
          this._geminiLastCombined = combined
          this._geminiStableSince = Date.now()
          return []
        }

        // Same as already emitted → nothing new.
        if (combined === this._geminiEmittedCombined) return []

        // Minimum quiet period before we consider the response finished.
        const stabilityMs = isGenerating ? 3500 : 2000
        const stableFor = Date.now() - this._geminiStableSince
        if (elapsedSinceSend < 1500) return []
        if (stableFor < stabilityMs) return []

        // Auto-clean
        const count = await page.evaluate(COUNT_GEMINI).catch(() => 0)
        this.messageCount[provider] = count
        if (count > 40) {
          await page.evaluate(CLEAN_GEMINI.replace('__KEEP__', '40')).catch(() => {})
          this.messageCount[provider] = 40
        }

        let content = combined
        if (this._geminiEmittedCombined && combined.startsWith(this._geminiEmittedCombined)) {
          content = combined.slice(this._geminiEmittedCombined.length).trim()
        }

        if (!content || content.length < 10) {
          this._geminiEmittedCombined = combined
          return []
        }

        // Emit only the newly generated part as ONE message.
        this._geminiEmittedCombined = combined
        bridgeLog('GEMINI emitting stable response', content.slice(0, 200))
        return [{
          id: provider + '-' + Date.now(),
          provider,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString()
        }]
      }

      // ── ChatGPT: per-element extraction with debounce ──
      const rawTexts = []
      for (const m of all) {
        if (!m.text || m.text.length < 10) continue
        if (m.role === 'user') continue
        rawTexts.push(m.text)
      }

      const newPending = new Map()
      for (const text of rawTexts) {
        let matched = false
        for (const [existingKey, existing] of this.pendingTexts[provider]) {
          if (text === existing.text) {
            newPending.set(existingKey, { text, stableCount: existing.stableCount + 1 })
            matched = true; break
          }
          if (existing.text.length < text.length && text.includes(existing.text)) {
            newPending.set(text, { text, stableCount: 0 })
            matched = true; break
          }
          if (text.length < existing.text.length && existing.text.includes(text)) {
            newPending.set(existingKey, existing)
            matched = true; break
          }
        }
        if (!matched) {
          newPending.set(text, { text, stableCount: 0 })
        }
      }
      this.pendingTexts[provider] = newPending

      const chatMessages = []
      for (const [, entry] of this.pendingTexts[provider]) {
        if (entry.stableCount >= 2 && !this.emittedTexts[provider].has(entry.text)) {
          this.emittedTexts[provider].add(entry.text)
          chatMessages.push({
            id: provider + '-' + Date.now() + '-' + chatMessages.length,
            provider,
            role: 'assistant',
            content: entry.text,
            timestamp: new Date().toISOString()
          })
        }
      }

      // Auto-clean DOM
      const count = await page.evaluate(COUNT_CHATGPT).catch(() => 0)
      this.messageCount[provider] = count
      if (count > 40) {
        await page.evaluate(CLEAN_CHATGPT.replace('__KEEP__', '40')).catch(() => {})
        this.messageCount[provider] = 40
      }

      return chatMessages
    } catch (err) {
      console.error(`[bridge] getNewMessages ${provider}:`, err.message)
      return []
    }
  }

  async forwardMessage(fromProvider, text) {
    const to = fromProvider === 'chatgpt' ? 'gemini' : 'chatgpt'
    const fromLabel = fromProvider === 'chatgpt' ? 'ChatGPT' : 'Gemini'
    // No line breaks — Playwright's .type('\n') fires Enter which Gemini treats as "send"
    const prefix = `[${fromLabel} respondeu:] — `
    const result = await this.sendMessage(prefix + text, [to])
    const toResult = result[to]
    return { success: toResult?.success || false, to, error: toResult?.error }
  }

  async cleanDOM(provider, keepCount = 40) {
    if (!this.pages[provider]) return
    try {
      const cleanFn = provider === 'chatgpt'
        ? CLEAN_CHATGPT.replace('__KEEP__', String(keepCount))
        : CLEAN_GEMINI.replace('__KEEP__', String(keepCount))
      await this.pages[provider].evaluate(cleanFn)
      this.messageCount[provider] = keepCount
      this.lastIndex[provider] = keepCount - 1
    } catch (err) {
      console.error(`[bridge] cleanDOM ${provider}:`, err.message)
    }
  }

  getStatus() {
    return {
      chatgpt: { connected: this.connected.chatgpt, messageCount: this.messageCount.chatgpt },
      gemini: { connected: this.connected.gemini, messageCount: this.messageCount.gemini }
    }
  }

  async close() {
    for (const provider of ['chatgpt', 'gemini']) {
      if (this.pages[provider]) {
        try { await this.pages[provider].close() } catch {}
        this.pages[provider] = null
      }
      this.connected[provider] = false
    }
    if (this.browser) {
      try { await this.browser.close() } catch {}
      this.browser = null
    }
  }
}

module.exports = { BridgeManager, bridgeLog }
