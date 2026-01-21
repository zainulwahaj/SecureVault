'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

const positions = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 dark:border-t-slate-700 border-x-transparent border-b-transparent',
    initial: { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0 },
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 dark:border-b-slate-700 border-x-transparent border-t-transparent',
    initial: { opacity: 0, y: -5 },
    animate: { opacity: 1, y: 0 },
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 dark:border-l-slate-700 border-y-transparent border-r-transparent',
    initial: { opacity: 0, x: 5 },
    animate: { opacity: 1, x: 0 },
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 dark:border-r-slate-700 border-y-transparent border-l-transparent',
    initial: { opacity: 0, x: -5 },
    animate: { opacity: 1, x: 0 },
  },
};

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    setIsVisible(false);
  };

  const pos = positions[position];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={pos.initial}
            animate={pos.animate}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={clsx(
              'absolute z-50 px-2.5 py-1.5',
              'text-xs font-medium text-white whitespace-nowrap',
              'bg-slate-900 dark:bg-slate-700 rounded-lg shadow-lg',
              pos.tooltip
            )}
          >
            {content}
            <div
              className={clsx(
                'absolute w-0 h-0 border-4',
                pos.arrow
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
