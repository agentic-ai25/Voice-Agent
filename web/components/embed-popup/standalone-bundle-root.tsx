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

if (sandboxIdAttribute) {
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

  // Use a shadow root so that any relevant css classes don't leak out and effect the broader page
  const shadowRoot = wrapper.attachShadow({ mode: 'open' });

  // Include all app styles into the shadow root
  // FIXME: this includes styles for the welcome page / etc, not just the popup embed!
  const styleTag = document.createElement('style');
  styleTag.textContent = globalCss;
  shadowRoot.appendChild(styleTag);

  const reactRoot = document.createElement('div');
  shadowRoot.appendChild(reactRoot);

  getAppConfig(window.location.origin, sandboxIdAttribute)
    .then((resolved) => {
      // Layer per-site config: base defaults < generic tag data- attributes <
      // the hostname registry (the authoritative source for GTM installs, since
      // every site ships the same tag and is differentiated here by hostname).
      const appConfig: AppConfig = {
        ...resolved,
        ...overridesFromDataset(scriptTag?.dataset),
        ...findSiteConfig(window.location.hostname),
      };

      // Inject dynamic accent color overrides into the shadow root
      const dynamicStyles = getShadowStyles(appConfig);
      if (dynamicStyles) {
        const dynamicStyleTag = document.createElement('style');
        dynamicStyleTag.textContent = dynamicStyles;
        shadowRoot.appendChild(dynamicStyleTag);
      }

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
