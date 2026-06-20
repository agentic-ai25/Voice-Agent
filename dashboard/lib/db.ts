import 'server-only';
import { getSupabase } from './supabase';

export interface SiteStat {
  hostname: string;
  label: string | null;
  enabled: boolean;
  conversations: number;
  minutes: number;
  unique_users: number;
  avg_seconds: number;
  last_conversation_at: string | null;
}

export interface Totals {
  conversations: number;
  minutes: number;
  unique_users: number;
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD
  conversations: number;
  minutes: number;
}

/** Per-site rollup from the site_stats view. */
export async function getSiteStats(): Promise<SiteStat[]> {
  const { data, error } = await getSupabase()
    .from('site_stats')
    .select('*')
    .order('conversations', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SiteStat[];
}

/** Overall totals across every site. Unique users counted globally by visitor_id. */
export async function getTotals(): Promise<Totals> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sessions')
    .select('visitor_id, duration_seconds');
  if (error) throw error;
  const rows = data ?? [];
  const minutes = rows.reduce((a, r) => a + (r.duration_seconds ?? 0), 0) / 60;
  const visitors = new Set(rows.map((r) => r.visitor_id).filter(Boolean));
  return {
    conversations: rows.length,
    minutes: Math.round(minutes * 10) / 10,
    unique_users: visitors.size,
  };
}

/** Conversations + minutes per day for the last `days` days. */
export async function getDailyTrend(days = 30): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await getSupabase()
    .from('sessions')
    .select('created_at, duration_seconds')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const byDay = new Map<string, { conversations: number; seconds: number }>();
  for (const r of data ?? []) {
    const day = (r.created_at as string).slice(0, 10);
    const e = byDay.get(day) ?? { conversations: 0, seconds: 0 };
    e.conversations += 1;
    e.seconds += r.duration_seconds ?? 0;
    byDay.set(day, e);
  }
  return [...byDay.entries()].map(([day, e]) => ({
    day,
    conversations: e.conversations,
    minutes: Math.round((e.seconds / 60) * 10) / 10,
  }));
}

export interface SiteRow {
  hostname: string;
  label: string | null;
  enabled: boolean;
  template: string | null;
  accent: string | null;
  start_text: string | null;
}

/** All configured sites (for the admin page). */
export async function getSites(): Promise<SiteRow[]> {
  const { data, error } = await getSupabase()
    .from('sites')
    .select('hostname, label, enabled, template, accent, start_text')
    .order('hostname', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SiteRow[];
}

/** Admin action: flip a site's enabled flag. */
export async function setSiteEnabled(hostname: string, enabled: boolean): Promise<void> {
  const { error } = await getSupabase().from('sites').update({ enabled }).eq('hostname', hostname);
  if (error) throw error;
}
