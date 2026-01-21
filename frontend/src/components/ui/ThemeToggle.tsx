'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check initial theme
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    
    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className={clsx('w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800', className)} />
    );
  }

  return (
    <motion.button
      onClick={toggleTheme}
      className={clsx(
        'relative w-10 h-10 rounded-xl',
        'bg-slate-100 dark:bg-slate-800',
        'hover:bg-slate-200 dark:hover:bg-slate-700',
        'flex items-center justify-center',
        'transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
        className
      )}
      whileTap={{ scale: 0.95 }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        initial={false}
        animate={{
          rotate: isDark ? 180 : 0,
          scale: isDark ? 0 : 1,
          opacity: isDark ? 0 : 1,
        }}
        transition={{ duration: 0.3 }}
        className="absolute"
      >
        <SunIcon className="w-5 h-5 text-amber-500" />
      </motion.div>
      <motion.div
        initial={false}
        animate={{
          rotate: isDark ? 0 : -180,
          scale: isDark ? 1 : 0,
          opacity: isDark ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="absolute"
      >
        <MoonIcon className="w-5 h-5 text-primary-400" />
      </motion.div>
    </motion.button>
  );
}

// Theme provider initialization script
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (e) {}
          })();
        `,
      }}
    />
  );
}
