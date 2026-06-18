<div align="center">

```
 █████╗ ██████╗ ████████╗██████╗ ██╗ ██╗   ██╗███████╗
██╔══██╗╚════██╗╚══██╔══╝██╔══██╗╚═╝ ██║   ██║██╔════╝
███████║ █████╔╝   ██║   ██████╔╝██╗ ██║   ██║███████╗
██╔══██║ ╚═══██╗   ██║   ██╔══██╗╚═╝ ██║   ██║╚════██║
██║  ██║██████╔╝   ██║   ██║  ██║██╗ ╚██████╔╝███████║
╚═╝  ╚═╝╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═════╝ ╚══════╝
```

<br />

# **AETRIUS**

**Oráculo de Decisão · Engineering Council · AI Triad**

<br />

[![FREE](https://img.shields.io/badge/💯_100%25_FREE-sem_api_key-22c55e?style=for-the-badge)]()
[![Electron](https://img.shields.io/badge/Electron-30+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue.js](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.45-45BA4B?logo=playwright&logoColor=white)](https://playwright.dev/)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-R1_|_V3-4F46E5)]()

<br />

> ### 🤯 Zero API keys. Zero subscriptions. Zero gastos.
>
> **ChatGPT, Gemini e DeepSeek** — todos acessados **de graça**, sem pagar um centavo.
> Só automação de navegador + proxy aberto. O **suco do free**.

<br />

---

<br />

</div>

## 📖 Índice

- [💯 100% Free — Como?](#-100-free--como)
- [🤔 O Problema](#-o-problema)
- [⚙️ Como Funciona](#-como-funciona)
- [🧠 Stack](#-stack)
- [🚀 Quick Start](#-quick-start)
- [⚡ Fluxo do Conselho](#-fluxo-do-conselho)
- [🔌 DeepSeek Nativo](#-deepseek-nativo)
- [📁 Estrutura do Projeto](#-estrutura-do-projeto)
- [📦 Comandos](#-comandos)
- [🗺️ Roadmap](#-roadmap)

---

## 💯 100% Free — Como?

**Aetrius não usa nenhuma API paga.** Nada de OpenAI API key, nada de Google AI Studio, nada de DeepSeek credits.

| Provedor | Método | Quanto custa? |
|----------|--------|:-------------:|
| **ChatGPT** | 🕸️ Playwright navega na web ChatGPT logada | **R$ 0** 🆓 |
| **Gemini** | 🕸️ Playwright navega no Gemini logado | **R$ 0** 🆓 |
| **DeepSeek** | 🔌 Proxy Vercel público (sem chave) | **R$ 0** 🆓 |
| **Electron** | Desktop app local | **R$ 0** 🆓 |

> Só precisa de uma conta gratuita do ChatGPT e Gemini (já existentes) e o Playwright instalado. **Zero débito no cartão.**

---

## 🤔 O Problema

**Nenhum modelo de IA é perfeito isoladamente.** Cada LLM tem vieses, lacunas de conhecimento e padrões de erro distintos.

**Aetrius resolve isso:** submete o mesmo problema para **3 modelos diferentes**, que deliberam em conselho — como um peer review de engenharia — e produzem uma **decisão consolidada e auditável**.

Tudo rodando local, tudo de graça.

---

## ⚙️ Como Funciona

```
  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
  │  ChatGPT    │  │   Gemini    │  │   DeepSeek   │
  │  (Modelo A) │  │  (Modelo B) │  │  (Árbitro)   │
  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘
         │               │                 │
         ▼               ▼                 ▼
  ┌──────────────────────────────────────────────┐
  │              Aetrius Core Engine              │
  │  ┌──────────┐  ┌─────────┐  ┌─────────────┐ │
  │  │ Council  │  │  Cross  │  │  DeepSeek   │ │
  │  │  Primer  │─▶│ Review  │─▶│Consolidation│ │
  │  └──────────┘  └─────────┘  └─────────────┘ │
  └──────────────────────────────────────────────┘
                         │
                         ▼
              ✅ Decisão Final
```

### Comunicação

| Provedor | Método | Autenticação |
|----------|--------|:------------:|
| **ChatGPT** | 🕸️ Playwright (browser automation) | Conta gratuita |
| **Gemini** | 🕸️ Playwright (browser automation) | Conta gratuita |
| **DeepSeek** | 🔌 API via Vercel proxy | Nenhuma |

---

## 🧠 Stack

| Camada | Tecnologia |
|--------|------------|
| **Desktop** | Electron 30+ |
| **Frontend** | Vue 3 + Pinia + Tailwind CSS |
| **Automação** | Playwright (Chromium headless) |
| **Consolidação** | DeepSeek API via proxy público |
| **Banco** | SQLite via better-sqlite3 |
| **Build** | Vite 5 + electron-builder |

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/vancourt/aetrius.git
cd aetrius

# Instalar dependências
npm install

# Desenvolvimento (Vue + Electron)
npm run dev

# Build produção
npm run build
```

> ⚠️ **Pré-requisitos:** Node.js 18+, navegador Chromium instalado pelo Playwright.

---

## ⚡ Fluxo do Conselho

### Passo a passo no app

| Fase | Ação | Descrição |
|------|------|-----------|
| **1.** `Iniciar Conselho` | Envia primer para ambos os modelos | Prepara o contexto de conselho |
| **2.** `Enviar mesmo prompt` | ChatGPT + Gemini recebem o problema | Respostas independentes |
| **3.** `Revisar respostas` | Cada modelo analisa a resposta do outro | Cross-review automático |
| **4.** `Votação final` | Cada modelo vota na melhor resposta | A, B, híbrido ou nenhum |
| **5.** `Aplicar ressalvas` | Geram resposta final com ajustes | Saída consolidada |
| **6.** `Consolidar DeepSeek` | DeepSeek arbitra tudo | Decisão final auditável |

### Prompt template (DeepSeek)

```
You are DeepSeek acting as the final senior engineering adjudicator.
Goal: consolidate ChatGPT and Gemini responses.

1. Final Decision
2. Agreements Between Models
3. Disagreements / Corrections
4. Missing Information / Blockers
5. Risk Assessment: LOW / MEDIUM / HIGH / CRITICAL
6. Recommendation: APPROVE / NEEDS REVISION / BLOCK
```

---

## 🔌 DeepSeek Nativo

Diferente de outros apps que abrem uma janela externa para testar DeepSeek, o **Aetrius** integra o modelo diretamente:

- ✅ Proxy nativo via IPC
- ✅ Seletor R1 ↔ V3 em tempo real
- ✅ Terceira coluna dedicada com o mesmo design visual
- ✅ Timeout inteligente de 5 minutos
- ✅ Mensagens de erro visíveis dentro do chat
- ✅ **Zero API key** — proxy público aberto

---

## 📁 Estrutura do Projeto

```
aetrius/
├── electron/
│   ├── main.cjs          # Processo principal + IPC handlers
│   ├── preload.cjs        # Bridge segura renderer ↔ main
│   ├── bridge.cjs         # Automação Playwright (ChatGPT/Gemini)
│   └── db.cjs             # SQLite (histórico)
├── src/
│   ├── components/
│   │   ├── ChatView.vue         # Container principal
│   │   ├── MessageList.vue      # Grid de 3 colunas
│   │   ├── MessageFeed.vue      # Coluna individual de mensagens
│   │   ├── InputBar.vue         # Barra de input + workflow
│   │   └── SessionSetup.vue     # Tela de conexão inicial
│   ├── stores/
│   │   └── chat.js              # Estado global (Pinia)
│   ├── api.js                   # Bridge renderer ↔ Electron
│   ├── councilTemplates.js      # Templates de prompt do conselho
│   ├── App.vue
│   ├── main.js
│   └── style.css
├── dist/                        # Build Vue (gerado)
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## 📦 Comandos

| Comando | Descrição |
|---------|-----------|
| `npm run dev:vue` | Inicia servidor Vite de dev |
| `npm run dev:electron` | Abre o Electron em modo dev |
| `npm run dev` | Ambos simultaneamente |
| `npm run build:vue` | Build da UI |
| `npm run build` | Build completo + empacotamento |

---

## 🗺️ Roadmap

- [ ] Streaming de tokens DeepSeek em tempo real
- [ ] Redimensionamento de colunas (drag)
- [ ] Salvamento de consolidações no SQLite
- [ ] Exportar decisão final como markdown/PDF
- [ ] Tema claro
- [ ] Suporte a mais modelos (Claude, Grok, etc.)

---

## 🏛️ Origem do Nome

> **Aetrius** — do latim *aether* ("o ar puro, o céu, a luz") + o sufixo *-ius*. Um oráculo digital onde três inteligências convergem para formar uma única verdade.

> Tudo de graça, porque inteligência não deveria ter paywall.

---

<div align="center">

<br />

**Feito com ☕, pouca paciência, muito Playwright e R$ 0,00 de API.**

<br />

</div>
