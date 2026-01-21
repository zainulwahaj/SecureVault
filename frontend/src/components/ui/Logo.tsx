'use client';

import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  animated?: boolean;
}

const sizes = {
  sm: { icon: 'w-6 h-6', text: 'text-lg' },
  md: { icon: 'w-8 h-8', text: 'text-xl' },
  lg: { icon: 'w-10 h-10', text: 'text-2xl' },
  xl: { icon: 'w-12 h-12', text: 'text-3xl' },
};

export function Logo({ size = 'md', showText = true, className, animated = false }: LogoProps) {
  const { icon, text } = sizes[size];

  const IconWrapper = animated ? motion.div : 'div';
  const iconProps = animated
    ? {
        animate: { rotate: [0, 5, -5, 0] },
        transition: { duration: 2, repeat: Infinity, repeatDelay: 3 },
      }
    : {};

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <IconWrapper
        className={clsx(
          icon,
          'relative flex items-center justify-center'
        )}
        {...iconProps}
      >
        {/* Shield background */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id={`shieldGradient-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <path
            d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"
            fill={`url(#shieldGradient-${size})`}
          />
        </svg>
        {/* Lock icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="relative w-1/2 h-1/2 text-white"
        >
          <path
            d="M12 15v2m-3-2v-3a3 3 0 116 0v3m-9 0h12a1 1 0 011 1v5a1 1 0 01-1 1H6a1 1 0 01-1-1v-5a1 1 0 011-1z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </IconWrapper>
      {showText && (
        <span className={clsx(text, 'font-bold')}>
          <span className="text-slate-900 dark:text-white">Secure</span>
          <span className="text-gradient">Vault</span>
        </span>
      )}
    </div>
  );
}

// Animated logo for loading states
export function LogoLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [1, 0.8, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <Logo size="xl" showText={false} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-1"
      >
        <span className="text-sm text-slate-600 dark:text-slate-400">Loading</span>
        <motion.span
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-slate-600 dark:text-slate-400"
        >
          ...
        </motion.span>
      </motion.div>
    </div>
  );
}
