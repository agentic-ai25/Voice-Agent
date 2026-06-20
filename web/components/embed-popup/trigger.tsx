import { AnimatePresence, motion } from 'motion/react';
import { AgentOrb } from '@/components/embed-popup/agent-orb';
import { BorderLine } from '@/components/embed-popup/border-line';
import type { AppConfig } from '@/lib/types';
import { EmbedErrorDetails } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TriggerProps {
  appConfig: AppConfig;
  error: EmbedErrorDetails | null;
  popupOpen: boolean;
  onToggle: () => void;
}

/**
 * The launcher, shown when the widget is closed: a pill with the orb + a call
 * to action (e.g. "Start the demo"). Clicking it opens/connects, after which
 * the active session pill takes over. Hidden while the pill is open.
 */
export function Trigger({ appConfig, popupOpen, onToggle }: TriggerProps) {
  const label = appConfig.startButtonText || 'Start the demo';

  return (
    <AnimatePresence>
      {!popupOpen && (
        <motion.button
          key="trigger-pill"
          type="button"
          onClick={onToggle}
          aria-label={label}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
          className={cn(
            'bg-background border-separator1 fixed right-0 bottom-4 left-0 z-50 mx-auto flex w-fit cursor-pointer items-center gap-2 rounded-full border py-2 pr-4 pl-3 drop-shadow-md'
          )}
        >
          <BorderLine />
          <AgentOrb state="listening" />
          <span className="text-fg1 pr-1 text-[15px] font-medium whitespace-nowrap select-none">
            {label}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
