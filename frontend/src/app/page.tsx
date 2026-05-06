'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CipherLabHero } from '@/components/landing/CipherLabHero';
import {
  CipherLabBackground,
  CipherLabComparison,
  CipherLabCTA,
  CipherLabFeatures,
  CipherLabFooter,
  CipherLabHowItWorks,
  CipherLabTrustStrip,
} from '@/components/landing/CipherLabSections';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { MenuToggle } from '@/components/ui/menu-toggle';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button, buttonVariants } from '@/components/ui/button';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  const navLinks = [
    { label: '_features', href: '#features' },
    { label: '_security', href: '#security' },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <CipherLabBackground />
      <div className="relative z-10">
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/75 backdrop-blur-lg">
          <nav className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <Logo />

            <div className="hidden items-center gap-7 text-sm lg:flex">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  className="font-mono text-muted-foreground transition-colors hover:text-foreground"
                  href={link.href}
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-2.5 lg:flex">
              <ThemeToggle />
              <Link href="/login">
                <Button
                  variant="outline"
                  className="h-9 rounded-md bg-background/80 px-4 text-foreground hover:bg-muted"
                >
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button className="h-9 rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary/90">
                  Get started
                  <ArrowRight size={14} />
                </Button>
              </Link>
            </div>

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Button size="icon" variant="outline" className="lg:hidden">
                <MenuToggle
                  className="size-5"
                  onOpenChange={setMobileOpen}
                  open={mobileOpen}
                  strokeWidth={2.5}
                />
              </Button>
              <SheetContent
                className="gap-0 bg-background/95 backdrop-blur-lg"
                showCloseButton={false}
                side="left"
              >
                <div className="grid gap-y-2 px-4 pt-12 pb-5">
                  {navLinks.map((link) => (
                    <a
                      key={link.label}
                      className={buttonVariants({
                        variant: 'ghost',
                        className: 'justify-start font-mono',
                      })}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                <SheetFooter>
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground">theme</span>
                    <ThemeToggle />
                  </div>
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    <Button variant="secondary" className="w-full rounded-md">
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full rounded-md bg-primary text-primary-foreground">
                      Get started
                    </Button>
                  </Link>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </nav>
        </header>

        <CipherLabHero />
        <CipherLabTrustStrip />
        <CipherLabHowItWorks />
        <CipherLabFeatures />
        <CipherLabComparison />
        <CipherLabCTA />
        <CipherLabFooter />
      </div>
    </div>
  );
}
