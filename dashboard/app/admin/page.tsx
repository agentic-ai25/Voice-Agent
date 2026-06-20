import { getSites } from '@/lib/db';
import { isConfigured } from '@/lib/supabase';
import { isAdmin, logout, toggleSite } from './actions';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!isConfigured()) {
    return (
      <>
        <h1>Admin</h1>
        <div className="notice">Configure Supabase first (see Stats page).</div>
      </>
    );
  }

  if (!(await isAdmin())) {
    return (
      <>
        <h1>Admin</h1>
        <p className="sub">Enter the admin password to manage sites.</p>
        <LoginForm />
      </>
    );
  }

  let sites;
  try {
    sites = await getSites();
  } catch {
    return (
      <>
        <h1>Admin — sites</h1>
        <div className="notice">
          Tables not found. Run <code>dashboard/supabase/schema.sql</code> in Supabase, then reload.
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Admin — sites</h1>
      <p className="sub">Enable or disable the voice agent per website. Changes take effect on the next page load.</p>

      <table>
        <thead>
          <tr>
            <th>Website</th>
            <th>Template</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.hostname}>
              <td>
                {s.label || s.hostname}
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{s.hostname}</div>
              </td>
              <td>{s.template || '—'}</td>
              <td>
                <span className={`dot ${s.enabled ? 'on' : 'off'}`} />
                {s.enabled ? 'Enabled' : 'Disabled'}
              </td>
              <td>
                <form action={toggleSite} className="row-actions">
                  <input type="hidden" name="hostname" value={s.hostname} />
                  <input type="hidden" name="enabled" value={(!s.enabled).toString()} />
                  <button type="submit" className={s.enabled ? 'ghost' : ''}>
                    {s.enabled ? 'Disable' : 'Enable'}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!sites.length && (
            <tr>
              <td colSpan={4} style={{ color: 'var(--muted)' }}>
                No sites yet. Add rows to the <code>sites</code> table.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form action={logout} style={{ marginTop: 24 }}>
        <button type="submit" className="ghost">
          Log out
        </button>
      </form>
    </>
  );
}
