<template>
  <div class="border-t border-gray-800 bg-gray-900 px-4 py-3 shrink-0">
    <div class="mb-2 space-y-2">
      <div class="flex flex-wrap gap-2">
        <div class="inline-flex overflow-hidden rounded-full border border-purple-800 bg-purple-950/60">
          <select
            v-model="store.deepseekModel"
            :disabled="store.deepseekLoading"
            class="bg-purple-950/60 px-2 py-1 text-[11px] text-purple-100 outline-none
                   disabled:cursor-not-allowed disabled:opacity-50"
            title="Modelo DeepSeek usado na consolidação final"
          >
            <option value="deepseek-r1">DeepSeek R1</option>
            <option value="deepseek-v3">DeepSeek V3</option>
          </select>
          <button
            @click="consolidateDeepSeek"
            :disabled="store.workflowBusy"
            class="border-l border-purple-800 px-3 py-1 text-[11px] text-purple-200
                   transition-colors hover:bg-purple-900 hover:text-white
                   disabled:cursor-not-allowed disabled:opacity-40"
            title="Consolidar as últimas respostas do GPT e Gemini em uma decisão final no chat DeepSeek."
          >
            {{ store.deepseekLoading ? 'Consolidando...' : 'Consolidar DeepSeek' }}
          </button>
        </div>
        <div
          v-for="action in workflowActions"
          :key="action.id"
          class="inline-flex overflow-hidden rounded-full border border-gray-700 bg-gray-800"
        >
          <button
            @click="runWorkflowAction(action.id)"
            :disabled="action.disabled"
            class="px-3 py-1 text-[11px] text-gray-300 transition-colors
                   hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed
                   disabled:opacity-40"
            :title="action.title"
          >
            {{ action.label }}
          </button>
          <button
            @click="copyWorkflowPrompt(action.id)"
            :disabled="action.copyDisabled"
            class="border-l border-gray-700 px-2 py-1 text-[10px] text-gray-500
                   transition-colors hover:bg-gray-700 hover:text-white
                   disabled:cursor-not-allowed disabled:opacity-30"
            title="Copiar prompt gerado"
          >
            Copiar
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 text-[10px] text-gray-600">
        <span :class="store.providerLoading.chatgpt ? 'text-emerald-300' : 'text-emerald-600'">
          Modelo A / ChatGPT: {{ modelStatus('chatgpt') }}
        </span>
        <span :class="store.providerLoading.gemini ? 'text-blue-300' : 'text-blue-600'">
          Modelo B / Gemini: {{ modelStatus('gemini') }}
        </span>
        <span v-if="store.council.pendingPhase" class="text-yellow-500">
          Aguardando respostas da fase {{ phaseLabel(store.council.pendingPhase) }}
        </span>
        <span :class="store.deepseekLoading ? 'text-purple-300' : 'text-purple-600'">
          DeepSeek: {{ store.deepseekLoading ? 'consolidando' : deepseekModelLabel }}
        </span>
      </div>
    </div>

    <div class="flex items-end gap-3">
      <!-- Info bar -->
      <div class="flex items-center gap-3 text-xs text-gray-500 mr-2">
        <span v-if="store.chatgptMsgCount" class="text-emerald-500">
          Modelo A: {{ store.chatgptMsgCount }}
        </span>
        <span v-if="store.geminiMsgCount" class="text-blue-500">
          Modelo B: {{ store.geminiMsgCount }}
        </span>
        <button
          v-if="store.chatgptMsgCount > 45 || store.geminiMsgCount > 45"
          @click="store.cleanDOM()"
          class="text-yellow-500 hover:text-yellow-400 underline"
          title="Remover mensagens antigas do DOM do navegador (o histórico local é mantido)"
        >
          Limpar DOM
        </button>
      </div>

      <!-- Input + mention dropdown -->
      <div class="flex-1 relative">
        <!-- Mention autocomplete dropdown -->
        <div
          v-if="showMentions"
          class="absolute bottom-full left-0 mb-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[160px]"
        >
          <div
            v-for="(opt, i) in filteredMentions"
            :key="opt.tag"
            @mousedown.prevent="selectMention(opt)"
            @mouseenter="mentionIndex = i"
            class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors"
            :class="i === mentionIndex ? 'bg-gray-700' : 'hover:bg-gray-700'"
          >
            <span
              class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              :class="opt.iconBg"
            >{{ opt.icon }}</span>
            <span :class="opt.textClass">@{{ opt.tag }}</span>
            <span class="text-gray-500 text-xs ml-auto">{{ opt.label }}</span>
            <span
              v-if="opt.connected === false"
              class="text-red-500 text-[9px]"
              >desconectado</span>
          </div>
        </div>

        <textarea
          ref="inputRef"
          v-model="text"
          @keydown.enter.exact.prevent="sendFromEnter"
          @keydown.down="moveMention($event, 1)"
          @keydown.up="moveMention($event, -1)"
          @keydown.tab="selectActiveMention"
          @keydown.esc="closeMention"
          @input="onInput"
          @blur="onBlur"
           placeholder="Digite sua mensagem... (Enter envia, Shift+Enter quebra linha, @ para mencionar)"
          rows="1"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                 text-sm text-gray-100 placeholder-gray-500
                 focus:outline-none focus:border-gray-600
                 resize-none overflow-hidden"
          :disabled="store.sending"
        ></textarea>
      </div>

      <!-- Send button -->
      <button
        @click="send"
        :disabled="!text.trim() || store.sending"
        class="px-4 py-2 rounded-lg font-medium text-sm transition-colors
               bg-gray-700 hover:bg-gray-600 text-white
               disabled:opacity-40 disabled:cursor-not-allowed
               shrink-0"
      >
         Enviar
      </button>

      <!-- Disconnect -->
      <button
        @click="disconnect"
        class="px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-red-400
               hover:bg-gray-800 transition-colors shrink-0"
        title="Desconectar todas as sessões"
      >
        &#10005;
      </button>
    </div>

    <div class="flex items-center justify-between mt-1.5">
      <div class="text-xs text-gray-600">
        Rodada {{ store.round }} &middot;
        <span v-if="targetLabel" :class="targetClass">&rarr; {{ targetLabel }}</span>
        <span v-else>Enter envia para {{ connectedLabel }}</span>
      </div>
        <div class="text-[10px] text-gray-700">
          @gpt (Modelo A) &middot; @gemini (Modelo B) &middot; @all (Todos)
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useChatStore } from '../stores/chat.js'

