'use client';

import * as React from 'react';
import { CipherRain } from './CipherRain';

type Mode = 'login' | 'register';

type TraceLine = { t: 'await' | '✓'; c: string; r: string };

const LINES: Record<Mode, TraceLine[]> = {
  login: [
    { t: 'await', c: 'load.salt()', r: 'ok · 16 bytes' },
    { t: 'await', c: 'kdf.derive(password, salt, 100_000)', r: 'ok · 32-byte key' },
    { t: 'await', c: 'server.fetch(vault_blob)', r: 'ok · 4.2 MB ciphertext' },
    { t: 'await', c: 'decrypt(vault_blob, master)', r: 'ok · 12,408 files' },
    { t: '✓', c: 'session.open()', r: 'unlocked locally' },
  ],
  register: [
    { t: 'await', c: 'crypto.randomBytes(16)', r: 'ok · salt generated' },
    { t: 'await', c: 'kdf.derive(password, salt, 100_000)', r: 'ok · master key' },
    { t: 'await', c: 'x25519.keypair()', r: 'ok · sharing keys' },
    { t: 'await', c: 'encrypt(metadata, master)', r: 'ok · sealed' },
    { t: 'await', c: 'server.send(salt, public_key, blob)', r: 'ok · 247ms' },
    { t: '✓', c: 'vault.created()', r: 'ready' },
  ],
};

const CHIPS = [
  'XChaCha20-Poly1305',
  'PBKDF2-SHA256',
  '100,000 iter',
  'X25519',
  'AEAD',
  'Argon2id ready',
];

export function CipherLabRightPanel({ mode }: { mode: Mode }) {
  const lines = LINES[mode];
  const title =
    mode === 'login' ? (
      <>
        Your keys are derived{' '}
        <span
          className="font-serif font-normal italic text-primary"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          here.
        </span>{' '}
        Not there.
      </>
    ) : (
      <>
        Every byte sealed before it{' '}
        <span
          className="font-serif font-normal italic text-primary"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          ever
        </span>{' '}
        leaves.
      </>
    );

  return (
    <div className="relative hidden overflow-hidden border-l border-border lg:block">
      <CipherRain
        color="oklch(0.488 0.243 264.376)"
        dim="rgba(255,255,255,0.05)"
        density={0.06}
        speed={0.5}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, oklch(from var(--background) l c h / 0.78), oklch(from var(--background) l c h / 0.62))',
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: '30%',
          left: '40%',
          width: 480,
          height: 480,
          filter: 'blur(40px)',
          background:
            'radial-gradient(circle, oklch(from var(--primary) l c h / 0.22), transparent 60%)',
        }}
      />
      <div
        className="a-scan-bar pointer-events-none absolute left-0 right-0 top-0 h-0.5"
        style={{ opacity: 0.5 }}
      />

      <div className="relative flex h-full flex-col gap-8 p-14">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
            § ENCRYPTION_ENGINE
          </div>
          <div className="mt-3 max-w-[420px] text-[32px] font-medium leading-[1.1] tracking-[-0.03em] text-foreground">
            {title}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CHIPS.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-foreground/[0.03] px-3 py-1.5 font-mono text-[11px] tracking-[0.04em] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>

        <RightTerminal mode={mode} lines={lines} />

        <div className="mt-auto flex justify-between border-t border-border pt-4 font-mono text-[11px] text-muted-foreground/70">
          <span>// open-source</span>
          <span>// no telemetry</span>
          <span>// client-side</span>
          <span>// audited</span>
        </div>
      </div>
    </div>
  );
}

function RightTerminal({ mode, lines }: { mode: Mode; lines: TraceLine[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-foreground/[0.04] to-transparent backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="flex gap-1.5">
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
            <span
              key={c}
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: c }}
            />
          ))}
        </div>
        <span className="font-mono text-[11px] tracking-[0.05em] text-muted-foreground/80">
          {mode === 'login' ? 'unlock.trace.ts' : 'create.trace.ts'}
        </span>
        <span className="font-mono text-[11px] text-emerald-500">● live</span>
      </div>
      <div className="grid gap-1 px-4 py-3.5 font-mono text-[12px] leading-[1.75]">
        {lines.map((l, i) => (
          <div
            key={l.c}
            className="a-rise grid items-center gap-3"
            style={{
              gridTemplateColumns: '50px 1fr auto',
              animationDelay: `${i * 0.08}s`,
            }}
          >
            <span
              className={l.t === '✓' ? 'font-semibold text-emerald-500' : 'font-semibold text-primary'}
            >
              {l.t}
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
              {l.c}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{l.r}</span>
          </div>
        ))}
        <div className="grid items-center gap-3" style={{ gridTemplateColumns: '50px 1fr' }}>
          <span className="text-muted-foreground/70">&gt;</span>
          <span className="a-blink inline-block h-3.5 w-2 bg-primary" />
        </div>
      </div>
    </div>
  );
}
