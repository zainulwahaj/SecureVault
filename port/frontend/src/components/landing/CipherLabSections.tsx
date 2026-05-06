/* Background, Trust strip, How it works, Features, Comparison, CTA, Footer
   for the Cipher Lab landing page. Each is a separate export below. */
'use client';

import * as React from 'react';
import {
  ShieldCheck, Lock, KeyRound, CloudUpload, Users, Fingerprint,
  ArrowRight, Check, X, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============ Background ============
export function CipherLabBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 a-grid" />
      <div className="absolute inset-0 a-noise" />
      <div className="absolute -top-[300px] left-1/2 -translate-x-1/2 w-[1400px] h-[700px] blur-[40px]"
           style={{ background: 'radial-gradient(ellipse at center, oklch(from var(--primary) l c h / 0.15) 0%, transparent 60%)' }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-40 a-scan-bar" />
    </div>
  );
}

// ============ Trust Strip ============
export function CipherLabTrustStrip() {
  const items = ['ZERO-KNOWLEDGE', 'XChaCha20-Poly1305', 'PBKDF2-SHA256', 'X25519 KEY EXCHANGE', 'OPEN SOURCE', 'NO TELEMETRY', 'CLIENT-SIDE ONLY', 'RFC 8439 COMPLIANT'];
  const dup = [...items, ...items];
  return (
    <section className="py-8 border-y border-border overflow-hidden bg-background">
      <div className="flex gap-14 whitespace-nowrap a-marquee">
        {dup.map((t, i) => (
          <span key={i} className="font-mono text-[13px] tracking-[0.18em] text-muted-foreground inline-flex items-center gap-14">
            {t}<span className="text-border">◆</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// ============ How It Works ============
export function CipherLabHowItWorks() {
  const steps = [
    { n: '01', title: 'You type your password', body: 'It never leaves your device. We derive a master key with PBKDF2-SHA256 (100,000 iterations) right in your browser.', code: 'master = PBKDF2(password, salt, 100_000)' },
    { n: '02', title: 'Files encrypt locally', body: 'Each file gets a unique data key. We encrypt with XChaCha20-Poly1305 — fast, modern, authenticated.', code: 'cipher = XChaCha20(file, key, nonce)' },
    { n: '03', title: 'Only ciphertext uploads', body: 'The opaque blob travels to our servers. We see noise. You hold the only key that can turn it back into a file.', code: 'upload(cipher) // server sees: ████████' },
  ];
  return (
    <section className="px-8 py-32 relative">
      <div className="max-w-[1280px] mx-auto">
        <div className="flex items-baseline justify-between mb-16 gap-8 flex-wrap">
          <div>
            <div className="font-mono text-xs text-primary tracking-[0.18em] mb-4">§ 02 · ARCHITECTURE</div>
            <h2 className="text-6xl font-medium tracking-[-0.035em] leading-none max-w-[720px] m-0">
              Three steps. <span className="font-serif italic text-primary font-normal">Zero</span> trust required.
            </h2>
          </div>
          <p className="text-muted-foreground max-w-[360px] leading-relaxed m-0">
            The whole encryption pipeline runs on your machine. We've designed our servers to be useless without you — and that's exactly the point.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 border border-border rounded-[20px] overflow-hidden">
          {steps.map((s, i) => (
            <div key={s.n} className={cn(
              'p-9 relative bg-white/[0.02] dark:bg-white/[0.03] min-h-[420px] flex flex-col',
              i < 2 && 'lg:border-r border-border'
            )}>
              <div className="font-mono text-[80px] font-light leading-none tracking-[-0.05em] text-transparent" style={{ WebkitTextStroke: '1px var(--border)' }}>{s.n}</div>
              <div className="mt-6 text-2xl font-medium tracking-[-0.02em] max-w-[280px]">{s.title}</div>
              <p className="text-muted-foreground text-[15px] leading-[1.55] mt-3 flex-1">{s.body}</p>
              <div className="mt-6 px-3.5 py-3 rounded-lg bg-background border border-border font-mono text-xs text-primary leading-[1.5] break-all">
                <span className="text-muted-foreground/70">$ </span>{s.code}
              </div>
              {i < 2 && (
                <div className="absolute -right-2.5 top-1/2 hidden lg:grid place-items-center w-5 h-5 rounded-full bg-background border border-border z-10">
                  <ArrowRight size={10} className="text-primary"/>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ Features ============
export function CipherLabFeatures() {
  return (
    <section id="features" className="px-8 pb-32 pt-10">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-14">
          <div className="font-mono text-xs text-primary tracking-[0.18em] mb-4">§ 03 · CAPABILITIES</div>
          <h2 className="text-6xl font-medium tracking-[-0.035em] leading-none max-w-[900px] m-0">
            Security that <span className="font-serif italic text-primary font-normal">doesn't</span> ask for trust.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-6 lg:auto-rows-[180px] gap-4">
          {/* Big card */}
          <div className="a-card lg:col-span-4 lg:row-span-2 p-8 rounded-[20px] border border-border bg-white/[0.02] dark:bg-white/[0.03] relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-[360px] h-[360px] rounded-full blur-[20px]"
                 style={{ background: 'radial-gradient(circle, oklch(from var(--primary) l c h / 0.2), transparent 60%)' }}/>
            <div className="relative flex flex-col h-full">
              <KeyRound size={28} className="text-primary"/>
              <div className="mt-auto">
                <div className="text-3xl font-medium tracking-[-0.025em]">Zero-knowledge architecture</div>
                <p className="text-muted-foreground text-[15px] leading-[1.55] mt-3 max-w-[520px]">
                  Your password and keys never leave your device. Even if our entire database leaked, every byte would be useless ciphertext.
                </p>
                <div className="mt-6 flex gap-5 flex-wrap font-mono text-xs text-muted-foreground/70">
                  <span>→ password.deriveKey()</span>
                  <span>→ key.stays(local)</span>
                  <span>→ server.knows(nothing)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="a-card lg:col-span-2 lg:row-span-2 p-7 rounded-[20px] border border-border bg-white/[0.02] dark:bg-white/[0.03] flex flex-col">
            <Lock size={26} className="text-primary"/>
            <div className="mt-auto">
              <div className="text-[22px] font-medium tracking-[-0.02em]">XChaCha20-Poly1305</div>
              <p className="text-muted-foreground text-[13px] leading-[1.55] mt-2">
                Modern AEAD cipher. Authenticated. 192-bit nonces. Hardware-fast on every platform.
              </p>
            </div>
          </div>

          <div className="a-card lg:col-span-2 p-6 rounded-[20px] border border-border bg-white/[0.02] dark:bg-white/[0.03] flex items-center gap-4">
            <ShieldCheck size={26} className="text-primary shrink-0"/>
            <div>
              <div className="text-[17px] font-medium">100,000 PBKDF2 iterations</div>
              <div className="text-muted-foreground text-xs mt-0.5">Slows brute force to a crawl.</div>
            </div>
          </div>

          <div className="a-card lg:col-span-2 p-6 rounded-[20px] border border-border bg-white/[0.02] dark:bg-white/[0.03] flex items-center gap-4">
            <CloudUpload size={26} className="text-primary shrink-0"/>
            <div>
              <div className="text-[17px] font-medium">Per-file unique keys</div>
              <div className="text-muted-foreground text-xs mt-0.5">Compromise one, the rest stay safe.</div>
            </div>
          </div>

          <div className="a-card lg:col-span-2 p-6 rounded-[20px] border border-border bg-white/[0.02] dark:bg-white/[0.03] flex items-center gap-4">
            <Users size={26} className="text-primary shrink-0"/>
            <div>
              <div className="text-[17px] font-medium">Envelope sharing</div>
              <div className="text-muted-foreground text-xs mt-0.5">Recipients decrypt with their own key.</div>
            </div>
          </div>

          {/* Audit log */}
          <div className="a-card lg:col-span-6 rounded-[20px] border border-border bg-white/[0.02] dark:bg-white/[0.03] overflow-hidden flex flex-col lg:flex-row">
            <div className="p-5 px-7 lg:flex-[0_0_280px] border-b lg:border-b-0 lg:border-r border-border">
              <Cpu size={22} className="text-primary"/>
              <div className="text-[17px] font-medium mt-3">Tamper-evident log</div>
              <div className="text-muted-foreground text-xs mt-1">Every action signed. Hash-chained. Verifiable.</div>
            </div>
            <div className="flex-1 font-mono text-xs px-6 py-3.5 flex flex-col gap-1.5 justify-center overflow-hidden">
              {[
                { t: '17:42:08', e: 'file.upload', f: 'q4_report.pdf', h: '0x9af3…b21e' },
                { t: '17:41:51', e: 'key.rotate', f: '—', h: '0x4c11…77a0' },
                { t: '17:39:22', e: 'share.create', f: 'photos.zip → alex@…', h: '0xe802…3f4d' },
              ].map((r, i) => (
                <div key={i} className="grid grid-cols-[90px_130px_1fr_110px_16px] gap-4 items-center text-muted-foreground">
                  <span className="text-muted-foreground/70">{r.t}</span>
                  <span className="text-primary">{r.e}</span>
                  <span className="text-foreground truncate">{r.f}</span>
                  <span className="text-muted-foreground/70">{r.h}</span>
                  <Check size={14} className="text-emerald-500"/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ Comparison ============
export function CipherLabComparison() {
  const rows = [
    { feat: 'Reads your files', vault: false, cloud: true },
    { feat: 'Can reset your password', vault: false, cloud: true },
    { feat: 'Sees filenames & metadata', vault: false, cloud: true },
    { feat: 'End-to-end encrypted by default', vault: true, cloud: false },
    { feat: 'Per-file independent keys', vault: true, cloud: false },
    { feat: 'Open-source & auditable', vault: true, cloud: false },
    { feat: 'Useful if database leaks', vault: true, cloud: false },
  ];
  return (
    <section id="security" className="px-8 pb-32 pt-10">
      <div className="max-w-[1080px] mx-auto">
        <div className="mb-12">
          <div className="font-mono text-xs text-primary tracking-[0.18em] mb-4">§ 04 · COMPARISON</div>
          <h2 className="text-[56px] font-medium tracking-[-0.035em] leading-[1.05] m-0">
            What other clouds <span className="font-serif italic font-normal">actually</span> see.
          </h2>
        </div>
        <div className="rounded-[20px] border border-border overflow-hidden bg-white/[0.02] dark:bg-white/[0.03]">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] px-7 py-5 border-b border-border font-mono text-[11px] text-muted-foreground tracking-[0.12em]">
            <div>CAPABILITY</div>
            <div className="flex items-center gap-2 text-primary">
              <span className="w-2 h-2 rounded-sm bg-primary"/> SECUREVAULT
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm bg-border"/> TYPICAL CLOUD
            </div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className={cn('grid grid-cols-[1.4fr_1fr_1fr] items-center px-7 py-4 text-[15px]', i < rows.length - 1 && 'border-b border-border')}>
              <div>{r.feat}</div>
              <CompPill yes={r.vault} good/>
              <CompPill yes={r.cloud} good={false}/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function CompPill({ yes, good }: { yes: boolean; good: boolean }) {
  const ok = good === yes;
  return (
    <div>
      <span className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1 rounded-full font-mono text-[13px]',
        ok ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'
      )}>
        {yes ? <Check size={14}/> : <X size={14}/>} {yes ? 'yes' : 'no'}
      </span>
    </div>
  );
}

// ============ CTA ============
export function CipherLabCTA() {
  return (
    <section className="px-8 pb-32 pt-10">
      <div className="max-w-[1080px] mx-auto relative rounded-[28px] overflow-hidden border border-border p-14 px-14 bg-white/[0.02] dark:bg-white/[0.03]">
        <div className="absolute inset-0 blur-[40px]" style={{ background: 'radial-gradient(ellipse at 30% 20%, oklch(from var(--primary) l c h / 0.2), transparent 60%)' }}/>
        <div className="absolute inset-0 a-grid opacity-40"/>
        <div className="relative text-center max-w-[720px] mx-auto">
          <Fingerprint size={36} className="text-primary mx-auto"/>
          <h2 className="text-[56px] font-medium tracking-[-0.035em] leading-none mt-5 mb-4">
            Ready to take your files <span className="font-serif italic text-primary font-normal">back?</span>
          </h2>
          <p className="text-muted-foreground text-[17px] leading-[1.55] max-w-[520px] mx-auto mb-8">
            Create a vault in under sixty seconds. No credit card. No tracking. No way for us to peek inside.
          </p>
          <div className="inline-flex gap-3">
            <a href="/register" className="a-cta h-13 px-8 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold inline-flex items-center gap-2 shadow-[0_8px_28px_oklch(from_var(--primary)_l_c_h/0.4)]" style={{ height: 52 }}>
              Get started — free <ArrowRight size={16}/>
            </a>
            <a href="#" className="px-6 rounded-xl border border-border bg-white/[0.02] dark:bg-white/[0.03] text-foreground text-[15px] font-medium inline-flex items-center" style={{ height: 52 }}>
              Read the whitepaper
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============ Footer ============
export function CipherLabFooter() {
  return (
    <footer className="border-t border-border px-8 py-10">
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-center gap-3 font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-primary grid place-items-center">
            <ShieldCheck size={14} className="text-primary-foreground"/>
          </div>
          secure<span className="text-primary">vault</span>
        </div>
        <div>your data stays yours · always encrypted · always private</div>
        <div>© 2026 · v2.0.4-stable</div>
      </div>
    </footer>
  );
}
