# assistant-2473

A voice AI assistant built with [LiveKit Agents](https://docs.livekit.io/agents) (Python) plus an
embeddable web widget (Next.js) that can be dropped onto any website via a `<script>` tag or Google
Tag Manager.

## Structure

| Folder | What it is | Deploys to |
|--------|------------|------------|
| [`agent/`](agent/) | The LiveKit voice agent (Python, managed with `uv`) | LiveKit Cloud |
| [`web/`](web/) | The embeddable popup widget (Next.js) | Vercel |

## `agent/` — voice agent

The agent backend. See [`agent/README.md`](agent/README.md) for full details.

```bash
cd agent
uv sync
uv run python src/agent.py console   # talk to it locally
lk agent deploy                      # ship a new version to LiveKit Cloud
```

Requires `agent/.env.local` with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
(copy from `agent/.env.example`). **Never commit it.**

## `web/` — embeddable widget

A floating voice-assistant pill that connects to the agent. See [`web/README.md`](web/README.md).

```bash
cd web
pnpm install
pnpm dev                 # http://localhost:3000/?tab=popup
vercel --prod            # deploy
```

Requires `web/.env.local` with the same `LIVEKIT_*` values (copy from `web/.env.example`).

### Embed snippet

```html
<script src="https://<your-app>.vercel.app/embed.js" data-lk-sandbox-id="assistant-2473" async></script>
```

A tiny async loader that injects the widget; works pasted directly into HTML or via a GTM Custom HTML tag.

## Notes

- The widget UI (the green pill + traveling border light) lives in `web/components/embed-popup/`.
- Tweak the moving line in `web/components/embed-popup/border-line.tsx` (the `BORDER_LINE` config).
- Secrets live only in `.env.local` files (gitignored) and in the Vercel/LiveKit project settings.
