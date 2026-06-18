<template>
  <div class="flex-1 flex items-center justify-center p-8">
    <div class="w-full max-w-lg space-y-6">
      <div class="text-center space-y-2">
        <h2 class="text-2xl font-bold text-white">Conectar sessões</h2>
        <p class="text-sm text-gray-400">
          Cole a URL das suas conversas já existentes no ChatGPT e no Gemini
        </p>
      </div>

      <div class="space-y-4">
        <!-- ChatGPT URL -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">
            URL da conversa do ChatGPT
          </label>
          <input
            v-model="gptUrl"
            type="url"
            placeholder="https://chatgpt.com/c/..."
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100
                   placeholder-gray-500 focus:outline-none focus:border-emerald-600
                   text-sm font-mono"
          />
        </div>

        <!-- Gemini URL -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">
            URL da conversa do Gemini
          </label>
          <input
            v-model="gemUrl"
            type="url"
            placeholder="https://gemini.google.com/app/..."
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100
                   placeholder-gray-500 focus:outline-none focus:border-blue-600
                   text-sm font-mono"
          />
        </div>

        <!-- Connect button -->
        <button
          @click="connect"
          :disabled="!canConnect || connecting"
          class="w-full py-2.5 rounded-lg font-medium text-sm transition-colors
                 bg-emerald-600 hover:bg-emerald-700 text-white
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ connecting ? 'Conectando...' : 'Conectar sessões' }}
        </button>

        <!-- Status -->
        <div v-if="error" class="text-sm text-red-400 bg-red-900/20 rounded-lg p-3 whitespace-pre-wrap">
          {{ error }}
        </div>

        <!-- Per-provider status -->
        <div class="space-y-2">
          <div v-if="gptStatus" class="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
               :class="gptStatus.success ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'">
            <span>{{ gptStatus.success ? '\u2705 ChatGPT conectado' : '\u274C ChatGPT: ' + gptStatus.error }}</span>
            <button v-if="!gptStatus.success" @click="retryGpt" class="underline hover:text-white ml-auto">Tentar novamente</button>
          </div>
          <div v-if="gemStatus" class="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
               :class="gemStatus.success ? 'bg-blue-900/20 text-blue-400' : 'bg-red-900/20 text-red-400'">
            <span>{{ gemStatus.success ? '\u2705 Gemini conectado' : '\u274C Gemini: ' + gemStatus.error }}</span>
            <button v-if="!gemStatus.success" @click="retryGem" class="underline hover:text-white ml-auto">Tentar novamente</button>
          </div>
        </div>

        <div class="text-xs text-gray-600 text-center">
          O app abre cada chat em um perfil persistente do navegador.
          Sua sessão de login é preservada entre reinicializações.
        </div>

        <div v-if="!isElectron" class="text-sm text-amber-400 bg-amber-900/20 rounded-lg p-3 text-center">
          Esta é a pré-visualização do navegador. Use a <strong>janela do Electron</strong> intitulada "Conselho de IA" que foi aberta automaticamente.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useChatStore } from '../stores/chat.js'
import { api, isElectron } from '../api.js'

const store = useChatStore()

const gptUrl = ref('https://chatgpt.com/c/6a30575c-f7e0-83e9-beb7-6d8a8c001a46')
const gemUrl = ref('https://gemini.google.com/app/c7aad7b8589daa41?hl=pt-BR')
const connecting = ref(false)
const error = ref('')
const gptStatus = ref(null)
const gemStatus = ref(null)

const canConnect = computed(() => {
  return gptUrl.value.trim() || gemUrl.value.trim()
})

async function connect() {
  if (!canConnect.value) return
  connecting.value = true
  error.value = ''
  gptStatus.value = null
  gemStatus.value = null

  try {
    const result = await store.connectSessions(gptUrl.value.trim(), gemUrl.value.trim())
    gptStatus.value = result.chatgpt
    gemStatus.value = result.gemini

    const failures = []
    if (!result.chatgpt.success) failures.push('ChatGPT: ' + result.chatgpt.error)
    if (!result.gemini.success) failures.push('Gemini: ' + result.gemini.error)

    if (failures.length === 2) {
      error.value = 'As duas sessões falharam. Verifique se você está logado em cada plataforma.\n\nAbra a janela do navegador que apareceu, faça login manualmente e clique em "Conectar sessões" novamente.'
    } else if (failures.length === 1) {
      error.value = failures[0]
    }
  } catch (e) {
    error.value = e.message
  } finally {
    connecting.value = false
  }
}

async function retryGpt() {
  if (!gptUrl.value.trim()) return
  connecting.value = true
  gptStatus.value = null
  try {
    const r = await api.connectSession('chatgpt', gptUrl.value.trim())
    gptStatus.value = r
    if (r.success) store.chatgptConnected = true
  } catch (e) {
    gptStatus.value = { success: false, error: e.message }
  } finally {
    connecting.value = false
  }
}

async function retryGem() {
  if (!gemUrl.value.trim()) return
  connecting.value = true
  gemStatus.value = null
  try {
    const r = await api.connectSession('gemini', gemUrl.value.trim())
    gemStatus.value = r
    if (r.success) store.geminiConnected = true
  } catch (e) {
    gemStatus.value = { success: false, error: e.message }
  } finally {
    connecting.value = false
  }
}
</script>
