<template>
  <div class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
    <div class="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2">
      <div>
        <div class="text-sm font-semibold" :class="headerClass">{{ title }}</div>
        <div v-if="subtitle" class="text-[10px] text-gray-500">{{ subtitle }}</div>
        <button
          v-if="selectedMessage"
          @click="scrollToMessage(selectedMessage.id)"
          class="mt-1 block max-w-[260px] truncate text-left text-[10px] text-yellow-400 hover:text-yellow-300"
          title="Ir para mensagem selecionada"
        >
          Selecionada: {{ selectedPreview }}
        </button>
      </div>
      <div class="flex flex-col items-end gap-1 text-[10px] text-gray-500">
        <div>{{ messages.length }}</div>
        <label class="flex items-center gap-1" title="Rolar automaticamente para a última mensagem">
          <input v-model="autoScroll" type="checkbox" class="h-3 w-3 accent-gray-500" />
          auto-scroll
        </label>
      </div>
    </div>

    <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3" @click="handleMarkdownClick">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="flex"
        :class="msg.role === 'user' ? 'justify-end' : ''"
        :data-message-id="msg.id"
      >
        <div
          class="max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed relative group"
          :class="bubbleClass(msg)"
        >
          <div class="sticky top-0 z-10 -mx-1 mb-1 flex items-center justify-end gap-1 rounded bg-gray-900/80 px-1 py-1 backdrop-blur">
            <label
              v-if="interactive && msg.role !== 'user'"
              class="mr-auto flex items-center gap-1 text-[10px] text-gray-400"
              title="Selecionar para usar nas próximas fases"
            >
              <input
                type="checkbox"
                class="h-3 w-3 accent-yellow-500"
                :checked="isSelected(msg)"
                @change.stop="store.toggleSelectedMessage(msg.provider, msg.id)"
              />
              usar
            </label>
            <button
              @click.stop="copyMessage(msg)"
              class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
              :title="msg.role === 'user' ? 'Copiar prompt' : 'Copiar mensagem'"
            >
              {{ copiedMessageId === msg.id ? 'Copiado' : 'Copiar mensagem' }}
            </button>
            <button
              v-if="interactive && msg.role !== 'user'"
              @click="forward(msg)"
              class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
              :disabled="forwarding"
              :title="'Encaminhar para ' + otherName(msg.provider)"
            >
              Encaminhar &#8594; {{ otherName(msg.provider) }}
            </button>
          </div>

          <button
            v-if="msg.forwardedFromId"
            @click.stop="scrollToMessage(msg.forwardedFromId)"
            class="mb-2 rounded border border-yellow-700/50 bg-yellow-950/30 px-2 py-1 text-left text-xs text-yellow-200 hover:bg-yellow-900/40"
          >
            Abrir mensagem original encaminhada
          </button>

          <div class="text-sm prose prose-invert prose-sm max-w-none break-words" v-html="renderMarkdown(displayContent(msg))"></div>

          <button
            v-if="isCollapsibleUserMessage(msg)"
            @click.stop="toggleExpanded(msg.id)"
            class="mt-1 rounded bg-gray-600 px-2 py-0.5 text-[10px] text-gray-100 hover:bg-gray-500"
          >
            {{ expandedUserIds.has(msg.id) ? 'Recolher' : '... expandir' }}
          </button>

          <div v-if="msg.role === 'user' && msg.target" class="mt-1 text-[10px]" :class="targetBadgeClass(msg.target)">
            → {{ targetBadgeLabel(msg.target) }}
          </div>
        </div>
      </div>

      <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
        <div class="text-center text-gray-500 space-y-2">
          <p class="text-sm">{{ emptyText }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, computed, watch } from 'vue'
import { useChatStore } from '../stores/chat.js'
import { marked } from 'marked'

let markedConfigured = false

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  messages: { type: Array, default: () => [] },
  providerKey: { type: String, default: '' },
  selectedMessage: { type: Object, default: null },
  emptyText: { type: String, default: 'Ainda não há mensagens.' },
  interactive: { type: Boolean, default: true }
})

const store = useChatStore()
const scrollRef = ref(null)
const autoScroll = ref(true)
const forwarding = ref(false)
const copiedMessageId = ref('')
const expandedUserIds = ref(new Set())
const USER_COLLAPSE_LIMIT = 260

function escapeHtml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function cleanLanguage(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z0-9_+.-]/g, '')
}

