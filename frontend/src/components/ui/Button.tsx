'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { clsx } from 'clsx';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean; // Alias for isLoading
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
  fullWidth?: boolean;
}

const variants = {
  primary: 'bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white shadow-md hover:shadow-lg hover:shadow-primary-500/25',
  secondary: 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600',
  ghost: 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50',
  danger: 'bg-gradient-to-r from-error-600 to-error-500 hover:from-error-700 hover:to-error-600 text-white shadow-md hover:shadow-lg hover:shadow-error-500/25',
  outline: 'border-2 border-primary-500 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loading = false, // Alias
      leftIcon,
      rightIcon,
      children,
      fullWidth = false,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading || loading;

    return (
      <motion.button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-semibold',
          'transition-all duration-200 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
          variants[variant],
          sizes[size],
          variant === 'primary' && 'focus:ring-primary-500',
          variant === 'secondary' && 'focus:ring-slate-400',
          variant === 'danger' && 'focus:ring-error-500',
          variant === 'outline' && 'focus:ring-primary-500',
          fullWidth && 'w-full',
          className
        )}
        disabled={isDisabled}
        whileHover={!isDisabled ? { y: -2 } : {}}
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        {...props}
      >
        {(isLoading || loading) ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
