-- Voice Agent analytics + per-site config schema (Supabase / Postgres).
-- Run this in the Supabase SQL editor.
--
-- Two tables:
--   sites    — one row per website with the GTM tag; the admin toggles `enabled`,
--              and the widget reads this to decide whether/how to render.
--   sessions — one row per voice conversation; the agent writes it on session end.
--
-- All DB access is server-side with the service-role key (the dashboard fetches
-- server-side, the web app writes), so we keep RLS on with no public policies.

-- ── sites ────────────────────────────────────────────────────────────────────
create table if not exists public.sites (
  hostname          text primary key,           -- e.g. "yardstick.live"
  label             text,                        -- display name
  enabled           boolean not null default true,
  template          text,                        -- agent prompt template key
  accent            text,                        -- widget accent (light)
  accent_dark       text,
  widget_background text,
  start_text        text,                        -- launcher button text
  agent_name        text not null default 'assistant-2473',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── sessions ─────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  site_hostname    text not null,               -- matches sites.hostname
  visitor_id       text,                        -- persistent per-browser id (unique users)
  room_name        text,
  template         text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  user_turns       integer not null default 0,
  agent_turns      integer not null default 0,
  actions          jsonb not null default '[]'::jsonb,  -- e.g. redirects/handoffs fired
  created_at       timestamptz not null default now()
);

create index if not exists sessions_site_idx       on public.sessions (site_hostname);
create index if not exists sessions_created_idx     on public.sessions (created_at);
create index if not exists sessions_visitor_idx     on public.sessions (site_hostname, visitor_id);

-- ── per-site rollup (used by the dashboard) ──────────────────────────────────
create or replace view public.site_stats as
select
  s.hostname,
  s.label,
  s.enabled,
  count(se.id)                                         as conversations,
  round(coalesce(sum(se.duration_seconds), 0) / 60.0, 1) as minutes,
  count(distinct se.visitor_id)                        as unique_users,
  round(coalesce(avg(se.duration_seconds), 0))         as avg_seconds,
  max(se.created_at)                                   as last_conversation_at
from public.sites s
left join public.sessions se on se.site_hostname = s.hostname
group by s.hostname, s.label, s.enabled;

-- ── RLS: locked down; only the service-role key (server-side) may read/write ──
alter table public.sites    enable row level security;
alter table public.sessions enable row level security;

-- keep updated_at fresh on sites
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists sites_touch_updated_at on public.sites;
create trigger sites_touch_updated_at before update on public.sites
  for each row execute function public.touch_updated_at();

-- ── seed the live sites ──────────────────────────────────────────────────────
insert into public.sites (hostname, label, enabled, template, accent, accent_dark, start_text)
values
  ('yardstick.live', 'Yardstick',   true, 'yardstick',  '#0891B2', '#22D3EE', 'Ask Yardstick'),
  ('gingerlabs.ai',  'Ginger Labs',  true, 'gingerlabs', '#14B8A6', '#2DD4BF', 'Ask Ginger Labs')
on conflict (hostname) do nothing;
