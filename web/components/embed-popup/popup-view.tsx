'use client';

import React, { useEffect } from 'react';
import { type AgentState, useVoiceAssistant } from '@livekit/components-react';
import { CaretUpIcon, MicrophoneIcon, MicrophoneSlashIcon, XIcon } from '@phosphor-icons/react';
import { AgentOrb } from '@/components/embed-popup/agent-orb';
import { BorderLine } from '@/components/embed-popup/border-line';
import { useAgentControlBar } from '@/hooks/use-agent-control-bar';
import { useDebugMode } from '@/hooks/useDebug';
import type { AppConfig, EmbedErrorDetails } from '@/lib/types';
import { cn } from '@/lib/utils';

function isAgentAvailable(agentState: AgentState) {
  return agentState == 'listening' || agentState == 'thinking' || agentState == 'speaking';
}

function stateLabel(state: AgentState): string {
  switch (state) {
    case 'listening':
      return 'Listening...';
    case 'thinking':
      return 'Thinking...';
    case 'speaking':
      return 'Speaking...';
    case 'connecting':
    case 'initializing':
    default:
      return 'Connecting...';
  }
}

type PopupProps = {
  appConfig: AppConfig;
  disabled: boolean;
  sessionStarted: boolean;
  onEmbedError: React.Dispatch<React.SetStateAction<EmbedErrorDetails | null>>;
};

export const PopupView = ({
  disabled,
  sessionStarted,
  onEmbedError,
  ref,
}: React.ComponentProps<'div'> & PopupProps) => {
  useDebugMode();

  const { state: agentState } = useVoiceAssistant();
  const { microphoneToggle, handleDisconnect } = useAgentControlBar();
  const micEnabled = microphoneToggle.enabled;

  // If the agent hasn't connected after an interval, show an error.
  useEffect(() => {
    if (!sessionStarted) {
      return;
    }

    const timeout = setTimeout(() => {
      if (!isAgentAvailable(agentState)) {
        const reason =
          agentState === 'connecting'
            ? 'Agent did not join the room. '
            : 'Agent connected but did not complete initializing. ';

        onEmbedError({
          title: 'Session ended',
          description: <p className="w-full">{reason}</p>,
        });
      }
    }, 10_000);

    return () => clearTimeout(timeout);
  }, [agentState, sessionStarted, onEmbedError]);

  return (
    <div ref={ref} inert={disabled} className="relative w-fit">
      {/* Traveling green line around the bar's boundary */}
      <BorderLine />

      {/* The pill */}
      <div className="bg-background border-separator1 relative z-10 flex items-center gap-2 rounded-full border py-2 pr-2 pl-3 drop-shadow-md">
        <AgentOrb state={agentState} />

        <span className="text-fg1 min-w-[92px] px-1 text-[15px] font-medium whitespace-nowrap select-none">
          {stateLabel(agentState)}
        </span>

        {/* Microphone toggle */}
        <button
          type="button"
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          onClick={() => microphoneToggle.toggle()}
          disabled={microphoneToggle.pending}
          className={cn(
            'grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:opacity-50',
            micEnabled
              ? 'bg-bg2 text-fg1 hover:bg-bg3'
              : 'bg-destructive text-destructive-foreground hover:bg-destructive-hover'
          )}
        >
          {micEnabled ? (
            <MicrophoneIcon size={18} weight="fill" />
          ) : (
            <MicrophoneSlashIcon size={18} weight="fill" />
          )}
        </button>

        {/* End conversation */}
        <button
          type="button"
          aria-label="End conversation"
          onClick={handleDisconnect}
          className="bg-destructive text-destructive-foreground hover:bg-destructive-hover grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors"
        >
          <XIcon size={18} weight="bold" />
        </button>

        {/* Collapse */}
        <button
          type="button"
          aria-label="Minimize"
          onClick={handleDisconnect}
          className="text-fg3 hover:bg-bg2 hover:text-fg1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors"
        >
          <CaretUpIcon size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
};