const store = useChatStore()
const text = ref('')
const inputRef = ref(null)

const workflowActions = computed(() => [
  {
    id: 'same',
    label: 'Enviar mesmo prompt para ambos',
    title: 'Enviar o prompt atual exatamente igual para os dois modelos, sem contexto de conselho.',
    disabled: !text.value.trim() || store.workflowBusy,
    copyDisabled: !text.value.trim()
  },
  {
    id: 'primer',
    label: 'Iniciar conselho',
    title: 'Preparar os dois modelos para o fluxo do conselho.',
    disabled: store.workflowBusy,
    copyDisabled: false
  },
  {
    id: 'review',
    label: 'Revisar as duas respostas',
    title: 'Enviar para cada modelo o prompt original, a própria resposta e a resposta do outro modelo.',
    disabled: store.workflowBusy,
    copyDisabled: false
  },
  {
    id: 'vote',
    label: 'Votação final',
    title: 'Pedir que os dois modelos escolham Modelo A, Modelo B, híbrido ou nenhum dos dois.',
    disabled: store.workflowBusy,
    copyDisabled: false
  },
  {
    id: 'final',
    label: 'Aplicar ressalvas e gerar resposta final',
    title: 'Gerar a resposta final consolidada usando todos os votos e ressalvas.',
    disabled: store.workflowBusy,
    copyDisabled: false
  }
])

// ── Mention autocomplete state ──
const mentionOpen = ref(false)
const mentionIndex = ref(0)
const mentionQuery = ref('')

const mentionOptions = computed(() => [
  { tag: 'gpt', label: 'Modelo A', icon: 'G', iconBg: 'bg-emerald-700 text-emerald-200', textClass: 'text-emerald-400', connected: store.chatgptConnected },
  { tag: 'gemini', label: 'Modelo B', icon: 'B', iconBg: 'bg-blue-700 text-blue-200', textClass: 'text-blue-400', connected: store.geminiConnected },
  { tag: 'all', label: 'Todos', icon: '*', iconBg: 'bg-gray-700 text-gray-200', textClass: 'text-gray-300', connected: true },
])

const filteredMentions = computed(() => {
  const q = mentionQuery.value.toLowerCase()
  if (!q) return mentionOptions.value
  return mentionOptions.value.filter(o => o.tag.startsWith(q))
})

const showMentions = computed(() => mentionOpen.value && filteredMentions.value.length > 0)

// Detect @ mention at cursor position
function detectMention() {
  const el = inputRef.value
  if (!el) return
  const pos = el.selectionStart ?? text.value.length
  const before = text.value.slice(0, pos)
  // @ at start of input, or after whitespace
  const m = before.match(/(?:^|\s)@(\w*)$/)
  if (m) {
    mentionOpen.value = true
    mentionQuery.value = m[1]
    mentionIndex.value = 0
  } else {
    mentionOpen.value = false
  }
}

function onInput() {
  detectMention()
}

function onBlur() {
  // Delay so click on dropdown registers before blur closes it
  setTimeout(() => { mentionOpen.value = false }, 150)
}

