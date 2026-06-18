<template>
  <div class="h-full flex flex-col bg-gray-950">
    <!-- Header -->
    <header class="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-bold text-white tracking-tight">Conselho de IA</h1>
        <span class="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">v1.0</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            :class="store.chatgptConnected ? 'bg-green-500' : 'bg-red-500'"
          ></span>
          <span class="text-xs text-gray-400">Modelo A</span>
        </div>
        <div class="flex items-center gap-1.5 ml-2">
          <span
            class="w-2 h-2 rounded-full"
            :class="store.geminiConnected ? 'bg-green-500' : 'bg-red-500'"
          ></span>
          <span class="text-xs text-gray-400">Modelo B</span>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 flex overflow-hidden">
      <ChatView v-if="store.phase === 'chat'" />
      <SessionSetup v-else />
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useChatStore } from './stores/chat.js'
import { api } from './api.js'
import ChatView from './components/ChatView.vue'
import SessionSetup from './components/SessionSetup.vue'

const store = useChatStore()

let pollTimer = null

onMounted(async () => {
  const status = await api.getSessionStatus()
  store.updateStatus(status)
  if (status.chatgpt.connected || status.gemini.connected) {
    store.phase = 'chat'
    loadHistory()
  }

  pollTimer = setInterval(pollMessages, 1500)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

async function pollMessages() {
  if (store.phase !== 'chat') return
  try {
    const messages = await api.pollMessages()
    if (messages.length > 0) {
      store.addMessages(messages)
    }
  } catch {}
}

async function loadHistory() {
  const msgs = await api.getHistory(500, 0)
  if (msgs.length > 0) {
    store.loadHistory(msgs)
  }
}
</script>
