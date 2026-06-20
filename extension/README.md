# Voice Assistant — Chrome extension (demo)

Injects the LiveKit voice widget on **any** website — including ones with a strict
Content-Security-Policy (e.g. `salesforce.com`) where a `<script>` / GTM embed is
blocked. The widget runs as a content script, so the page's CSP doesn't apply.

This is for **demos** (you install it in your own browser). It is not how you ship
the widget to a site's visitors — for that, use the `<script>` embed in `web/`.

## Build

```bash
cd web
pnpm install
pnpm build-extension          # outputs extension/content.js
```

`manifest.json`, `popup.html`, and `popup.js` are committed; only `content.js` is
generated.

## Load it in Chrome

1. Go to `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.
4. (Optional) Pin the extension so you can open its settings popup.

## Configure clients — `extension/clients.json`

All client config lives in **`extension/clients.json`**. The widget appears **only
on the sites listed there**. To enable a new client, **add an object to the
`clients` array and reload the page** — no rebuild needed (the file is loaded at
runtime). The extension popup shows a read-only summary of what's configured.

```jsonc
{
  "apiBase": "http://localhost:3000",   // where the token API + bundle live
  "clients": [
    {
      "id": "salesforce.com",
      "match": "salesforce.com",          // hostname; also matches *.salesforce.com
      "enabled": true,
      "label": "Salesforce",
      "template": "salesforce",           // agent prompt template (drives navigation)
      "sandboxId": "salesforce.com",      // also picks agent index indices/<id>.json
      "agentName": "assistant-2473",
      "accent": "#00a1e0",                 // orb + moving border color
      "accentDark": "#1ab0f0",
      "widgetBackground": "",              // pill background (blank = theme default)
      "startButtonText": "Ask the Salesforce assistant"
    }
  ]
}
```

### How per-client config reaches the agent

The widget sends the client's `template` + `site_id` with its token request; the
web token API forwards them as LiveKit **agent dispatch metadata**; the agent
worker reads `ctx.job.metadata` and builds that room's prompt (and loads
`agent/indices/<site_id>.json` if it exists). One worker serves many clients.

## Demo on salesforce.com

1. Make sure the backend is running:
   - `agent/`: `uv run python src/agent.py dev` (the voice brain)
   - `web/`: `pnpm dev` (serves the token API at the LiveKit app URL you set)
2. Open `https://www.salesforce.com`.
3. The pill appears bottom-center. Click it, allow the microphone, and talk.
4. Ask it to "go to pricing" etc. — it navigates Salesforce's own pages, and the
   call resumes on the new page.

> Note: redirect targets come from the agent's `site_index.json`. To demo
> navigation on Salesforce specifically, re-ingest that site (`agent/ingest.py`)
> or set `SITE_TEMPLATE=salesforce` so the agent's page intents match.

## Notes / limits

- Microphone permission is per-site; Chrome will prompt on first use per origin.
- The call uses a content-script media session. On a full page navigation the
  widget re-injects and resumes (sessionStorage). For an unbroken call across
  navigations, a future version can move the session into an offscreen document.
