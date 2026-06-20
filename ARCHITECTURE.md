# Voice-Agent — Architecture

A site assistant that answers questions **and navigates the page** — by voice or text.
Built on LiveKit (real-time audio) with an OpenAI Agents SDK "brain".

```
Voice-Agent/
├── agent/   LiveKit voice worker (Python)      → deploys to LiveKit Cloud
├── web/     embeddable voice widget (Next.js)  → deploys to Vercel
├── server.py + app_agents.py + ingest.py       → text chat backend (FastAPI/Vercel)
└── static/widget.js                            → standalone text widget
```

## The brain: `triage_agent` (OpenAI Agents SDK)

Defined twice (kept in sync) so it ships with each deploy target:
- `agent/src/website_agents.py` — for the **voice** worker
- `app_agents.py` — for the **text** backend

It answers from a crawled `site_index.json` and exposes tools that return structured
`{action: ...}` outputs the frontend acts on:

| Tool | Action |
|---|---|
| `search_site_content` | answer from the index |
| `get_redirect_url` | `redirect` → navigate to a page |
| `navigate_history` | `history` → browser back/forward |
| `submit_website_form` / handoff → `lead_agent` | `form_submitted` |
| handoff → `booking_agent` | `schedule` → Calendly link |

`ingest.py` builds `site_index.json` (BFS crawl + LLM page classifier). Offline; re-run to refresh.

## Voice path (`agent/`)

`src/agent.py` runs the LiveKit pipeline: Deepgram STT → **bridge** → Cartesia TTS,
with Silero VAD, turn detection, and noise cancellation.

**The bridge** = `DefaultAgent.llm_node` override:
1. Each transcribed turn → `Runner.run_streamed(triage_agent, ...)`
2. Text deltas stream straight to TTS
3. Tool `{action}` outputs are published to the room on topic `lk.ui.action`
4. Context persists across turns via `to_input_list()`

The `AgentSession` `llm=` is a stub (required by the type, never invoked).
`preemptive_generation` is off because tools have side effects. Tests in `agent/tests/`.

## Web widget (`web/`)

The floating pill embedded on the site (injected via `public/embed.js` → `embed-popup.js`,
isolated in a Shadow DOM). Built separately with webpack — rerun `pnpm build-embed-popup-script`
after popup changes.

- `app/api/connection-details/route.ts` — mints the LiveKit token (holds the secret).
- `components/embed-popup/agent-client.tsx` — owns the `Room`; listens on
  `RoomEvent.DataReceived` (`lk.ui.action`).
- `lib/ui-actions.ts` — performs actions: `redirect` → `location`, `history` →
  `history.back()/forward()`, `schedule` → new tab.

## Conversation flow

```
mic → STT → llm_node → triage_agent (tools/handoffs) ─┬→ text → TTS → speaker
                                                       └→ {action} → data channel → widget → navigate page
```

## Config & secrets

- Voice ↔ text are linked by one string: `agent_name = "assistant-2473"`.
- Secrets live only in gitignored `.env.local` / `.env`:
  `LIVEKIT_URL/API_KEY/API_SECRET` (both halves) + `OPENAI_API_KEY` (the brain).
- `NEXT_PUBLIC_CONN_DETAILS_ENDPOINT` must be a **relative** path (`/api/connection-details`)
  so the widget calls its own origin on any port.

## Embed snippet

```html
<script src="https://<app>.vercel.app/embed.js" data-lk-sandbox-id="assistant-2473" async></script>
```
