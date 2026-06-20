'use client';

import { motion } from 'motion/react';
import { type AgentState } from '@livekit/components-react';

interface AgentOrbProps {
  state: AgentState;
}

/**
 * The animated green orb shown on the left of the session bar.
 * - connecting / initializing -> dashed ring slowly spinning
 * - listening                 -> filled organic blob gently morphing
 * - speaking / thinking        -> outlined ring pulsing
 */
export function AgentOrb({ state }: AgentOrbProps) {
  const isConnecting = state === 'connecting' || state === 'initializing';
  const isListening = state === 'listening';
  const isSpeaking = state === 'speaking';

  return (
    <div className="relative grid size-8 shrink-0 place-items-center">
      {/* soft green halo */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,var(--agent-green-soft),transparent_70%)]" />

      {isConnecting ? (
        <motion.div
          aria-hidden
          className="size-7 rounded-full border-2 border-dashed border-[var(--agent-green)] opacity-70"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, ease: 'linear', duration: 3 }}
        />
      ) : isListening ? (
        <motion.div
          aria-hidden
          className="size-7 bg-[var(--agent-green)]"
          animate={{
            scale: [1, 1.12, 0.97, 1.08, 1],
            borderRadius: ['50%', '58% 42% 55% 45%', '45% 55% 42% 58%', '55% 45% 58% 42%', '50%'],
          }}
          transition={{ repeat: Infinity, ease: 'easeInOut', duration: 3.2 }}
        />
      ) : (
        <motion.div
          aria-hidden
          className="size-7 rounded-full border-2 border-[var(--agent-green)]"
          animate={isSpeaking ? { scale: [1, 1.16, 1] } : { scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, ease: 'easeInOut', duration: isSpeaking ? 0.9 : 2 }}
        />
      )}
    </div>
  );
}
