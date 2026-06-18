<template>
  <div class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4">
    <div class="grid h-full min-h-0 min-w-[1350px] grid-cols-3 gap-3">
      <MessageFeed
        title="GPT"
        subtitle="Modelo A"
        provider-key="chatgpt"
        :messages="chatgptMessages"
        :selected-message="store.selectedMessage('chatgpt')"
        empty-text="Ainda não há conversa com o GPT."
      />

      <MessageFeed
        title="Gemini"
        subtitle="Modelo B"
        provider-key="gemini"
        :messages="geminiMessages"
        :selected-message="store.selectedMessage('gemini')"
        empty-text="Ainda não há conversa com o Gemini."
      />

      <MessageFeed
        title="DeepSeek"
        :subtitle="deepseekSubtitle"
        provider-key="deepseek"
        :messages="store.deepseekMessages"
        empty-text="Ainda não há consolidação DeepSeek."
        :interactive="false"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useChatStore } from '../stores/chat.js'
import MessageFeed from './MessageFeed.vue'

const store = useChatStore()

const chatgptMessages = computed(() => columnMessages('chatgpt'))
const geminiMessages = computed(() => columnMessages('gemini'))
const deepseekSubtitle = computed(() => {
  return store.deepseekModel === 'deepseek-v3' ? 'Consolidador V3' : 'Consolidador R1'
})

function columnMessages(provider) {
  return store.lastMessages
    .map(msg => messageForProvider(msg, provider))
    .filter(Boolean)
}

function messageForProvider(msg, provider) {
  if (msg.role !== 'user') return msg.provider === provider ? msg : null

  const providerPrompt = msg.modelPrompts?.[provider]
  const isTargeted = !msg.target || msg.target === 'all' || msg.target === provider
  if (!providerPrompt && !isTargeted) return null

  return {
    ...msg,
    id: `${msg.id}-${provider}`,
    provider,
    content: msg.displayPrompts?.[provider] || providerPrompt || msg.content
  }
}
</script>
