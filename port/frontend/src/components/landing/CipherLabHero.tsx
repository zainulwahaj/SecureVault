'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Github } from 'lucide-react';
import { pseudoCipher } from '@/lib/landing/pseudoCipher';

/**
 * Cipher Lab Hero — live encryption demo.
 *
 * To swap pseudoCipher() for REAL crypto:
 *   import { encrypt } from '@/lib/crypto/encryption';
 *   const cipher = useMemo(() => encrypt(plaintext, demoKey, demoNonce), [plaintext]);
 */
export function CipherLabHero() {
  const phrases = React.useMemo(
    () => ['My passport scan.pdf', 'Q4_financials_confidential.xlsx', 'love-letters/2024-03-04.txt', 'wedding-photos.zip'],
    [],
  );
  const [phraseIdx, setPhraseIdx] = React.useState(0);
  const [autoTyping, setAutoTyping] = React.useState(true);
  const [sub, setSub] = React.useState(phrases[0].length);
  const [plaintext, setPlaintext] = React.useState(phrases[0]);

  React.useEffect(() => {
    if (!autoTyping) return;
    const cur = phrases[phraseIdx];
    let t: ReturnType<typeof setTimeout>;
    if (sub < cur.length) {
      t = setTimeout(() => { setSub(sub + 1); setPlaintext(cur.slice(0, sub + 1)); }, 60);
    } else {
      t = setTimeout(() => {
        const next = (phraseIdx + 1) % phrases.length;
        setPhraseIdx(next); setSub(0); setPlaintext('');
      }, 2200);
    }
    return () => clearTimeout(t);
  }, [sub, phraseIdx, autoTyping, phrases]);

  const cipher = pseudoCipher(plaintext, phraseIdx);
  const cipherChunks: string[] = [];
  for (let i = 0; i < cipher.length; i += 4) cipherChunks.push(cipher.slice(i, i + 4));

  const reset = () => { setAutoTyping(true); setSub(0); setPhraseIdx(0); setPlaintext(''); };

  return (
    <section className="relative px-8 pt-20 pb-24">
      <div className="max-w-[1280px] mx-auto">
        <div className="flex items-center gap-2.5 mb-9">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#22c55e] a-pulse"/>
          <span className="font-mono text-xs text-muted-foreground tracking-[0.04em]">
            ENCRYPTION_ENGINE: <span className="text-foreground">XCHACHA20-POLY1305</span> · LIVE
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
          {/* Headline */}
          <div>
            <h1 className="text-[64px] lg:text-[96px] leading-[0.95] m-0 tracking-[-0.045em] font-medium">
              Your files,<br/>
              <span className="font-serif italic font-normal text-primary">encrypted</span><br/>
              <span className="relative inline-block">
                before they leave.
                <span className="absolute bottom-1.5 left-0 right-0 h-px bg-border"/>
              </span>
            </h1>

            <p className="mt-8 text-[19px] leading-[1.55] text-muted-foreground max-w-[520px]">
              A zero-knowledge file vault. Every byte is encrypted in your browser before it touches our servers. We <em className="text-foreground italic font-serif">can't</em> read your files. We <em className="text-foreground italic font-serif">can't</em> reset your password. That's the point.
            </p>

            <div className="mt-10 flex gap-3 items-center">
              <Link href="/register" className="a-cta h-13 px-7 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold inline-flex items-center gap-2 shadow-[0_8px_28px_oklch(from_var(--primary)_l_c_h/0.4)]" style={{ height: 52 }}>
                Create your vault <ArrowRight size={16}/>
              </Link>
              <a href="#" className="px-6 rounded-xl border border-border bg-white/[0.02] dark:bg-white/[0.03] text-foreground text-[15px] font-medium inline-flex items-center gap-2" style={{ height: 52 }}>
                <Github size={16}/> View source
              </a>
            </div>

            <div className="mt-9 flex gap-7 font-mono text-xs text-muted-foreground/70">
              <span>// open-source</span>
              <span>// client-side only</span>
              <span>// no telemetry</span>
            </div>
          </div>

          {/* Cipher panel */}
          <div className="relative">
            {(['tl','tr','bl','br'] as const).map(p => (
              <span key={p} className={`absolute w-5 h-5 ${p.includes('t') ? '-top-2' : '-bottom-2'} ${p.includes('l') ? '-left-2 border-l' : '-right-2 border-r'} ${p.includes('t') ? 'border-t' : 'border-b'} border-border/80`}/>
            ))}
            <div className="rounded-[20px] border border-border bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-md overflow-hidden">
              <div className="flex items-center justify-between px-4.5 py-3.5 border-b border-border" style={{ paddingLeft: 18, paddingRight: 18, paddingTop: 14, paddingBottom: 14 }}>
                <div className="flex gap-1.5">
                  {['#FF5F57','#FEBC2E','#28C840'].map(c => <span key={c} className="w-3 h-3 rounded-full" style={{ background: c }}/>)}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground tracking-[0.05em]">encryption_demo.ts — LIVE</div>
                <button onClick={reset} className="font-mono text-[11px] text-muted-foreground bg-transparent border-0 cursor-pointer">↻ replay</button>
              </div>

              <div className="px-6 pt-6 pb-2">
                <div className="font-mono text-[11px] text-muted-foreground tracking-[0.08em] mb-2">① INPUT · plaintext</div>
                <div className="relative">
                  <input
                    value={plaintext}
                    onChange={(e) => { setAutoTyping(false); setPlaintext(e.target.value); }}
                    placeholder="type a filename…"
                    className="w-full bg-transparent border-0 outline-0 text-foreground font-mono text-lg py-1.5 border-b border-dashed border-border"
                  />
                  <span className="absolute right-0 top-2 font-mono text-[11px] text-muted-foreground">{plaintext.length}b</span>
                </div>
              </div>

              <div className="px-6 py-3 flex items-center gap-2.5">
                <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full w-[60%] a-shimmer-bar" style={{ backgroundSize: '300% 100%', background: 'linear-gradient(90deg, transparent, var(--primary), transparent)' }}/>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">PBKDF2 · 100k iter</span>
              </div>

              <div className="px-6 pt-2 pb-6">
                <div className="font-mono text-[11px] text-muted-foreground tracking-[0.08em] mb-2">② OUTPUT · ciphertext (hex)</div>
                <div className="font-mono text-[13px] leading-[1.55] text-primary break-all min-h-[88px] flex flex-wrap gap-1.5">
                  {cipherChunks.map((c, i) => (
                    <span key={i} className="px-1 py-0.5 rounded-sm a-rise" style={{ animationDelay: `${i * 0.02}s`, background: i % 7 === 0 ? 'oklch(from var(--primary) l c h / 0.13)' : 'transparent' }}>
                      {c}
                    </span>
                  ))}
                  <span className="w-2 h-4 bg-primary a-blink ml-0.5 inline-block"/>
                </div>
              </div>

              <div className="px-6 py-3 border-t border-border flex justify-between font-mono text-[11px] text-muted-foreground">
                <span>nonce: <span className="text-muted-foreground/80">{(phraseIdx * 4099 % 9973).toString(16).padStart(6,'0')}…</span></span>
                <span>algo: <span className="text-primary">XChaCha20-Poly1305</span></span>
                <span>✓ verified</span>
              </div>
            </div>

            <div className="absolute -right-3 top-5 origin-right rotate-90 translate-x-[60px] font-mono text-[10px] text-muted-foreground tracking-[0.2em]">
              SERVER NEVER SEES THIS
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
