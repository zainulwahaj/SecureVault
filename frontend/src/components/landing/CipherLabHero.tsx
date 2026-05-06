'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { pseudoCipher } from '@/lib/landing/pseudoCipher';

export function CipherLabHero() {
  const phrases = React.useMemo(
    () => [
      'My passport scan.pdf',
      'Q4_financials_confidential.xlsx',
      'love-letters/2024-03-04.txt',
      'wedding-photos.zip',
    ],
    [],
  );
  const [phraseIdx, setPhraseIdx] = React.useState(0);
  const [autoTyping, setAutoTyping] = React.useState(true);
  const [sub, setSub] = React.useState(phrases[0].length);
  const [plaintext, setPlaintext] = React.useState(phrases[0]);

  React.useEffect(() => {
    if (!autoTyping) return undefined;

    const cur = phrases[phraseIdx];
    let timeout: ReturnType<typeof setTimeout>;

    if (sub < cur.length) {
      timeout = setTimeout(() => {
        setSub(sub + 1);
        setPlaintext(cur.slice(0, sub + 1));
      }, 60);
    } else {
      timeout = setTimeout(() => {
        const next = (phraseIdx + 1) % phrases.length;
        setPhraseIdx(next);
        setSub(0);
        setPlaintext('');
      }, 2200);
    }

    return () => clearTimeout(timeout);
  }, [autoTyping, phraseIdx, phrases, sub]);

  const cipher = pseudoCipher(plaintext, phraseIdx);
  const cipherChunks: string[] = [];
  for (let i = 0; i < cipher.length; i += 4) {
    cipherChunks.push(cipher.slice(i, i + 4));
  }

  const reset = () => {
    setAutoTyping(true);
    setSub(0);
    setPhraseIdx(0);
    setPlaintext('');
  };

  return (
    <section className="relative px-4 pt-16 pb-20 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-9 flex flex-wrap items-center gap-2.5">
          <span className="a-pulse size-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#22c55e]" />
          <span className="font-mono text-xs text-muted-foreground">
            ENCRYPTION_ENGINE:{' '}
            <span className="text-foreground">XCHACHA20-POLY1305</span> / LIVE
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <h1 className="m-0 text-5xl font-medium leading-none sm:text-[64px] lg:text-[96px]">
              Your files,
              <br />
              <span className="font-serif italic text-primary">encrypted</span>
              <br />
              <span className="relative inline-block">
                before they leave.
                <span className="absolute bottom-1.5 left-0 right-0 h-px bg-border" />
              </span>
            </h1>

            <p className="mt-8 max-w-[540px] text-base leading-[1.65] text-muted-foreground sm:text-[19px]">
              A zero-knowledge file vault. Every byte is encrypted in your
              browser before it touches our servers. We <em className="font-serif italic text-foreground">can't</em>{' '}
              read your files. We <em className="font-serif italic text-foreground">can't</em>{' '}
              reset your password. That's the point.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                className="a-cta inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-primary px-7 text-[15px] font-semibold text-primary-foreground"
                href="/register"
                style={{
                  boxShadow: '0 8px 28px oklch(from var(--primary) l c h / 0.36)',
                }}
              >
                Create your vault
                <ArrowRight size={16} />
              </Link>
              <a
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-md border border-border bg-background/70 px-6 text-[15px] font-medium text-foreground transition-colors hover:bg-muted"
                href="#security"
              >
                <ShieldCheck size={16} />
                Explore security
              </a>
            </div>

            <div className="mt-9 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground/70 sm:gap-7">
              <span>// open-source</span>
              <span>// client-side only</span>
              <span>// no telemetry</span>
            </div>
          </div>

          <div className="relative">
            {(['tl', 'tr', 'bl', 'br'] as const).map((position) => (
              <span
                key={position}
                className={`absolute size-5 border-border/80 ${
                  position.includes('t') ? '-top-2 border-t' : '-bottom-2 border-b'
                } ${position.includes('l') ? '-left-2 border-l' : '-right-2 border-r'}`}
              />
            ))}
            <div className="overflow-hidden rounded-md border border-border bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur-md">
              <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
                <div className="flex gap-1.5">
                  {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => (
                    <span key={color} className="size-3 rounded-full" style={{ background: color }} />
                  ))}
                </div>
                <div className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                  encryption_demo.ts / LIVE
                </div>
                <button
                  className="cursor-pointer border-0 bg-transparent font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={reset}
                  type="button"
                >
                  replay
                </button>
              </div>

              <div className="px-5 pt-6 pb-2 sm:px-6">
                <div className="mb-2 font-mono text-[11px] text-muted-foreground">
                  01 INPUT / plaintext
                </div>
                <div className="relative">
                  <input
                    className="w-full border-0 border-b border-dashed border-border bg-transparent py-1.5 pr-12 font-mono text-base text-foreground outline-0 sm:text-lg"
                    onChange={(event) => {
                      setAutoTyping(false);
                      setPlaintext(event.target.value);
                    }}
                    placeholder="type a filename..."
                    value={plaintext}
                  />
                  <span className="absolute right-0 top-2 font-mono text-[11px] text-muted-foreground">
                    {plaintext.length}b
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 px-5 py-3 sm:px-6">
                <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="a-shimmer-bar h-full w-[60%]"
                    style={{
                      background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                      backgroundSize: '300% 100%',
                    }}
                  />
                </div>
                <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                  PBKDF2 / 100k iter
                </span>
              </div>

              <div className="px-5 pt-2 pb-6 sm:px-6">
                <div className="mb-2 font-mono text-[11px] text-muted-foreground">
                  02 OUTPUT / ciphertext (hex)
                </div>
                <div className="flex min-h-[88px] flex-wrap gap-1.5 break-all font-mono text-[13px] leading-[1.55] text-primary">
                  {cipherChunks.map((chunk, index) => (
                    <span
                      key={`${chunk}-${index}`}
                      className="a-rise rounded-sm px-1 py-0.5"
                      style={{
                        animationDelay: `${index * 0.02}s`,
                        background:
                          index % 7 === 0 ? 'oklch(from var(--primary) l c h / 0.13)' : 'transparent',
                      }}
                    >
                      {chunk}
                    </span>
                  ))}
                  <span className="a-blink ml-0.5 inline-block h-4 w-2 bg-primary" />
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-border px-5 py-3 font-mono text-[11px] text-muted-foreground sm:px-6">
                <span>
                  nonce:{' '}
                  <span className="text-muted-foreground/80">
                    {(phraseIdx * 4099 % 9973).toString(16).padStart(6, '0')}...
                  </span>
                </span>
                <span>
                  algo: <span className="text-primary">XChaCha20-Poly1305</span>
                </span>
                <span>verified</span>
              </div>
            </div>

            <div className="absolute -right-3 top-5 hidden origin-right rotate-90 translate-x-[60px] font-mono text-[10px] text-muted-foreground lg:block">
              SERVER NEVER SEES THIS
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
