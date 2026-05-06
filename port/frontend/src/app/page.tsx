'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Logo, LogoLoader } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { MenuToggle } from '@/components/ui/menu-toggle';
import { ArrowRight } from 'lucide-react';
import {
  CipherLabBackground, CipherLabTrustStrip, CipherLabHowItWorks,
  CipherLabFeatures, CipherLabComparison, CipherLabCTA, CipherLabFooter,
} from '@/components/landing/CipherLabSections';
import { CipherLabHero } from '@/components/landing/CipherLabHero';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) router.push('/dashboard');
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><LogoLoader/></div>;
  }

  const navLinks = [
    { label: '_features', href: '#features' },
    { label: '_security', href: '#security' },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <CipherLabBackground />
      <div className="relative z-10">
        <header className="sticky top-0 z-50 w-full border-b border-border backdrop-blur-lg bg-background/65">
          <nav className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between px-8">
            <Logo />
            <div className="hidden lg:flex items-center gap-7 text-sm">
              {navLinks.map(l => (
                <a key={l.label} href={l.href} className="font-mono text-muted-foreground hover:text-foreground transition-colors">{l.label}</a>
              ))}
            </div>
            <div className="hidden lg:flex items-center gap-2.5">
              <ThemeToggle />
              <Link href="/login">
                <Button className="h-9 rounded-lg border border-border bg-white/[0.02] dark:bg-white/[0.03] text-foreground hover:bg-muted">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button className="h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5">
                  Get started <ArrowRight size={14}/>
                </Button>
              </Link>
            </div>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Button size="icon" variant="outline" className="lg:hidden">
                <MenuToggle strokeWidth={2.5} open={mobileOpen} onOpenChange={setMobileOpen} className="size-5"/>
              </Button>
              <SheetContent side="left" showCloseButton={false} className="bg-background/95 backdrop-blur-lg gap-0">
                <div className="grid gap-y-2 px-4 pt-12 pb-5">
                  {navLinks.map(l => (
                    <a key={l.label} href={l.href} onClick={() => setMobileOpen(false)}
                       className={buttonVariants({ variant: 'ghost', className: 'justify-start font-mono' })}>{l.label}</a>
                  ))}
                </div>
                <SheetFooter>
                  <Link href="/login" onClick={() => setMobileOpen(false)}><Button variant="secondary" className="w-full">Sign in</Button></Link>
                  <Link href="/register" onClick={() => setMobileOpen(false)}><Button className="w-full bg-primary text-primary-foreground">Get started</Button></Link>
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
