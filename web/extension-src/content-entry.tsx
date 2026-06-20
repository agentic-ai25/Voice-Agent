/**
 * Chrome extension content script — injects the LiveKit voice widget, but ONLY
 * on the client sites listed in the registry (extension/clients.json).
 *
 * Runs in the content-script (isolated) world, so it works even on sites with a
 * strict Content-Security-Policy (e.g. salesforce.com). The registry is loaded
 * at runtime, so adding a client = adding an object to clients.json and reloading
 * the page (no rebuild). If the current hostname isn't an enabled entry, nothing
 * is injected.
 */
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { APP_CONFIG_DEFAULTS } from '@/app-config';
import EmbedFixedAgentClient from '@/components/embed-popup/agent-client';
import { getShadowStyles } from '@/lib/styles';
import type { AppConfig } from '@/lib/types';
import globalCss from '@/styles/globals.css';

declare const chrome: { runtime?: { getURL?: (path: string) => string } };

type ClientRecord = {
  id: string;
  match: string; // hostname, e.g. "salesforce.com" (matches it and *.salesforce.com)
  enabled?: boolean;
  label?: string;
  sandboxId?: string;
  agentName?: string;
  template?: string; // per-site prompt template (drives navigation)
  accent?: string;
  accentDark?: string;
  widgetBackground?: string;
  widgetBackgroundDark?: string;
  startButtonText?: string;
};

type Registry = { apiBase: string; clients: ClientRecord[] };

const FALLBACK: Registry = { apiBase: 'http://localhost:3000', clients: [] };

async function readRegistry(): Promise<Registry> {
  try {
    const url = chrome?.runtime?.getURL?.('clients.json');
    if (!url) return FALLBACK;
    const res = await fetch(url);
    const reg = (await res.json()) as Registry;
    return { apiBase: reg.apiBase || FALLBACK.apiBase, clients: reg.clients || [] };
  } catch (err) {
    console.error('LiveKit extension: could not load clients.json', err);
    return FALLBACK;
  }
}

/** Does `host` match the client's pattern (exact host or a subdomain of it)? */
function hostMatches(host: string, pattern: string): boolean {
  const p = (pattern || '').trim().toLowerCase().replace(/^\*\./, '').replace(/^https?:\/\//, '');
  if (!p) return false;
  return host === p || host.endsWith('.' + p);
}

function findClient(reg: Registry): ClientRecord | undefined {
  const host = window.location.hostname.toLowerCase();
  return reg.clients.find((c) => c.enabled !== false && hostMatches(host, c.match));
}

function mount(reg: Registry, client: ClientRecord) {
  if (document.getElementById('lk-embed-wrapper')) return; // SPA re-run guard

  // Token requests must go to the LiveKit app, not the host site.
  (window as Window & { __lkApiBase?: string }).__lkApiBase = reg.apiBase;

  const appConfig: AppConfig = {
    ...APP_CONFIG_DEFAULTS,
    sandboxId: client.sandboxId || client.id || APP_CONFIG_DEFAULTS.sandboxId,
    agentName: client.agentName || APP_CONFIG_DEFAULTS.agentName,
    template: client.template || undefined,
    startButtonText: client.startButtonText || APP_CONFIG_DEFAULTS.startButtonText,
    accent: client.accent || APP_CONFIG_DEFAULTS.accent,
    accentDark: client.accentDark || APP_CONFIG_DEFAULTS.accentDark,
    widgetBackground: client.widgetBackground || undefined,
    widgetBackgroundDark: client.widgetBackgroundDark || undefined,
  };

  const wrapper = document.createElement('div');
  wrapper.id = 'lk-embed-wrapper';
  wrapper.style.cssText =
    'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  document.body.appendChild(wrapper);

  const shadowRoot = wrapper.attachShadow({ mode: 'open' });

  const styleTag = document.createElement('style');
  styleTag.textContent = String(globalCss);
  shadowRoot.appendChild(styleTag);

  const dynamic = getShadowStyles(appConfig);
  if (dynamic) {
    const dynamicTag = document.createElement('style');
    dynamicTag.textContent = dynamic;
    shadowRoot.appendChild(dynamicTag);
  }

  const reactRoot = document.createElement('div');
  shadowRoot.appendChild(reactRoot);
  ReactDOM.createRoot(reactRoot).render(<EmbedFixedAgentClient appConfig={appConfig} />);
}

function start() {
  readRegistry()
    .then((reg) => {
      const client = findClient(reg);
      if (!client) return; // not a registered site — stay invisible
      mount(reg, client);
    })
    .catch((err) => console.error('LiveKit extension: failed to mount widget', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
