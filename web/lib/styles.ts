import type { AppConfig } from './types';

/**
 * Generate inline CSS that overrides accent color variables from app config.
 * Follows the same pattern as agent-starter-react.
 *
 * Uses :root/.dark for iframe (full document) context.
 * Use getShadowStyles() for popup (shadow DOM) context.
 */
export function getStyles(appConfig: AppConfig): string {
  const accent = appConfig.accent || undefined;
  const accentDark = appConfig.accentDark || undefined;
  const bg = appConfig.widgetBackground || undefined;
  const bgDark = appConfig.widgetBackgroundDark || undefined;

  return [
    accent
      ? `:root { --primary: ${accent}; --primary-hover: color-mix(in srgb, ${accent} 80%, #000); --fgAccent: ${accent}; --agent-green: ${accent}; --agent-green-soft: color-mix(in srgb, ${accent} 25%, transparent); }`
      : '',
    bg ? `:root { --background: ${bg}; }` : '',
    accentDark
      ? `.dark { --primary: ${accentDark}; --primary-hover: color-mix(in srgb, ${accentDark} 80%, #000); --fgAccent: ${accentDark}; --agent-green: ${accentDark}; --agent-green-soft: color-mix(in srgb, ${accentDark} 30%, transparent); }`
      : '',
    bgDark ? `.dark { --background: ${bgDark}; }` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generate inline CSS for use inside a shadow DOM.
 * Uses :host instead of :root since :root targets the document element,
 * not the shadow host.
 */
export function getShadowStyles(appConfig: AppConfig): string {
  const accent = appConfig.accent || undefined;
  const accentDark = appConfig.accentDark || undefined;
  const bg = appConfig.widgetBackground || undefined;
  const bgDark = appConfig.widgetBackgroundDark || undefined;

  return [
    accent
      ? `:host { --primary: ${accent}; --primary-hover: color-mix(in srgb, ${accent} 80%, #000); --fgAccent: ${accent}; --agent-green: ${accent}; --agent-green-soft: color-mix(in srgb, ${accent} 25%, transparent); }`
      : '',
    bg ? `:host { --background: ${bg}; }` : '',
    accentDark
      ? `:host(.dark) { --primary: ${accentDark}; --primary-hover: color-mix(in srgb, ${accentDark} 80%, #000); --fgAccent: ${accentDark}; --agent-green: ${accentDark}; --agent-green-soft: color-mix(in srgb, ${accentDark} 30%, transparent); }`
      : '',
    bgDark ? `:host(.dark) { --background: ${bgDark}; }` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
