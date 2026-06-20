/**
 * UI actions pushed from the voice agent over the LiveKit data channel.
 *
 * The Python agent (agent/src/agent.py) forwards the structured tool outputs
 * from the openai-agents `triage_agent` on the topic `lk.ui.action`. Each
 * payload is a JSON object with an `action` discriminator. This module decodes
 * a payload and performs the corresponding navigation on the host page.
 *
 * IMPORTANT: navigation must NEVER tear down the widget or drop the live call.
 * The widget is injected into the host page, so a full page reload would destroy
 * it. For same-origin redirects we therefore use client-side (History API)
 * navigation, which lets a single-page-app host swap page content while the
 * injected widget — and the ongoing voice session — stay alive. Cross-origin
 * targets open in a new tab. Everything is wrapped so a malformed action can
 * never throw and crash the React tree.
 */

export const UI_ACTION_TOPIC = 'lk.ui.action';

export type UiAction =
  | { action: 'redirect'; url: string; label?: string }
  | { action: 'history'; direction: 'back' | 'forward' }
  | { action: 'schedule'; url: string; label?: string }
  | { action: 'form_submitted'; message?: string; email?: string }
  | { action: string; [key: string]: unknown };

/** Decode a DataReceived payload into a UiAction, or null if it isn't one. */
export function parseUiAction(payload: Uint8Array): UiAction | null {
  try {
    const text = new TextDecoder().decode(payload);
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object' && typeof obj.action === 'string') {
      return obj as UiAction;
    }
  } catch {
    // not a UI action payload — ignore
  }
  return null;
}

/**
 * Navigate the host page to `rawUrl` without reloading when possible.
 *
 * - Same-origin → History API push + popstate so SPA routers (Next.js App
 *   Router, React Router, etc.) render the new route while the widget survives.
 *   A non-existent route renders the host's own 404/not-found view; the widget
 *   and call keep running.
 * - Cross-origin → open in a new tab so the current page (and call) is untouched.
 */
function softNavigate(rawUrl: string): void {
  let target: URL;
  try {
    target = new URL(rawUrl, window.location.href);
  } catch {
    // Bad/relative-only URL we can't resolve — do nothing rather than break.
    return;
  }

  if (target.origin !== window.location.origin) {
    window.open(target.href, '_blank', 'noopener,noreferrer');
    return;
  }

  // Already here — nothing to do.
  if (target.href === window.location.href) {
    return;
  }

  try {
    window.history.pushState({}, '', target.href);
    // Nudge SPA routers that listen for history changes.
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    // Last resort: a normal navigation. The embed loader re-injects the widget
    // on the next page; only used if the History API is unavailable.
    window.location.assign(target.href);
  }
}

/** Perform a UI action on the host page. Never throws. */
export function handleUiAction(action: UiAction): void {
  try {
    switch (action.action) {
      case 'redirect': {
        const url = (action as { url?: string }).url;
        if (url) softNavigate(url);
        break;
      }
      case 'history': {
        const direction = (action as { direction?: string }).direction;
        if (direction === 'back') window.history.back();
        else if (direction === 'forward') window.history.forward();
        break;
      }
      case 'schedule': {
        const url = (action as { url?: string }).url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        break;
      }
      // 'form_submitted' / 'error' / 'none' need no page navigation.
      default:
        break;
    }
  } catch (err) {
    // A failed navigation must never crash the widget or end the call.
    console.error('LiveKit widget: failed to handle UI action', err);
  }
}
