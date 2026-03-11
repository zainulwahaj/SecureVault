'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { MenuToggle } from '@/components/ui/menu-toggle';
import { BentoCard, BentoGrid } from '@/components/ui/bento-grid';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { WebGLShader } from '@/components/ui/web-gl-shader';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  CloudUpload,
  Users,
  Fingerprint,
  MoveRight,
  CheckCircle2,
} from 'lucide-react';

const features = [
  {
    Icon: Lock,
    name: 'End-to-End Encryption',
    description: 'Your files are encrypted before leaving your browser using XChaCha20-Poly1305.',
    href: '/register',
    cta: 'Learn more',
    className: 'lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3',
    background: (
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
    ),
  },
  {
    Icon: KeyRound,
    name: 'Zero-Knowledge Architecture',
    description: 'We never see your password or encryption keys. Only you can access your data.',
    href: '/register',
    cta: 'Learn more',
    className: 'lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3',
    background: (
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-50" />
    ),
  },
  {
    Icon: ShieldCheck,
    name: 'Military-Grade Security',
    description: 'PBKDF2-SHA256 key derivation with 100,000 iterations protects your master key.',
    href: '/register',
    cta: 'Learn more',
    className: 'lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4',
    background: (
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-50" />
    ),
  },
  {
    Icon: CloudUpload,
    name: 'Secure File Storage',
    description: 'Upload any file type. Each file gets its own unique encryption key.',
    href: '/register',
    cta: 'Learn more',
    className: 'lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2',
    background: (
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent opacity-50" />
    ),
  },
  {
    Icon: Users,
    name: 'Secure Sharing',
    description: 'Share files with others using envelope encryption. They decrypt with their key.',
    href: '/register',
    cta: 'Learn more',
    className: 'lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4',
    background: (
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-50" />
    ),
  },
];

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [titleNumber, setTitleNumber] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const titles = useMemo(
    () => ['encrypted', 'private', 'protected', 'secure', 'yours'],
    [],
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Security', href: '#security' },
  ];

  return (
    <div className="relative min-h-screen">
      {/* WebGL Shader Background */}
      <WebGLShader />

      {/* Content overlay */}
      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-lg dark:bg-black/40 dark:border-white/10 supports-[backdrop-filter]:dark:bg-black/30">
          <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
            <Logo />
            <div className="hidden items-center gap-2 lg:flex">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  className={buttonVariants({ variant: 'ghost', className: 'text-foreground hover:text-foreground dark:text-white/80 dark:hover:text-white dark:hover:bg-white/10' })}
                  href={link.href}
                >
                  {link.label}
                </a>
              ))}
              <ThemeToggle />
              <Link href="/login">
                <Button
                  className="h-9 min-w-[7rem] rounded-full border-0 px-5 py-2 text-sm font-semibold bg-muted text-foreground hover:bg-muted/80 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <InteractiveHoverButton text="Get Started" className="w-auto min-w-[7rem] px-5 py-2 border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary" />
              </Link>
            </div>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Button size="icon" variant="outline" className="lg:hidden border-border dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
                <MenuToggle
                  strokeWidth={2.5}
                  open={mobileOpen}
                  onOpenChange={setMobileOpen}
                  className="size-5"
                />
              </Button>
              <SheetContent
                className="bg-background/95 supports-[backdrop-filter]:bg-background/80 gap-0 backdrop-blur-lg"
                showCloseButton={false}
                side="left"
              >
                <div className="grid gap-y-2 overflow-y-auto px-4 pt-12 pb-5">
                  {navLinks.map((link) => (
                    <a
                      key={link.label}
                      className={buttonVariants({
                        variant: 'ghost',
                        className: 'justify-start',
                      })}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                <SheetFooter>
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    <Button variant="secondary" className="w-full rounded-full">Sign In</Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <InteractiveHoverButton text="Get Started" className="w-full min-w-0 rounded-lg border-primary bg-primary text-primary-foreground" />
                  </Link>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-background/20 to-transparent dark:from-transparent dark:via-transparent" />
          <div className="container relative z-10 mx-auto">
            <div className="flex gap-8 py-20 lg:py-40 items-center justify-center flex-col">
              <div>
                <Button variant="secondary" size="sm" className="gap-4 border border-border bg-muted/50 text-foreground hover:bg-muted dark:bg-white/10 dark:text-white/90 dark:border-white/20 dark:hover:bg-white/20 backdrop-blur-sm">
                  <ShieldCheck className="size-4" />
                  Zero-Knowledge Encryption
                  <MoveRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-4 flex-col">
                <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
                  <span className="text-foreground dark:text-white">Your files, always</span>
                  <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1">
                    &nbsp;
                    {titles.map((title, index) => (
                      <motion.span
                        key={index}
                        className="absolute font-semibold bg-gradient-to-r from-foreground to-foreground/60 dark:from-white dark:to-white/60 bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: '-100' }}
                        transition={{ type: 'spring', stiffness: 50 }}
                        animate={
                          titleNumber === index
                            ? {
                                y: 0,
                                opacity: 1,
                              }
                            : {
                                y: titleNumber > index ? -150 : 150,
                                opacity: 0,
                              }
                        }
                      >
                        {title}
                      </motion.span>
                    ))}
                  </span>
                </h1>

                <p className="text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground max-w-2xl text-center dark:text-white/60">
                  A secure file vault where all encryption happens in your browser.
                  We can&apos;t read your files. We can&apos;t reset your password.
                  That&apos;s the point.
                </p>
              </div>
              <div className="flex flex-row gap-3">
                <Link href="/login">
                  <Button
                    className="h-11 min-w-[9rem] rounded-full border-0 px-8 py-2.5 text-base font-semibold bg-muted text-foreground hover:bg-muted/80 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <InteractiveHoverButton text="Get Started" className="w-auto min-w-[9rem] px-8 py-2.5 text-base border-primary bg-primary text-primary-foreground" />
                </Link>
              </div>

              {/* Trust badges */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground dark:text-white/50">
                {['Open Source', 'Client-Side Only', 'No Tracking'].map((label) => (
                  <div key={label} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid Section */}
        <section id="features" className="py-20 px-4 bg-background">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
                Security Without Compromise
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Every feature is designed with your privacy in mind. No backdoors, no exceptions.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <BentoGrid className="lg:grid-rows-3">
                {features.map((feature) => (
                  <BentoCard key={feature.name} {...feature} />
                ))}
              </BentoGrid>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="security" className="py-20 px-4 bg-background">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="relative rounded-2xl border border-border bg-card p-8 sm:p-12 shadow-xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
              <div className="relative">
                <Fingerprint className="size-12 text-primary mx-auto mb-6" />
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                  Ready to secure your files?
                </h2>
                <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                  Create your vault in seconds. No credit card required. Your first step towards true privacy.
                </p>
                <Link href="/register">
                  <InteractiveHoverButton text="Get Started Free" className="w-auto min-w-[10rem] px-6 py-3 text-base border-primary bg-primary text-primary-foreground" />
                </Link>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 border-t border-border bg-background">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <Logo size="sm" />
            <p className="text-sm text-muted-foreground">
              Your data stays yours. Always encrypted. Always private.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
