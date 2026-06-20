# Voice Agent — Dashboard

A standalone Next.js app showing usage across every website running the voice
assistant, plus a password-gated admin to enable/disable the agent per site.

- **`/`** (open) — KPIs (conversations, total minutes, unique users), a 30-day
  trend, and a per-website breakdown.
- **`/admin`** (password) — toggle each site's agent on/off. Backed by the
  `sites.enabled` flag the widget reads, so changes take effect on next load.

All data access is **server-side** with the Supabase service-role key — the key
is never exposed to the browser.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor (creates `sites`,
   `sessions`, the `site_stats` view, and seeds the live sites).
3. Copy `.env.example` → `.env.local` and fill:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API)
   - `ADMIN_PASSWORD` (for `/admin`)
4. `npm install && npm run dev` → http://localhost:3001 (run on a different port
   than the widget's web app, e.g. `npm run dev -- -p 3002`).

## Deploy

Deploy as its own Vercel project (separate from `web/`). Set the same three env
vars in the Vercel project settings.

## Where the data comes from

The voice agent writes one `sessions` row when a conversation ends (site,
visitor id, duration, turns) via the web app's `/api/analytics/session` endpoint.
"Unique users" relies on a persistent `visitor_id` the widget stores in
localStorage and sends with each token request.
