import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { getAppConfig } from '@/lib/env';
import { findSiteConfig } from '@/lib/site-registry';
import { getShadowStyles } from '@/lib/styles';
import type { AppConfig } from '@/lib/types';
import globalCss from '@/styles/globals.css';
import EmbedFixedAgentClient from './agent-client';

const scriptTag = document.querySelector<HTMLScriptElement>('script[data-lk-sandbox-id]');
const sandboxIdAttribute = scriptTag?.dataset.lkSandboxId;

/**
 * Per-client config read from the embed <script> tag's data- attributes, so a
 * single bundle serves many sites via Google Tag Manager. Each client pastes a
 * GTM Custom HTML tag with their own values, e.g.:
 *
 *   <script src="https://<app>.vercel.app/embed.js"
 *     data-lk-sandbox-id="acme.com"
 *     data-lk-template="acme"
 *     data-lk-agent-name="assistant-2473"
 *     data-lk-accent="#0176D3"
 *     data-lk-start-text="Ask Acme" async></script>
 *
 * These override the defaults / remote app config.
 */
function overridesFromDataset(ds?: DOMStringMap): Partial<AppConfig> {
  if (!ds) return {};
  const o: Partial<AppConfig> = {};
  if (ds.lkTemplate) o.template = ds.lkTemplate;
  if (ds.lkAgentName) o.agentName = ds.lkAgentName;
  if (ds.lkAccent) o.accent = ds.lkAccent;
  if (ds.lkAccentDark) o.accentDark = ds.lkAccentDark;
  if (ds.lkBg) o.widgetBackground = ds.lkBg;
  if (ds.lkBgDark) o.widgetBackgroundDark = ds.lkBgDark;
  if (ds.lkStartText) o.startButtonText = ds.lkStartText;
  return o;
}

// The widget may be embedded cross-origin (host site on one origin, this bundle +
// the token API served from the LiveKit app on another). Token requests must go
// to the origin this bundle was LOADED from, not the host page's origin. Capture
// it from the script's own src so use-connection-details can target it.
if (scriptTag?.src) {
  try {
    (window as Window & { __lkApiBase?: string }).__lkApiBase = new URL(
      scriptTag.src,
      window.location.href
    ).origin;
  } catch {
    // leave unset — falls back to the host page origin (same-origin embeds)
  }
}

/**
 * Live per-site config from the DB (the `sites` table), so the admin can
 * enable/disable a site and tweak branding without a redeploy. Returns null on
 * any failure so the widget falls back to its built-in registry.
 */
async function fetchSiteConfig(): Promise<
  { enabled: boolean; config: Partial<AppConfig> } | null
> {
  try {
    const base =
      (window as Window & { __lkApiBase?: string }).__lkApiBase || window.location.origin;
    const res = await fetch(
      `${base}/api/site-config?host=${encodeURIComponent(window.location.hostname)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    if (data?.found) {
      return { enabled: data.enabled !== false, config: data.config ?? {} };
    }
  } catch {
    // ignore — fall back to the built-in registry
  }
  return null;
}

if (sandboxIdAttribute) {
  Promise.all([getAppConfig(window.location.origin, sandboxIdAttribute), fetchSiteConfig()])
    .then(([resolved, db]) => {
      // Admin kill-switch: if the DB explicitly disables this site, render nothing.
      if (db && db.enabled === false) {
        console.info('LiveKit widget: disabled for this site by admin.');
        return;
      }

      // Layer per-site config: defaults < generic tag data- attrs < built-in
      // hostname registry < live DB config (the admin-controlled source of truth).
      const appConfig: AppConfig = {
        ...resolved,
        ...overridesFromDataset(scriptTag?.dataset),
        ...findSiteConfig(window.location.hostname),
        ...(db?.config ?? {}),
      };

      const wrapper = document.createElement('div');
      wrapper.setAttribute('id', 'lk-embed-wrapper');
      // Pin the widget to the top layer of the host page. position:fixed makes this
      // element its own stacking context, and the maximum 32-bit z-index keeps the
      // widget above the host site's own layers (modals, sticky headers, etc).
      // The wrapper itself is 0x0 so it never blocks clicks on the host page — only
      // the (fixed-positioned) bubble and panel inside it capture pointer events.
      wrapper.style.cssText =
        'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
      document.body.appendChild(wrapper);

      // Shadow root so the widget's CSS doesn't leak into / break the host page.
      const shadowRoot = wrapper.attachShadow({ mode: 'open' });
      const styleTag = document.createElement('style');
      styleTag.textContent = globalCss;
      shadowRoot.appendChild(styleTag);

      // Inject dynamic accent color overrides into the shadow root
      const dynamicStyles = getShadowStyles(appConfig);
      if (dynamicStyles) {
        const dynamicStyleTag = document.createElement('style');
        dynamicStyleTag.textContent = dynamicStyles;
        shadowRoot.appendChild(dynamicStyleTag);
      }

      const reactRoot = document.createElement('div');
      shadowRoot.appendChild(reactRoot);
      const root = ReactDOM.createRoot(reactRoot);
      root.render(<EmbedFixedAgentClient appConfig={appConfig} />);
    })
    .catch((err) => {
      console.error('LiveKit popup embed error - Error loading app config:', err);
    });
} else {
  console.error(
    'LiveKit popup embed error - no data-lk-sandbox-id attribute found on script tag. This is required!'
  );
}
