import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { api } from '../api.js'
import { COUNCIL_TEMPLATES, renderTemplate } from '../councilTemplates.js'

const MODEL_A_PROVIDER = 'chatgpt'
const MODEL_B_PROVIDER = 'gemini'

export const useChatStore = defineStore('chat', () => {
  const phase = ref('setup') // 'setup' | 'chat'
  const messages = ref([])
  const chatgptConnected = ref(false)
  const geminiConnected = ref(false)
  const chatgptUrl = ref('')
  const geminiUrl = ref('')
  const sending = ref(false)
  const round = ref(0)
  const chatgptMsgCount = ref(0)
  const geminiMsgCount = ref(0)
  const providerLoading = ref({ chatgpt: false, gemini: false })
  const autoCouncilRunning = ref(false)
  const deepseekModel = ref('deepseek-r1')
  const deepseekMessages = ref([])
  const deepseekLoading = ref(false)
  const selectedMessageIds = ref({ chatgpt: '', gemini: '' })
  const council = ref({
    userPrompt: '',
    pendingPhase: '',
    modelAResponse: '',
    modelBResponse: '',
    modelAReview: '',
    modelBReview: '',
    modelAFinalVote: '',
    modelBFinalVote: '',
    modelAFinalAnswer: '',
    modelBFinalAnswer: '',
    lastGeneratedPrompts: { chatgpt: '', gemini: '' }
  })

  const lastMessages = computed(() => messages.value.slice(-100))
  const bothModelsConnected = computed(() => chatgptConnected.value && geminiConnected.value)
  const workflowBusy = computed(() => sending.value || providerLoading.value.chatgpt || providerLoading.value.gemini || deepseekLoading.value || autoCouncilRunning.value)
  const canSendSamePromptToBoth = computed(() => bothModelsConnected.value && !workflowBusy.value)
  const canCrossReview = computed(() => bothModelsConnected.value && !workflowBusy.value &&
    !!council.value.userPrompt && !!council.value.modelAResponse && !!council.value.modelBResponse)
  const canFinalVote = computed(() => canCrossReview.value &&
    !!council.value.modelAReview && !!council.value.modelBReview)
  const canApplyCaveats = computed(() => canFinalVote.value &&
    !!council.value.modelAFinalVote && !!council.value.modelBFinalVote)

  function updateStatus(status) {
    chatgptConnected.value = status.chatgpt?.connected || false
    geminiConnected.value = status.gemini?.connected || false
    chatgptMsgCount.value = status.chatgpt?.messageCount || 0
    geminiMsgCount.value = status.gemini?.messageCount || 0
  }

  async function connectSessions(chatgptUrl_, geminiUrl_) {
    chatgptUrl.value = chatgptUrl_
    geminiUrl.value = geminiUrl_

    // Connect sequentially to avoid race conditions in Playwright
    const gptResult = await api.connectSession('chatgpt', chatgptUrl_)
    const gemResult = await api.connectSession('gemini', geminiUrl_)

    chatgptConnected.value = gptResult.success
    geminiConnected.value = gemResult.success

    if (gptResult.success || gemResult.success) phase.value = 'chat'

    return { chatgpt: gptResult, gemini: gemResult }
  }

  // Parse @gemini / @gpt / @all tags from the start of the message
  function parseTarget(text) {
    const match = text.match(/^@(gemini|gem|gpt|chatgpt|chat|all|todos)\b\s*(.*)/i)
    if (!match) return { providers: null, text, target: null }

    const tag = match[1].toLowerCase()
    const cleanText = match[2].trim()

    if (tag === 'all' || tag === 'todos') return { providers: null, text: cleanText, target: 'all' }
    if (tag === 'gemini' || tag === 'gem') return { providers: ['gemini'], text: cleanText, target: 'gemini' }
    return { providers: ['chatgpt'], text: cleanText, target: 'chatgpt' }
  }

  function isProviderConnected(provider) {
    return provider === 'chatgpt' ? chatgptConnected.value : geminiConnected.value
  }

  function providerModelKey(provider) {
    if (provider === MODEL_A_PROVIDER) return 'modelA'
    if (provider === MODEL_B_PROVIDER) return 'modelB'
    return ''
  }

  function fieldForPhase(workflowPhase, provider) {
    const model = providerModelKey(provider)
    if (!model) return ''

    const fields = {
      initial: { modelA: 'modelAResponse', modelB: 'modelBResponse' },
      review: { modelA: 'modelAReview', modelB: 'modelBReview' },
      vote: { modelA: 'modelAFinalVote', modelB: 'modelBFinalVote' },
      final: { modelA: 'modelAFinalAnswer', modelB: 'modelBFinalAnswer' }
    }

    return fields[workflowPhase]?.[model] || ''
  }

  function isPhaseComplete(workflowPhase) {
    if (workflowPhase === 'initial') return !!council.value.modelAResponse && !!council.value.modelBResponse
    if (workflowPhase === 'review') return !!council.value.modelAReview && !!council.value.modelBReview
    if (workflowPhase === 'vote') return !!council.value.modelAFinalVote && !!council.value.modelBFinalVote
    if (workflowPhase === 'final') return !!council.value.modelAFinalAnswer && !!council.value.modelBFinalAnswer
    return false
  }

  function resetCouncilForPrompt(userPrompt) {
    council.value.userPrompt = userPrompt
    council.value.pendingPhase = ''
    council.value.modelAResponse = ''
    council.value.modelBResponse = ''
    council.value.modelAReview = ''
    council.value.modelBReview = ''
    council.value.modelAFinalVote = ''
    council.value.modelBFinalVote = ''
    council.value.modelAFinalAnswer = ''
    council.value.modelBFinalAnswer = ''
    council.value.lastGeneratedPrompts = { chatgpt: '', gemini: '' }
  }

  function selectedMessage(provider) {
    const id = selectedMessageIds.value[provider]
    if (!id) return null
    return messages.value.find(msg => msg.id === id && msg.provider === provider && msg.role !== 'user') || null
  }

  function latestAssistantMessage(provider, workflowPhase = '') {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.role === 'user' || msg.provider !== provider) continue
      if (workflowPhase && msg.workflowPhase !== workflowPhase) continue
      return msg
    }
    return null
  }

  function latestUserMessage() {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]
      if (msg.role === 'user' && msg.content) return msg.content
    }
    return ''
  }

  function selectedOrLatest(provider, workflowPhase, fallback = '') {
    const selected = selectedMessage(provider)
    if (selected?.content) return selected.content
    const latestForPhase = latestAssistantMessage(provider, workflowPhase)
    if (latestForPhase?.content) return latestForPhase.content
    const latest = latestAssistantMessage(provider)
    return fallback || latest?.content || ''
  }

  function toggleSelectedMessage(provider, id) {
    selectedMessageIds.value = {
      ...selectedMessageIds.value,
      [provider]: selectedMessageIds.value[provider] === id ? '' : id
    }
  }

  function baseCouncilVariables(userPrompt = '') {
    return {
      USER_PROMPT: (userPrompt || council.value.userPrompt || '').trim(),
      MODEL_A_RESPONSE: council.value.modelAResponse || selectedOrLatest('chatgpt', 'initial'),
      MODEL_B_RESPONSE: council.value.modelBResponse || selectedOrLatest('gemini', 'initial'),
      MODEL_A_REVIEW: council.value.modelAReview || selectedOrLatest('chatgpt', 'review'),
      MODEL_B_REVIEW: council.value.modelBReview || selectedOrLatest('gemini', 'review'),
      MODEL_A_FINAL_VOTE: council.value.modelAFinalVote || selectedOrLatest('chatgpt', 'vote'),
      MODEL_B_FINAL_VOTE: council.value.modelBFinalVote || selectedOrLatest('gemini', 'vote')
    }
  }

  function buildCouncilPrompts(action, userPrompt = '') {
    const vars = baseCouncilVariables(userPrompt)

    if (action === 'same') {
      const prompt = renderTemplate(COUNCIL_TEMPLATES.samePrompt, vars)
      return { chatgpt: prompt, gemini: prompt }
    }

    if (action === 'primer') {
      return { chatgpt: COUNCIL_TEMPLATES.primer, gemini: COUNCIL_TEMPLATES.primer }
    }

    if (action === 'review') {
      const modelAResponse = selectedOrLatest('chatgpt', 'initial', vars.MODEL_A_RESPONSE)
      const modelBResponse = selectedOrLatest('gemini', 'initial', vars.MODEL_B_RESPONSE)
      return {
        chatgpt: renderTemplate(COUNCIL_TEMPLATES.crossReview, {
          ...vars,
          OWN_RESPONSE: modelAResponse,
          OTHER_RESPONSE: modelBResponse
        }),
        gemini: renderTemplate(COUNCIL_TEMPLATES.crossReview, {
          ...vars,
          OWN_RESPONSE: modelBResponse,
          OTHER_RESPONSE: modelAResponse
        })
      }
    }

    if (action === 'vote') {
      const selectedA = selectedMessage('chatgpt')
      const selectedB = selectedMessage('gemini')
      const prompt = renderTemplate(COUNCIL_TEMPLATES.finalVote, {
        ...vars,
        MODEL_A_REVIEW: selectedA?.content || vars.MODEL_A_REVIEW,
        MODEL_B_REVIEW: selectedB?.content || vars.MODEL_B_REVIEW
      })
      return { chatgpt: prompt, gemini: prompt }
    }

    if (action === 'final') {
      const selectedA = selectedMessage('chatgpt')
      const selectedB = selectedMessage('gemini')
      const prompt = renderTemplate(COUNCIL_TEMPLATES.finalAnswer, {
        ...vars,
        MODEL_A_FINAL_VOTE: selectedA?.content || vars.MODEL_A_FINAL_VOTE,
        MODEL_B_FINAL_VOTE: selectedB?.content || vars.MODEL_B_FINAL_VOTE
      })
      return { chatgpt: prompt, gemini: prompt }
    }

    return { chatgpt: '', gemini: '' }
  }

  async function sendPromptMap(promptMap, options = {}) {
    const providers = Object.keys(promptMap).filter(provider => promptMap[provider]?.trim() && isProviderConnected(provider))
    if (!providers.length || sending.value) return { error: 'No connected provider for this prompt' }

    sending.value = true
    round.value++

    const displayContent = options.displayContent || providers.map(provider => promptMap[provider]).join('\n\n---\n\n')
    messages.value.push({
      id: 'user-' + Date.now(),
      provider: 'user',
      role: 'user',
      content: displayContent,
      modelPrompts: { ...promptMap },
      target: options.target || (providers.length > 1 ? 'all' : providers[0]),
      workflowPhase: options.workflowPhase || '',
      timestamp: new Date().toISOString()
    })

    if (options.workflowPhase) council.value.pendingPhase = options.workflowPhase

    for (const provider of providers) {
      providerLoading.value[provider] = true
      council.value.lastGeneratedPrompts[provider] = promptMap[provider]
    }

    try {
      const results = {}
      for (const provider of providers) {
        const result = await api.sendMessage(promptMap[provider], [provider])
        results[provider] = result?.[provider] || result
        if (results[provider]?.success === false) providerLoading.value[provider] = false
      }
      return results
    } catch (err) {
      for (const provider of providers) providerLoading.value[provider] = false
      return { error: err.message }
    } finally {
      sending.value = false
    }
  }

  async function sendMessage(text) {
    if (!text.trim() || sending.value) return

    const { providers: targeted, text: cleanText, target } = parseTarget(text)
    if (!cleanText.trim()) return

    let providers = targeted
    if (!providers) {
      providers = []
      if (chatgptConnected.value) providers.push('chatgpt')
      if (geminiConnected.value) providers.push('gemini')
    } else {
      providers = providers.filter(isProviderConnected)
    }

    const promptMap = {}
    for (const provider of providers) promptMap[provider] = cleanText
    return sendPromptMap(promptMap, { displayContent: cleanText, target })
  }

  async function sendSamePromptToBoth(userPrompt) {
    const cleanPrompt = String(userPrompt || '').trim()
    if (!cleanPrompt || !canSendSamePromptToBoth.value) return

    resetCouncilForPrompt(cleanPrompt)
    const prompts = buildCouncilPrompts('same', cleanPrompt)
    return sendPromptMap(prompts, { displayContent: cleanPrompt, target: 'all', workflowPhase: 'initial' })
  }

  async function sendCouncilPrimer() {
    if (workflowBusy.value) return
    const prompts = buildCouncilPrompts('primer')
    return sendPromptMap(prompts, { displayContent: prompts.chatgpt, target: 'all' })
  }

  async function sendCrossReviewBothAnswers() {
    if (workflowBusy.value) return
    const prompts = buildCouncilPrompts('review')
    return sendPromptMap(prompts, { displayContent: 'Revisão cruzada das duas respostas', target: 'all', workflowPhase: 'review' })
  }

  async function sendFinalDecisionVote() {
    if (workflowBusy.value) return
    const prompts = buildCouncilPrompts('vote')
    return sendPromptMap(prompts, { displayContent: 'Votação da decisão final', target: 'all', workflowPhase: 'vote' })
  }

  async function sendApplyCaveatsFinalAnswer() {
    if (workflowBusy.value) return
    const prompts = buildCouncilPrompts('final')
    return sendPromptMap(prompts, { displayContent: 'Aplicar ressalvas / gerar resposta final', target: 'all', workflowPhase: 'final' })
  }

  function buildDeepSeekConsensusPrompt() {
    const modelLabel = deepseekModel.value === 'deepseek-v3' ? 'DeepSeek V3' : 'DeepSeek R1'
    const gptAnswer = latestAssistantMessage('chatgpt')?.content || council.value.modelAFinalAnswer || council.value.modelAResponse
    const geminiAnswer = latestAssistantMessage('gemini')?.content || council.value.modelBFinalAnswer || council.value.modelBResponse
    const originalPrompt = council.value.userPrompt || latestUserMessage()

    if (!gptAnswer || !geminiAnswer) {
      return { error: 'Preciso de pelo menos uma resposta do GPT e uma resposta do Gemini para consolidar.' }
    }

    return {
      prompt: `You are ${modelLabel} acting as the final senior engineering adjudicator.

Use careful private analysis before answering, but do not reveal private chain-of-thought. Output only the final audit report with concise technical rationale.

Goal: consolidate the latest ChatGPT response and the latest Gemini response into one final decision. Prioritize correctness, runtime safety, data integrity, payment safety, security, compatibility, and maintainability.

Use evidence labels where useful:
- VERIFIED: directly supported by the provided responses
- LIKELY: supported by indirect evidence
- UNKNOWN: cannot be verified from the provided material
- SPECULATION: weak assumption, should not drive approval

Original user prompt/context:
${originalPrompt || '[UNKNOWN]'}

Model A / ChatGPT response:
${gptAnswer}

Model B / Gemini response:
${geminiAnswer}

Required output:
1. Final Decision
2. Agreements Between Models
3. Disagreements / Corrections
4. Missing Information
5. Blockers
6. Technical Debt
7. Risk Assessment: LOW / MEDIUM / HIGH / CRITICAL
8. Recommendation: APPROVE / NEEDS REVISION / BLOCK

Be concise. If one model is wrong, say exactly why. If evidence is insufficient, mark UNKNOWN instead of guessing.`
    }
  }

  async function consolidateWithDeepSeek() {
    if (workflowBusy.value) return { error: 'Fluxo ocupado. Aguarde as respostas terminarem.' }
    const result = buildDeepSeekConsensusPrompt()
    if (result.error) return result

    const model = deepseekModel.value
    const timestamp = Date.now()
    deepseekLoading.value = true
    deepseekMessages.value.push({
      id: `deepseek-user-${timestamp}`,
      provider: 'deepseek',
      role: 'user',
      content: result.prompt,
      target: 'deepseek',
      model,
      timestamp: new Date().toISOString()
    })

    try {
      const response = await api.requestDeepSeek(result.prompt, model)
      if (!response?.success) {
        const error = response?.error || 'DeepSeek não retornou uma resposta válida.'
        deepseekMessages.value.push({
          id: `deepseek-error-${timestamp}`,
          provider: 'deepseek',
          role: 'assistant',
          content: `Erro ao consolidar com DeepSeek: ${error}`,
          model,
          error: true,
          timestamp: new Date().toISOString()
        })
        return { success: false, error }
      }

      deepseekMessages.value.push({
        id: `deepseek-${timestamp}`,
        provider: 'deepseek',
        role: 'assistant',
        content: response.content,
        model: response.model || model,
        timestamp: new Date().toISOString()
      })
      return response
    } catch (err) {
      const error = err.message || 'Falha desconhecida no DeepSeek.'
      deepseekMessages.value.push({
        id: `deepseek-error-${timestamp}`,
        provider: 'deepseek',
        role: 'assistant',
        content: `Erro ao consolidar com DeepSeek: ${error}`,
        model,
        error: true,
        timestamp: new Date().toISOString()
      })
      return { success: false, error }
    } finally {
      deepseekLoading.value = false
    }
  }

  function waitForBothProviders(timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
      if (!providerLoading.value.chatgpt && !providerLoading.value.gemini && !council.value.pendingPhase) {
        return setTimeout(resolve, 300)
      }

      const timeout = setTimeout(() => {
        stop()
        reject(new Error('Tempo limite excedido aguardando respostas dos provedores.'))
      }, timeoutMs)

      const stop = watch(
        providerLoading,
        (val) => {
          if (!val.chatgpt && !val.gemini && !council.value.pendingPhase) {
            clearTimeout(timeout)
            stop()
            setTimeout(resolve, 300)
          }
        },
        { deep: true }
      )
    })
  }

  async function runFullAutoCouncil(text) {
    const cleanText = String(text || '').trim()
    if (!cleanText) return { error: 'Texto vazio' }
    if (workflowBusy.value) return { error: 'Fluxo ocupado. Aguarde as respostas terminarem.' }

    autoCouncilRunning.value = true
    const STEP_TIMEOUT = 300000

    try {
      // Step 1: Primer
      await sendCouncilPrimer()
      await waitForBothProviders(STEP_TIMEOUT)

      // Step 2: Same prompt
      resetCouncilForPrompt(cleanText)
      await sendSamePromptToBoth(cleanText)
      await waitForBothProviders(STEP_TIMEOUT)

      // Step 3: Cross-review
      await sendCrossReviewBothAnswers()
      await waitForBothProviders(STEP_TIMEOUT)

      // Step 4: Final vote
      await sendFinalDecisionVote()
      await waitForBothProviders(STEP_TIMEOUT)

      // Step 5: Final answer
      await sendApplyCaveatsFinalAnswer()
      await waitForBothProviders(STEP_TIMEOUT)

      // Step 6: DeepSeek consolidation
      await consolidateWithDeepSeek()

      return { success: true }

    } catch (err) {
      return { error: err.message || 'Erro durante o conselho automático.' }
    } finally {
      autoCouncilRunning.value = false
    }
  }

  async function forwardMessage(msg) {
    if (!msg?.content || !msg.provider || msg.role === 'user' || sending.value) return

    const to = msg.provider === 'chatgpt' ? 'gemini' : 'chatgpt'
    const fromLabel = msg.provider === 'chatgpt' ? 'GPT' : 'Gemini'
    const toLabel = to === 'chatgpt' ? 'GPT' : 'Gemini'
    const forwardedPrompt = `[${fromLabel} respondeu:] — ${msg.content}`

    messages.value.push({
      id: 'forward-' + Date.now(),
      provider: 'user',
      role: 'user',
      content: `Mensagem encaminhada do ${fromLabel} para ${toLabel}. Clique para ver a original.`,
      displayPrompts: {
        [to]: `Mensagem encaminhada do ${fromLabel}. Clique para ver a original.`
      },
      modelPrompts: { [to]: forwardedPrompt },
      target: to,
      forwardedFromId: msg.id,
      forwardedFromProvider: msg.provider,
      timestamp: new Date().toISOString()
    })

    providerLoading.value[to] = true
    return api.forwardMessage(msg.provider, msg.content)
  }

  function addMessages(newMessages) {
    for (const msg of newMessages) {
      const pendingPhase = council.value.pendingPhase
      const storedMsg = msg.role !== 'user' && pendingPhase
        ? { ...msg, workflowPhase: pendingPhase }
        : msg
      const exists = messages.value.find(m => m.id === storedMsg.id)
      if (!exists) messages.value.push(storedMsg)

      if (storedMsg.role !== 'user' && storedMsg.provider) {
        providerLoading.value[storedMsg.provider] = false

        const field = fieldForPhase(pendingPhase, storedMsg.provider)
        if (field && storedMsg.content) {
          council.value[field] = council.value[field]
            ? council.value[field] + '\n\n' + storedMsg.content
            : storedMsg.content
          if (isPhaseComplete(pendingPhase)) council.value.pendingPhase = ''
        }
      }
    }
  }

  function loadHistory(msgs) {
    messages.value = msgs
  }

  async function cleanDOM() {
    await api.cleanDOM(40)
    chatgptMsgCount.value = 40
    geminiMsgCount.value = 40
  }

  async function disconnectAll() {
    await Promise.all([
      api.disconnectSession('chatgpt'),
      api.disconnectSession('gemini')
    ])
    chatgptConnected.value = false
    geminiConnected.value = false
    providerLoading.value = { chatgpt: false, gemini: false }
    phase.value = 'setup'
    messages.value = []
  }

  return {
    phase,
    messages,
    lastMessages,
    chatgptConnected,
    geminiConnected,
    chatgptUrl,
    geminiUrl,
    sending,
    providerLoading,
    deepseekModel,
    deepseekMessages,
    deepseekLoading,
    autoCouncilRunning,
    selectedMessageIds,
    workflowBusy,
    round,
    chatgptMsgCount,
    geminiMsgCount,
    council,
    bothModelsConnected,
    canSendSamePromptToBoth,
    canCrossReview,
    canFinalVote,
    canApplyCaveats,
    updateStatus,
    connectSessions,
    sendMessage,
    sendSamePromptToBoth,
    sendCouncilPrimer,
    sendCrossReviewBothAnswers,
    sendFinalDecisionVote,
    sendApplyCaveatsFinalAnswer,
    consolidateWithDeepSeek,
    runFullAutoCouncil,
    forwardMessage,
    selectedMessage,
    toggleSelectedMessage,
    buildCouncilPrompts,
    addMessages,
    loadHistory,
    cleanDOM,
    disconnectAll
  }
})
