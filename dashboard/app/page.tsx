import { getDailyTrend, getSiteStats, getTotals } from '@/lib/db';
import { isConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic'; // always fresh

export default async function StatsPage() {
  if (!isConfigured()) {
    return (
      <>
        <h1>Stats</h1>
        <p className="sub">Usage across all sites running the voice assistant.</p>
        <div className="notice">
          Supabase isn’t configured yet. Set <code>SUPABASE_URL</code> and{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env.local</code>, run{' '}
          <code>supabase/schema.sql</code> in your Supabase project, then reload.
        </div>
      </>
    );
  }

  let totals, sites, trend;
  try {
    [totals, sites, trend] = await Promise.all([getTotals(), getSiteStats(), getDailyTrend(30)]);
  } catch {
    return (
      <>
        <h1>Stats</h1>
        <p className="sub">Usage across all sites running the voice assistant.</p>
        <div className="notice">
          Connected to Supabase, but the tables aren’t there yet. Run{' '}
          <code>dashboard/supabase/schema.sql</code> in the Supabase SQL editor, then reload.
        </div>
      </>
    );
  }

  const maxConv = Math.max(1, ...trend.map((d) => d.conversations));

  return (
    <>
      <h1>Stats</h1>
      <p className="sub">Usage across all sites running the voice assistant.</p>

      <div className="kpis">
        <Kpi label="Conversations" value={totals.conversations.toLocaleString()} />
        <Kpi label="Total minutes" value={totals.minutes.toLocaleString()} unit="min" />
        <Kpi label="Unique users" value={totals.unique_users.toLocaleString()} />
        <Kpi label="Active sites" value={sites.filter((s) => s.enabled).length.toString()} />
      </div>

      <h2>Conversations — last 30 days</h2>
      {trend.length ? (
        <div className="bars" title="conversations per day">
          {trend.map((d) => (
            <div
              key={d.day}
              className="bar"
              style={{ height: `${(d.conversations / maxConv) * 100}%` }}
              title={`${d.day}: ${d.conversations} conversations, ${d.minutes} min`}
            />
          ))}
        </div>
      ) : (
        <div className="notice">No conversations recorded yet.</div>
      )}

      <h2>By website</h2>
      <table>
        <thead>
          <tr>
            <th>Website</th>
            <th className="num">Conversations</th>
            <th className="num">Minutes</th>
            <th className="num">Unique users</th>
            <th className="num">Avg call</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.hostname}>
              <td>
                <span className={`dot ${s.enabled ? 'on' : 'off'}`} />
                {s.label || s.hostname}
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{s.hostname}</div>
              </td>
              <td className="num">{s.conversations.toLocaleString()}</td>
              <td className="num">{Number(s.minutes).toLocaleString()}</td>
              <td className="num">{s.unique_users.toLocaleString()}</td>
              <td className="num">{formatDuration(s.avg_seconds)}</td>
            </tr>
          ))}
          {!sites.length && (
            <tr>
              <td colSpan={5} style={{ color: 'var(--muted)' }}>
                No sites configured yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">
        {value} {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
