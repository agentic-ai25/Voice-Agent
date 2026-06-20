import type { AppConfig } from './lib/types';

export const APP_CONFIG_DEFAULTS: AppConfig = {
  sandboxId: undefined,
  agentName: 'assistant-2473',
  supportsChatInput: false,
  supportsVideoInput: false,
  supportsScreenShare: false,
  isPreConnectBufferEnabled: true,
  startButtonText: 'Start the demo',
  companyName: 'Assistant',
  accent: '#16a34a',
  accentDark: '#22c55e',
  logo: 'https://assistant-2473-web.vercel.app/lk-logo.svg',
  logoDark: 'https://assistant-2473-web.vercel.app/lk-logo-dark.svg',
};
