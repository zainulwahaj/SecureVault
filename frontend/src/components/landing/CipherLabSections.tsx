'use client';

import type { ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  CloudUpload,
  Cpu,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function CipherLabBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 a-grid" />
      <div className="absolute inset-0 a-noise" />
      <div className="a-scan-bar absolute top-0 left-0 right-0 h-[2px] opacity-40" />
    </div>
  );
}

export function CipherLabTrustStrip() {
  const items = [
    'ZERO-KNOWLEDGE',
    'XChaCha20-Poly1305',
    'PBKDF2-SHA256',
    'X25519 KEY EXCHANGE',
    'OPEN SOURCE',
    'NO TELEMETRY',
    'CLIENT-SIDE ONLY',
    'RFC 8439 COMPLIANT',
  ];
  const duplicateItems = [...items, ...items];

  return (
    <section className="overflow-hidden border-y border-border bg-background py-7 sm:py-8">
      <div className="a-marquee flex gap-12 whitespace-nowrap sm:gap-14">
        {duplicateItems.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-12 font-mono text-[13px] text-muted-foreground sm:gap-14"
          >
            {item}
            <span className="text-border">/</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function CipherLabHowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'You type your password',
      body: 'It never leaves your device. We derive a master key with PBKDF2-SHA256 and 100,000 iterations right in your browser.',
      code: 'master = PBKDF2(password, salt, 100_000)',
    },
    {
      n: '02',
      title: 'Files encrypt locally',
      body: 'Each file gets a unique data key. We encrypt with XChaCha20-Poly1305, a fast modern authenticated cipher.',
      code: 'cipher = XChaCha20(file, key, nonce)',
    },
    {
      n: '03',
      title: 'Only ciphertext uploads',
      body: 'The opaque blob travels to our servers. We see noise. You hold the only key that can turn it back into a file.',
      code: 'upload(cipher) // server sees encrypted bytes',
    },
  ];

  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-wrap items-baseline justify-between gap-8 lg:mb-16">
          <div>
            <div className="mb-4 font-mono text-xs text-primary">02 / ARCHITECTURE</div>
            <h2 className="m-0 max-w-[720px] text-4xl font-medium leading-none sm:text-5xl lg:text-6xl">
              Three steps. <span className="font-serif italic text-primary">Zero</span> trust required.
            </h2>
          </div>
          <p className="m-0 max-w-[380px] leading-relaxed text-muted-foreground">
            The whole encryption pipeline runs on your machine. We have designed our servers to be useless
            without you, and that is exactly the point.
          </p>
        </div>

        <div className="grid grid-cols-1 overflow-hidden rounded-md border border-border lg:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.n}
              className={cn(
                'relative flex min-h-[340px] flex-col bg-white/[0.02] p-6 dark:bg-white/[0.03] sm:p-8 lg:min-h-[420px] lg:p-9',
                index < 2 && 'border-b border-border lg:border-r lg:border-b-0',
              )}
            >
              <div
                className="font-mono text-[72px] font-light leading-none text-transparent lg:text-[80px]"
                style={{ WebkitTextStroke: '1px var(--border)' }}
              >
                {step.n}
              </div>
              <div className="mt-6 max-w-[280px] text-2xl font-medium">{step.title}</div>
              <p className="mt-3 flex-1 text-[15px] leading-[1.55] text-muted-foreground">{step.body}</p>
              <div className="mt-6 break-all rounded-md border border-border bg-background px-3.5 py-3 font-mono text-xs leading-[1.5] text-primary">
                <span className="text-muted-foreground/70">$ </span>
                {step.code}
              </div>
              {index < 2 && (
                <div className="absolute -right-2.5 top-1/2 z-10 hidden size-5 place-items-center rounded-full border border-border bg-background lg:grid">
                  <ArrowRight size={10} className="text-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CipherLabFeatures() {
  return (
    <section id="features" className="px-4 pt-8 pb-20 sm:px-6 sm:pb-24 lg:px-8 lg:pb-32">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 lg:mb-14">
          <div className="mb-4 font-mono text-xs text-primary">03 / CAPABILITIES</div>
          <h2 className="m-0 max-w-[900px] text-4xl font-medium leading-none sm:text-5xl lg:text-6xl">
            Security that <span className="font-serif italic text-primary">doesn't</span> ask for trust.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:auto-rows-[180px] lg:grid-cols-6">
          <div className="a-card relative overflow-hidden rounded-md border border-border bg-white/[0.02] p-6 dark:bg-white/[0.03] sm:p-8 lg:col-span-4 lg:row-span-2">
            <div className="relative flex h-full flex-col">
              <KeyRound size={28} className="text-primary" />
              <div className="mt-16 lg:mt-auto">
                <div className="text-3xl font-medium">Zero-knowledge architecture</div>
                <p className="mt-3 max-w-[540px] text-[15px] leading-[1.55] text-muted-foreground">
                  Your password and keys never leave your device. Even if our entire database leaked,
                  every byte would be useless ciphertext.
                </p>
                <div className="mt-6 flex flex-wrap gap-5 font-mono text-xs text-muted-foreground/70">
                  <span>{'-> password.deriveKey()'}</span>
                  <span>{'-> key.stays(local)'}</span>
                  <span>{'-> server.knows(nothing)'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="a-card flex min-h-[240px] flex-col rounded-md border border-border bg-white/[0.02] p-6 dark:bg-white/[0.03] sm:p-7 lg:col-span-2 lg:row-span-2">
            <Lock size={26} className="text-primary" />
            <div className="mt-16 lg:mt-auto">
              <div className="text-[22px] font-medium">XChaCha20-Poly1305</div>
              <p className="mt-2 text-[13px] leading-[1.55] text-muted-foreground">
                Modern AEAD cipher. Authenticated. 192-bit nonces. Hardware-fast on every platform.
              </p>
            </div>
          </div>

          <FeatureTile
            body="Slows brute force to a crawl."
            icon={<ShieldCheck size={26} className="shrink-0 text-primary" />}
            title="100,000 PBKDF2 iterations"
          />
          <FeatureTile
            body="Compromise one, the rest stay safe."
            icon={<CloudUpload size={26} className="shrink-0 text-primary" />}
            title="Per-file unique keys"
          />
          <FeatureTile
            body="Recipients decrypt with their own key."
            icon={<Users size={26} className="shrink-0 text-primary" />}
            title="Envelope sharing"
          />

          <div className="a-card flex flex-col overflow-hidden rounded-md border border-border bg-white/[0.02] dark:bg-white/[0.03] lg:col-span-6 lg:flex-row">
            <div className="border-b border-border p-5 px-6 lg:flex-[0_0_280px] lg:border-r lg:border-b-0 lg:px-7">
              <Cpu size={22} className="text-primary" />
              <div className="mt-3 text-[17px] font-medium">Tamper-evident log</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Every action signed. Hash-chained. Verifiable.
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 overflow-hidden px-5 py-4 font-mono text-xs sm:px-6 lg:py-3.5">
              {[
                { t: '17:42:08', e: 'file.upload', f: 'q4_report.pdf', h: '0x9af3...b21e' },
                { t: '17:41:51', e: 'key.rotate', f: '-', h: '0x4c11...77a0' },
                { t: '17:39:22', e: 'share.create', f: 'photos.zip -> alex@...', h: '0xe802...3f4d' },
              ].map((row) => (
                <div
                  key={`${row.t}-${row.e}`}
                  className="flex min-w-0 items-center gap-3 text-muted-foreground sm:grid sm:grid-cols-[90px_130px_minmax(0,1fr)_110px_16px] sm:gap-4"
                >
                  <span className="w-[72px] shrink-0 text-muted-foreground/70 sm:w-auto">{row.t}</span>
                  <span className="w-[104px] shrink-0 truncate text-primary sm:w-auto">{row.e}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{row.f}</span>
                  <span className="hidden text-muted-foreground/70 sm:inline">{row.h}</span>
                  <Check size={14} className="shrink-0 text-emerald-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureTile({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="a-card flex items-center gap-4 rounded-md border border-border bg-white/[0.02] p-6 dark:bg-white/[0.03] lg:col-span-2">
      {icon}
      <div className="min-w-0">
        <div className="text-[17px] font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}

export function CipherLabComparison() {
  const rows = [
    { feat: 'Reads your files', vault: false, cloud: true },
    { feat: 'Can reset your password', vault: false, cloud: true },
    { feat: 'Sees filenames and metadata', vault: false, cloud: true },
    { feat: 'End-to-end encrypted by default', vault: true, cloud: false },
    { feat: 'Per-file independent keys', vault: true, cloud: false },
    { feat: 'Open-source and auditable', vault: true, cloud: false },
    { feat: 'Useful if database leaks', vault: true, cloud: false },
  ];

  return (
    <section id="security" className="px-4 pt-8 pb-20 sm:px-6 sm:pb-24 lg:px-8 lg:pb-32">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12">
          <div className="mb-4 font-mono text-xs text-primary">04 / COMPARISON</div>
          <h2 className="m-0 text-4xl font-medium leading-[1.05] sm:text-5xl lg:text-[56px]">
            What other clouds <span className="font-serif italic">actually</span> see.
          </h2>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-white/[0.02] dark:bg-white/[0.03]">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-border px-7 py-5 font-mono text-[11px] text-muted-foreground">
                <div>CAPABILITY</div>
                <div className="flex items-center gap-2 text-primary">
                  <span className="size-2 rounded-sm bg-primary" />
                  SECUREVAULT
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-sm bg-border" />
                  TYPICAL CLOUD
                </div>
              </div>
              {rows.map((row, index) => (
                <div
                  key={row.feat}
                  className={cn(
                    'grid grid-cols-[1.4fr_1fr_1fr] items-center px-7 py-4 text-[15px]',
                    index < rows.length - 1 && 'border-b border-border',
                  )}
                >
                  <div>{row.feat}</div>
                  <CompPill good yes={row.vault} />
                  <CompPill good={false} yes={row.cloud} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompPill({ good, yes }: { good: boolean; yes: boolean }) {
  const ok = good === yes;

  return (
    <div>
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[13px]',
          ok ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500',
        )}
      >
        {yes ? <Check size={14} /> : <X size={14} />}
        {yes ? 'yes' : 'no'}
      </span>
    </div>
  );
}

export function CipherLabCTA() {
  return (
    <section className="border-y border-border bg-background/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="relative mx-auto max-w-[1080px] overflow-hidden">
        <div className="a-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-[720px] text-center">
          <Fingerprint size={36} className="mx-auto text-primary" />
          <h2 className="mt-5 mb-4 text-4xl font-medium leading-none sm:text-5xl lg:text-[56px]">
            Ready to take your files <span className="font-serif italic text-primary">back?</span>
          </h2>
          <p className="mx-auto mb-8 max-w-[540px] text-[17px] leading-[1.55] text-muted-foreground">
            Create a vault in under sixty seconds. No credit card. No tracking. No way for us to
            peek inside.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <a
              className="a-cta inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-primary px-8 text-[15px] font-semibold text-primary-foreground"
              href="/register"
              style={{
                boxShadow: '0 8px 28px oklch(from var(--primary) l c h / 0.36)',
              }}
            >
              Get started free
              <ArrowRight size={16} />
            </a>
            <a
              className="inline-flex h-[52px] items-center justify-center rounded-md border border-border bg-background/70 px-6 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
              href="#security"
            >
              Compare security
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CipherLabFooter() {
  return (
    <footer className="border-t border-border px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-3 text-center font-mono text-xs text-muted-foreground md:flex-row md:text-left">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6 place-items-center rounded-md bg-primary">
            <ShieldCheck size={14} className="text-primary-foreground" />
          </div>
          secure<span className="text-primary">vault</span>
        </div>
        <div>your data stays yours / always encrypted / always private</div>
        <div>2026 / v2.0.4-stable</div>
      </div>
    </footer>
  );
}
