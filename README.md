# Voice-to-Jira

**Agentic AI for creating Jira stories from voice.** A LangGraph-based system that turns spoken ideas into well-structured Jira stories with human-in-the-loop approval.

---

## Overview

Voice-to-Jira combines **speech-to-text**, **LLM-powered story generation**, and **Jira integration** in a single pipeline. You describe a feature or user story by voice; the system transcribes it, generates title, description, and acceptance criteria using the same logic as the standalone LangGraph Jira agent; you review and approve; the story is created in Jira.

- **Voice interface** — React app with Deepgram STT/TTS: speak your idea, get a spoken prompt and feedback.
- **LangGraph workflow** — CLI agent (`jira-agent`) implements a state graph: *Generate → Format → Human approval → Create Jira*, with checkpointing and conditional edges.
- **Shared story engine** — `jira-service` provides the LLM story-generation logic used by both the voice API and the LangGraph agent for consistency.
- **Human-in-the-loop** — Approve or reject the generated story before it is created in Jira (in the UI or at the CLI).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Voice-to-Jira Pipeline                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   [React Client]  ──►  [Express API]  ──►  Deepgram (STT/TTS)                │
│        │                      │                                              │
│        │                      ▼                                              │
│        │               jira-service  ◄──  Same story logic as jira-agent     │
│        │               (generate-story, create-jira)                         │
│        │                      │                                              │
│        └──────────────────────┼──────────────────────────────────────────────┤
│                               ▼                                              │
│                        [Jira REST API]                                       │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Standalone LangGraph Agent (CLI)                                            │
│                                                                              │
│   Topic  ──►  generate_story  ──►  format_preview  ──►  human_approval       │
│                (LLM)                  (preview)           (interrupt)        │
│                                                               │              │
│                                    approved ──►  create_jira  ──►  Jira      │
│                                    rejected ──►  END                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Client:** React (Vite), voice recording, story preview, approve/reject.
- **Server:** Express, Deepgram integration, `/api` routes that call `jira-service`.
- **jira-service:** Shared module for LLM story generation and Jira issue creation (used by API and by the LangGraph agent’s generate/create nodes).
- **jira-agent:** LangGraph `StateGraph` with nodes for generation, formatting, human approval, and Jira creation; uses `MemorySaver` for checkpointing.

---

## Tech Stack

| Layer        | Technology |
|-------------|------------|
| Agent / LLM | LangGraph, LangChain, Google Gemini (Gemini 2.5 Flash) |
| Voice       | Deepgram (STT & TTS) |
| Backend     | Node.js, Express, TypeScript |
| Frontend    | React, Vite, TypeScript |
| Issue tracking | Jira REST API (Atlassian) |

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **API keys**
  - [Deepgram](https://console.deepgram.com/) — voice-to-Jira app (STT/TTS)
  - [Google AI](https://aistudio.google.com/apikey) — Gemini for story generation
  - Jira (email, API token, domain, project key) — [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## Setup

### 1. Environment

Copy the example env and set your keys:

```bash
cp .env.example .env
```

Edit `.env` and configure at least:

| Variable | Description |
|----------|-------------|
| `DEEPGRAM_API_KEY` | Deepgram API key (voice app) |
| `GOOGLE_API_KEY`   | Google AI / Gemini API key |
| `JIRA_EMAIL`       | Jira account email |
| `JIRA_API_TOKEN`   | Jira API token |
| `JIRA_DOMAIN`      | Jira site name (e.g. `mycompany` for `mycompany.atlassian.net`) |
| `JIRA_PROJECT_KEY` | Jira project key (e.g. `PROJ`) |

### 2. Install dependencies

From the repository root:

```bash
npm install
cd client && npm install && cd ..
```

### 3. Run

**Voice-to-Jira (web):**

- Terminal 1 — API: `npm run server` (default: http://localhost:4000)
- Terminal 2 — UI: `npm run client` (default: http://localhost:5173; `/api` is proxied to the server)

**LangGraph Jira agent (CLI):**

```bash
npm run jira-agent
# Optional: pass topic as argument
npm run jira-agent -- "As a user I want to filter search by date"
```

**Other agents:**

- Email sender (ReAct-style agent): `npm run email-agent`

---

## Voice-to-Jira flow (web)

1. Open the client (e.g. http://localhost:5173) and start **Create Jira story**. The app plays a short prompt via Deepgram TTS (e.g. *“What Jira story do you want to build?”*).
2. Speak your idea while the voice wave is active; stop recording when done.
3. The server transcribes the audio (Deepgram STT), sends the transcript to `jira-service` for story generation, and returns title, description, and acceptance criteria.
4. Review the story in the right-hand panel. Choose **Approve** to create it in Jira or **Reject** to discard.
5. On approve, the server calls the Jira API and displays the new issue key and link.

---

## API reference (server)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/speak` | Body: `{ "text": "..." }`. Returns audio (e.g. `audio/mpeg`) via Deepgram TTS. |
| `POST` | `/api/transcribe` | Multipart form field `audio`. Returns `{ "transcript": "..." }` (Deepgram STT). |
| `POST` | `/api/generate-story` | Body: `{ "topic": "..." }`. Returns `{ "story": { title, description, acceptanceCriteria } }`. |
| `POST` | `/api/create-jira` | Body: `{ title, description, acceptanceCriteria }`. Returns `{ jiraKey, jiraUrl }`. |

---

## Project structure

```
├── client/                 # React (Vite) voice UI
│   ├── src/
│   │   ├── components/     # VoiceCard, StoryPreview, etc.
│   │   └── ...
│   └── vite.config.ts      # /api proxy to server
├── server/                 # Express API
│   ├── routes/             # voiceRoutes, storyRoutes
│   ├── services/           # deepgram
│   └── app.ts, index.ts
├── jira-agent.ts           # LangGraph StateGraph (CLI, human-in-the-loop)
├── jira-service.ts         # Shared story generation + Jira creation
├── email-sender-agent.ts   # ReAct-style email agent (optional)
├── agent.ts                # Email-sender agent (ReAct, LangGraph prebuilt)
├── index.ts                # Optional entry
├── .env.example
└── package.json
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run server` | Start Express API (default port 4000). |
| `npm run client` | Start Vite dev server for React app (default port 5173). |
| `npm run jira-agent` | Run LangGraph Jira story agent (CLI, human-in-the-loop). |
| `npm run email-agent` | Run email-sender agent demo. |
| `npm run dev` | Run `index.ts` with ts-node (if used). |

---

## License

See repository license file. Use of third-party APIs (Deepgram, Google, Atlassian) is subject to their respective terms of service.
