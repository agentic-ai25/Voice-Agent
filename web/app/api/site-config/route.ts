import { NextResponse } from 'next/server';

// Per-site config the widget reads on load, backed by the Supabase `sites` table
// so the admin can enable/disable a site (and tweak branding/template) live —
// no redeploy. If Supabase isn't configured or the site isn't found, the widget
// falls back to its built-in registry.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const revalidate = 0;

// The widget runs on third-party sites, so this is cross-origin.
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get('host') ?? '')
    .toLowerCase()
    .replace(/^www\./, '');

  // No DB configured → tell the widget to use its built-in registry.
  if (!host || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ found: false }, { headers: CORS });
  }

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/sites?hostname=eq.${encodeURIComponent(host)}` +
      `&select=hostname,enabled,template,accent,accent_dark,widget_background,start_text,agent_name`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
    });
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) {
      return NextResponse.json({ found: false }, { headers: CORS });
    }
    return NextResponse.json(
      {
        found: true,
        enabled: row.enabled !== false,
        config: {
          sandboxId: row.hostname,
          template: row.template ?? undefined,
          agentName: row.agent_name ?? undefined,
          accent: row.accent ?? undefined,
          accentDark: row.accent_dark ?? undefined,
          widgetBackground: row.widget_background ?? undefined,
          startButtonText: row.start_text ?? undefined,
        },
      },
      { headers: CORS }
    );
  } catch {
    // On any error, let the widget fall back rather than fail to load.
    return NextResponse.json({ found: false }, { headers: CORS });
  }
}