function selectMention(opt) {
  const el = inputRef.value
  const pos = el?.selectionStart ?? text.value.length
  const before = text.value.slice(0, pos)
  const after = text.value.slice(pos)

  // Replace the @partial at the end of before-cursor text
  const replaced = before.replace(/@(\w*)$/, '@' + opt.tag + ' ')
  text.value = replaced + after

  mentionOpen.value = false
  const newCursor = replaced.length

  nextTick(() => {
    if (el) {
      el.focus()
      el.setSelectionRange(newCursor, newCursor)
    }
  })
}

// ── Target detection (for status display) ──
const detectedTarget = computed(() => {
  const m = text.value.match(/^@(gemini|gem|gpt|chatgpt|chat|all|todos)\b/i)
  if (!m) return null
  const tag = m[1].toLowerCase()
  if (tag === 'all' || tag === 'todos') return 'all'
  if (tag === 'gemini' || tag === 'gem') return 'gemini'
  return 'chatgpt'
})

const targetLabel = computed(() => {
  const t = detectedTarget.value
  if (!t) return ''
  if (t === 'all') return 'Todos'
  if (t === 'gemini') return 'Modelo B'
  return 'Modelo A'
})

const targetClass = computed(() => {
  const t = detectedTarget.value
  if (t === 'chatgpt') return 'text-emerald-400'
  if (t === 'gemini') return 'text-blue-400'
  return 'text-gray-400'
})

const connectedLabel = computed(() => {
  const list = []
  if (store.chatgptConnected) list.push('Modelo A')
  if (store.geminiConnected) list.push('Modelo B')
  return list.join(' + ') || 'Nenhum'
})

const deepseekModelLabel = computed(() => {
  return store.deepseekModel === 'deepseek-v3' ? 'V3 pronto' : 'R1 pronto'
})

function modelStatus(provider) {
  if (provider === 'chatgpt' && !store.chatgptConnected) return 'desconectado'
  if (provider === 'gemini' && !store.geminiConnected) return 'desconectado'
  if (store.providerLoading[provider]) return 'aguardando'
  return 'pronto'
}

function phaseLabel(phase) {
  if (phase === 'initial') return 'inicial'
  if (phase === 'review') return 'revisão cruzada'
  if (phase === 'vote') return 'votação final'
  if (phase === 'final') return 'resposta final'
  return phase
}

function promptsForAction(actionId) {
  return store.buildCouncilPrompts(actionId, text.value)
}

async function copyWorkflowPrompt(actionId) {
  const prompts = promptsForAction(actionId)
  const content = [
    ['Modelo A / ChatGPT', prompts.chatgpt],
    ['Modelo B / Gemini', prompts.gemini]
  ]
    .filter(([, prompt]) => prompt && prompt.trim())
    .map(([label, prompt]) => `--- ${label} ---\n${prompt}`)
    .join('\n\n')

  if (!content) return
  try { await navigator.clipboard.writeText(content) } catch {}
}

async function runWorkflowAction(actionId) {
  if (actionId === 'same') {
    await store.sendSamePromptToBoth(text.value)
    text.value = ''
  } else if (actionId === 'primer') {
    await store.sendCouncilPrimer()
  } else if (actionId === 'review') {
    await store.sendCrossReviewBothAnswers()
  } else if (actionId === 'vote') {
    await store.sendFinalDecisionVote()
  } else if (actionId === 'final') {
    await store.sendApplyCaveatsFinalAnswer()
  }

  await nextTick()
  if (inputRef.value) inputRef.value.focus()
}

async function consolidateDeepSeek() {
  const result = await store.consolidateWithDeepSeek()
  if (result?.error) alert(result.error)
  await nextTick()
  if (inputRef.value) inputRef.value.focus()
}

// ── Send / keyboard ──
async function send() {
  if (!text.value.trim() || store.sending) return
  await store.sendMessage(text.value)
  text.value = ''
  await nextTick()
  if (inputRef.value) inputRef.value.focus()
}

function sendFromEnter() {
  if (showMentions.value) {
    selectActiveMention()
    return
  }
  send()
}

function moveMention(e, delta) {
  if (!showMentions.value) return
  e.preventDefault()
  const count = filteredMentions.value.length
  mentionIndex.value = (mentionIndex.value + delta + count) % count
}

function selectActiveMention(e) {
  if (!showMentions.value) return
  if (e) e.preventDefault()
  selectMention(filteredMentions.value[mentionIndex.value])
}

function closeMention(e) {
  if (showMentions.value && e) e.preventDefault()
  mentionOpen.value = false
}

async function disconnect() {
  if (confirm('Desconectar todas as sessões? O histórico do chat será mantido localmente.')) {
    await store.disconnectAll()
  }
}
</script>
