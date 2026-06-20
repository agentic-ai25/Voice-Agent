import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { getAppConfig } from '@/lib/env';
import { getShadowStyles } from '@/lib/styles';
import globalCss from '@/styles/globals.css';
import EmbedFixedAgentClient from './agent-client';

const scriptTag = document.querySelector<HTMLScriptElement>('script[data-lk-sandbox-id]');
const sandboxIdAttribute = scriptTag?.dataset.lkSandboxId;

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
    .then((appConfig) => {
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
