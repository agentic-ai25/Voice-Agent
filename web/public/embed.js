/**
 * Tiny async loader for the LiveKit voice assistant widget.
 *
 * Clients embed THIS file (~1 KB). It waits until the host page has finished
 * loading, then injects the full widget bundle in the background so it never
 * blocks or slows the host page.
 *
 *   <script
 *     src="https://assistant-2473-web.vercel.app/embed.js"
 *     data-lk-sandbox-id="assistant-2473"
 *     async
 *   ></script>
 */
(function () {
  // Guard against the loader being added twice (e.g. via GTM + a manual tag).
  if (window.__lkAssistantLoaded) {
    return;
  }
  window.__lkAssistantLoaded = true;

  var BUNDLE_URL = 'https://assistant-2473-web.vercel.app/embed-popup.js';

  // Read config from this loader's own <script> tag.
  var self =
    document.currentScript ||
    document.querySelector('script[src*="/embed.js"][data-lk-sandbox-id]');
  var sandboxId = (self && self.getAttribute('data-lk-sandbox-id')) || 'assistant-2473';

  function inject() {
    var s = document.createElement('script');
    s.src = BUNDLE_URL;
    s.async = true;
    // The bundle reads this attribute to initialize.
    s.setAttribute('data-lk-sandbox-id', sandboxId);
    (document.body || document.head || document.documentElement).appendChild(s);
  }

  function whenIdle() {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(inject, { timeout: 2000 });
    } else {
      window.setTimeout(inject, 1);
    }
  }

  if (document.readyState === 'complete') {
    whenIdle();
  } else {
    window.addEventListener('load', whenIdle, { once: true });
  }
})();