if (!markedConfigured) {
  marked.setOptions({ breaks: true, gfm: true })
  marked.use({
    renderer: {
      html(token) {
        return escapeHtml(token.raw || token.text || '')
      },
      code(token) {
        const language = cleanLanguage(token.lang)
        const label = language || 'Código'
        const className = language ? ` class="language-${escapeHtml(language.toLowerCase())}"` : ''
        return `<div class="chat-code-block"><div class="chat-code-header"><span>${escapeHtml(label)}</span><button type="button" class="code-copy-btn">Copiar bloco</button></div><pre><code${className}>${escapeHtml(token.text || '')}</code></pre></div>`
      }
    }
  })
  markedConfigured = true
}

const headerClass = computed(() => {
  if (props.providerKey === 'chatgpt') return 'text-emerald-400'
  if (props.providerKey === 'gemini') return 'text-blue-400'
  if (props.providerKey === 'deepseek') return 'text-purple-400'
  return 'text-gray-300'
})

const selectedPreview = computed(() => {
  const text = props.selectedMessage?.content || ''
  return text.length > 80 ? text.slice(0, 80).trimEnd() + '...' : text
})

function bubbleClass(msg) {
  if (msg.role === 'user') return 'bg-gray-700 border-l-4 border-gray-500 text-gray-100'
  if (msg.provider === 'chatgpt') return 'bg-emerald-950/40 border border-emerald-700/50 border-l-4 border-l-emerald-500 text-emerald-50'
  if (msg.provider === 'gemini') return 'bg-blue-950/40 border border-blue-700/50 border-l-4 border-l-blue-500 text-blue-50'
  if (msg.provider === 'deepseek') return 'bg-purple-950/40 border border-purple-700/50 border-l-4 border-l-purple-500 text-purple-50'
  return 'bg-gray-800 border-l-4 border-gray-500 text-gray-200'
}

function renderMarkdown(text) {
  if (!text) return ''
  return marked.parse(text)
}

function isCollapsibleUserMessage(msg) {
  return msg.role === 'user' && String(msg.content || '').length > USER_COLLAPSE_LIMIT
}

function displayContent(msg) {
  const content = String(msg.content || '')
  if (!isCollapsibleUserMessage(msg) || expandedUserIds.value.has(msg.id)) return content
  return content.slice(0, USER_COLLAPSE_LIMIT).trimEnd() + '\n\n...'
}

function toggleExpanded(id) {
  const next = new Set(expandedUserIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedUserIds.value = next
}

async function copyMessage(msg) {
  try {
    await navigator.clipboard.writeText(msg.content || '')
    copiedMessageId.value = msg.id
    setTimeout(() => {
      if (copiedMessageId.value === msg.id) copiedMessageId.value = ''
    }, 1200)
  } catch {}
}

function otherName(provider) {
  return provider === 'chatgpt' ? 'Gemini' : 'ChatGPT'
}

async function forward(msg) {
  if (!props.interactive) return
  if (forwarding.value) return
  forwarding.value = true
  try {
    await store.forwardMessage(msg)
  } catch {}
  forwarding.value = false
}

function isSelected(msg) {
  if (!props.interactive) return false
  return store.selectedMessageIds[msg.provider] === msg.id
}

function scrollToMessage(id) {
  if (!id) return
  const safeId = String(id).replace(/"/g, '\\"')
  const el = document.querySelector(`[data-message-id="${safeId}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-yellow-400')
  setTimeout(() => el.classList.remove('ring-2', 'ring-yellow-400'), 1400)
}

watch(
  () => props.messages.length,
  async () => {
    if (!autoScroll.value) return
    await nextTick()
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
)

function targetBadgeLabel(target) {
  if (target === 'all') return 'Todos'
  if (target === 'gemini') return 'Gemini'
  if (target === 'deepseek') return 'DeepSeek'
  return 'ChatGPT'
}

function targetBadgeClass(target) {
  if (target === 'chatgpt') return 'text-emerald-400'
  if (target === 'gemini') return 'text-blue-400'
  if (target === 'deepseek') return 'text-purple-400'
  return 'text-gray-400'
}

function handleMarkdownClick(event) {
  const button = event.target.closest?.('.code-copy-btn')
  if (!button) return

  const block = button.closest('.chat-code-block')
  const code = block?.querySelector('code')?.textContent || ''
  if (!code) return

  navigator.clipboard.writeText(code).then(() => {
    const original = button.textContent
    button.textContent = 'Copiado'
    setTimeout(() => { button.textContent = original }, 1200)
  }).catch(() => {})
}

</script>
