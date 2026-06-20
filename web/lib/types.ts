import type { TranscriptionSegment } from 'livekit-client';

export interface CombinedTranscription extends TranscriptionSegment {
  role: 'assistant' | 'user';
  receivedAtMediaTimestamp: number;
  receivedAt: number;
}
export type ThemeMode = 'dark' | 'light' | 'system';

export interface AppConfig {
  sandboxId?: string;
  agentName?: string;
  /** Per-site prompt template name the agent should use (see agent site_prompts). */
  template?: string;

  supportsChatInput: boolean;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  isPreConnectBufferEnabled: boolean;

  startButtonText?: string;
  companyName?: string;
  accent?: string;
  accentDark?: string;
  /** Background color of the pill/widget (light mode). Overrides the theme bg. */
  widgetBackground?: string;
  /** Background color of the pill/widget (dark mode). */
  widgetBackgroundDark?: string;
  logo?: string;
  logoDark?: string;
}

export interface SandboxConfig {
  [key: string]:
    | { type: 'string'; value: string }
    | { type: 'number'; value: number }
    | { type: 'boolean'; value: boolean }
    | null;
}

export type EmbedErrorDetails = { title: React.ReactNode; description: React.ReactNode };
