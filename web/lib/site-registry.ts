/**
 * Per-site config for the GTM/script embed, keyed by hostname.
 *
 * Every site installs the SAME tag:
 *   <script src="https://<app>.vercel.app/embed.js" data-lk-sandbox-id="assistant-2473" async></script>
 *
 * The widget then looks itself up here by the host page's hostname and applies
 * that site's prompt template + branding. To onboard a new client, add an entry
 * below and redeploy — no change to the tag on their site.
 */
import type { AppConfig } from './types';

export interface SiteEntry extends Partial<AppConfig> {
  /** Hostname to match (also matches subdomains, e.g. "yardstick.live" → www.yardstick.live). */
  match: string;
}

export const SITE_REGISTRY: SiteEntry[] = [
  {
    match: 'yardstick.live',
    sandboxId: 'yardstick.live',
    agentName: 'assistant-2473',
    template: 'yardstick',
    accent: '#0891B2', // cyan-blue (Yardstick brand)
    accentDark: '#22D3EE',
    startButtonText: 'Ask Yardstick',
  },
  {
    match: 'gingerlabs.ai',
    sandboxId: 'gingerlabs.ai',
    agentName: 'assistant-2473',
    template: 'gingerlabs',
    accent: '#14B8A6', // teal/turquoise (Ginger Labs brand)
    accentDark: '#2DD4BF',
    startButtonText: 'Ask Ginger Labs',
  },
];

/** Match a hostname against a registry pattern (exact host or a subdomain). */
function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase();
  return host === p || host.endsWith('.' + p);
}

/** Find the per-site config overrides for the current hostname (or undefined). */
export function findSiteConfig(hostname: string): Partial<AppConfig> | undefined {
  const host = hostname.toLowerCase();
  const entry = SITE_REGISTRY.find((e) => hostMatches(host, e.match));
  if (!entry) return undefined;
  // Drop the `match` key; the rest are AppConfig overrides.
  const { match: _match, ...config } = entry;
  return config;
}
