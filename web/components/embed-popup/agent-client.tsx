'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type RemoteParticipant, Room, RoomEvent } from 'livekit-client';
import { motion } from 'motion/react';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import type { ConnectionDetails } from '@/app/api/connection-details/route';
import { ErrorMessage } from '@/components/embed-popup/error-message';
import { PopupView } from '@/components/embed-popup/popup-view';
import { Trigger } from '@/components/embed-popup/trigger';
import useConnectionDetails from '@/hooks/use-connection-details';
import { isNavigatingAction, saveResumeSession, takeResumeSession } from '@/lib/session-resume';
import { type AppConfig, EmbedErrorDetails } from '@/lib/types';
import { UI_ACTION_TOPIC, handleUiAction, parseUiAction } from '@/lib/ui-actions';
import { cn } from '@/lib/utils';

const PopupViewMotion = motion.create(PopupView);

export type EmbedFixedAgentClientProps = {
  appConfig: AppConfig;
};

function AgentClient({ appConfig }: EmbedFixedAgentClientProps) {
  const isAnimating = useRef(false);
  const room = useMemo(() => new Room(), []);
  const [popupOpen, setPopupOpen] = useState(false);
  const [error, setError] = useState<EmbedErrorDetails | null>(null);
  const {
    connectionDetails,
    connectionError,
    refreshConnectionDetails,
    existingOrRefreshConnectionDetails,
  } = useConnectionDetails(appConfig);

  // The connection details the room actually connected with — stashed before an
  // agent-driven navigation so the next page can resume the same room.
  const connectedDetailsRef = useRef<ConnectionDetails | null>(null);
  // If we arrived here mid-conversation (the previous page stashed a session),
  // resume into that same room instead of opening a fresh one. Read once.
  const resumeRef = useRef<ConnectionDetails | null>(null);
  const resumeReadRef = useRef(false);
  if (!resumeReadRef.current) {
    resumeReadRef.current = true;
    resumeRef.current = takeResumeSession();
  }

  const handleTogglePopup = () => {
    if (isAnimating.current) {
      // prevent re-opening before room has disconnected
      return;
    }

    setError(null);
    setPopupOpen((open) => !open);
  };

  const handlePanelAnimationStart = () => {
    isAnimating.current = true;
  };

  const handlePanelAnimationComplete = () => {
    isAnimating.current = false;
    if (!popupOpen && room.state !== 'disconnected') {
      room.disconnect();
    }
  };

  // Resuming from a navigation: auto-open the panel so the connect effect runs.
  useEffect(() => {
    if (resumeRef.current) {
      setPopupOpen(true);
    }
  }, []);

  useEffect(() => {
    const onDisconnected = () => {
      setPopupOpen(false);
      refreshConnectionDetails();
    };
    const onMediaDevicesError = (error: Error) => {
      setError({
        title: 'Encountered an error with your media devices',
        description: `${error.name}: ${error.message}`,
      });
    };
    // UI actions pushed by the voice agent (redirect/history/schedule) over the
    // data channel — navigate the host page in real time.
    const onDataReceived = (
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic && topic !== UI_ACTION_TOPIC) {
        return;
      }
      const action = parseUiAction(payload);
      if (!action) {
        return;
      }
      // Before a navigating action reloads the page, stash the live session so
      // the next page reconnects to the same room and the call continues.
      if (isNavigatingAction(action.action) && connectedDetailsRef.current) {
        saveResumeSession(connectedDetailsRef.current);
      }
      handleUiAction(action);
    };
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, refreshConnectionDetails]);

  useEffect(() => {
    if (!popupOpen) {
      return;
    }
    // When resuming a navigation we use the stashed details and don't need the
    // freshly fetched ones; otherwise we require connection details to proceed.
    if (!resumeRef.current && !connectionDetails) {
      // Only an actual fetch failure is an error. If the token simply hasn't
      // arrived yet (cold server, slow first request), stay in the connecting
      // state — this effect re-runs once connectionDetails lands.
      if (connectionError) {
        setError({
          title: 'Error fetching connection details',
          description: 'Please try again later',
        });
      }
      return;
    }
    if (room.state !== 'disconnected') {
      return;
    }

    const connect = async () => {
      try {
        // Resume into the same room if the previous page handed one off,
        // otherwise open a fresh session.
        const details = resumeRef.current ?? (await existingOrRefreshConnectionDetails());
        connectedDetailsRef.current = details;
        await Promise.all([
          room.localParticipant.setMicrophoneEnabled(true, undefined, {
            preConnectBuffer: appConfig.isPreConnectBufferEnabled,
          }),
          room.connect(details.serverUrl, details.participantToken),
        ]);
        resumeRef.current = null; // consumed
      } catch (error) {
        // A failed resume must not strand the widget — drop it so a retry opens
        // a fresh room rather than reusing the stale token.
        resumeRef.current = null;
        if (error instanceof Error) {
          console.error('Error connecting to agent:', error);
          setError({
            title: 'There was an error connecting to the agent',
            description: `${error.name}: ${error.message}`,
          });
        }
      }
    };

    connect();
  }, [
    room,
    popupOpen,
    connectionDetails,
    connectionError,
    existingOrRefreshConnectionDetails,
    appConfig.isPreConnectBufferEnabled,
  ]);

  // Once the token arrives, clear any stale "fetching" error so the connecting
  // UI takes over instead of staying stuck on the error card.
  useEffect(() => {
    if (connectionDetails) {
      setError((e) => (e?.title === 'Error fetching connection details' ? null : e));
    }
  }, [connectionDetails]);

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      <StartAudio label="Start Audio" />

      <Trigger
        appConfig={appConfig}
        error={error}
        popupOpen={popupOpen}
        onToggle={handleTogglePopup}
      />

      <motion.div
        inert={!popupOpen}
        initial={{
          opacity: 0,
          translateY: 8,
        }}
        animate={{
          opacity: popupOpen ? 1 : 0,
          translateY: popupOpen ? 0 : 8,
        }}
        transition={{
          type: 'spring',
          bounce: 0,
          duration: popupOpen ? 1 : 0.2,
        }}
        onAnimationStart={handlePanelAnimationStart}
        onAnimationComplete={handlePanelAnimationComplete}
        className="fixed right-0 bottom-[20px] left-0 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)]"
      >
        <div
          className={cn(
            'relative',
            error &&
              'bg-bg1 dark:bg-bg2 border-separator1 dark:border-separator2 h-[160px] w-[320px] max-w-[calc(100vw-2rem)] rounded-[28px] border border-solid drop-shadow-md'
          )}
        >
          <ErrorMessage appConfig={appConfig} error={error} />
          {!error && (
            <PopupViewMotion
              appConfig={appConfig}
              initial={{ opacity: 1 }}
              animate={{ opacity: error === null ? 1 : 0 }}
              transition={{
                type: 'linear',
                duration: 0.2,
              }}
              disabled={!popupOpen}
              sessionStarted={popupOpen}
              onEmbedError={setError}
            />
          )}
        </div>
      </motion.div>
    </RoomContext.Provider>
  );
}

export default AgentClient;
