/**
 * UI actions pushed from the voice agent over the LiveKit data channel.
 *
 * The Python agent (agent/src/agent.py) forwards the structured tool outputs
 * from the openai-agents `triage_agent` on the topic `lk.ui.action`. Each
 * payload is a JSON object with an `action` discriminator. This module decodes
 * a payload and performs the corresponding navigation on the host page.
 *
 * Navigation works together with session-resume (see session-resume.ts): before
 * a navigating action fires, agent-client stashes the live connection, and the
 * next page reconnects to the same room — so the call survives the reload. Here
 * we just perform the navigation:
 *   - same-origin redirect → real navigation (the host's own routes load, and
 *     the widget re-injects + resumes on the new page)
 *   - cross-origin (e.g. Calendly) → new tab, leaving the current call untouched
 * Everything is wrapped so a malformed action can never throw and crash React.
 */

export const UI_ACTION_TOPIC = 'lk.ui.action';

export type UiAction =
  | { action: 'redirect'; url: string; label?: string }
  | { action: 'history'; direction: 'back' | 'forward' }
  | { action: 'schedule'; url: string; label?: string }
  | { action: 'schedule_confirmed'; when?: string; name?: string; email?: string }
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
 * Navigate the host page to `rawUrl`.
 *
 * A redirect always targets a page on the SITE the widget is running on. The
 * site index may have been crawled on a different host/port (e.g. staging, or a
 * different dev port) than where the widget is deployed, so we ignore the index
 * URL's origin and apply only its PATH to the current origin. The host's own
 * routing loads the page, the widget re-injects, and the stashed session resumes
 * (see session-resume.ts) so the call continues.
 */
function navigateTo(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, window.location.href);
  } catch {
    // Bad/relative-only URL we can't resolve — do nothing rather than break.
    return;
  }

  // Remap to the current origin using just the path/query/hash so a host/port
  // mismatch between the crawl and the live site can't break navigation.
  const target = new URL(parsed.pathname + parsed.search + parsed.hash, window.location.origin);

  // Already here — nothing to do.
  if (target.href === window.location.href) {
    return;
  }

  window.location.assign(target.href);
}

/** Perform a UI action on the host page. Never throws. */
export function handleUiAction(action: UiAction): void {
  try {
    switch (action.action) {
      case 'redirect': {
        const url = (action as { url?: string }).url;
        if (url) navigateTo(url);
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
      // 'schedule_confirmed' (demo-mode booking) / 'form_submitted' / 'error' /
      // 'none' need no page navigation — the confirmation is delivered in chat.
      default:
        break;
    }
  } catch (err) {
    // A failed navigation must never crash the widget or end the call.
    console.error('LiveKit widget: failed to handle UI action', err);
  }
}
