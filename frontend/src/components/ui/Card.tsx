'use client';

import { type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { clsx } from 'clsx';

export interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'glass' | 'elevated' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  children: ReactNode;
}

const variants = {
  default: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
  glass: 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50',
  elevated: 'bg-white dark:bg-slate-800 shadow-soft-lg',
  bordered: 'bg-transparent border-2 border-slate-200 dark:border-slate-700',
};

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  variant = 'default',
  padding = 'md',
  hover = false,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <motion.div
      className={clsx(
        'rounded-2xl',
        variants[variant],
        paddings[padding],
        hover && 'transition-all duration-300 hover:shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-800',
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mb-6', className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={clsx('text-xl font-semibold text-slate-900 dark:text-white', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={clsx('mt-1 text-sm text-slate-500 dark:text-slate-400', className)}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mt-6 pt-6 border-t border-slate-200 dark:border-slate-700', className)}>
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;
