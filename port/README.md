# SecureVault — Cipher Lab Landing Port

This folder mirrors your `frontend/src/` layout. Copy these files **into the matching paths** in your codebase.

## What's included
- `app/page.tsx` — new landing page (replaces existing)
- `app/globals.css` — additions for keyframes + grid utility (merge into existing)
- `app/layout.tsx` — adds Geist + Instrument Serif + JetBrains Mono fonts
- `components/landing/` — all landing-page components
- `lib/landing/pseudoCipher.ts` — visual cipher helper for the live demo

## Install steps

### 1. No new dependencies needed
You already have `framer-motion`, `lucide-react`, `tailwindcss`, `next`. ✓

### 2. Copy files into your repo
```
port/frontend/src/  →  frontend/src/
```
Drop in everything. The paths match exactly.

### 3. Merge `globals.css`
Append the section marked `/* === Cipher Lab additions === */` from this port's `globals.css` into your existing `globals.css` (don't replace — your tokens stay).

### 4. Update `tailwind.config.js`
Add the font family extensions shown at the bottom of this README.

### 5. Make sure your dark mode default class is set
Your `ThemeScript` already handles this. Cipher Lab uses your existing `--primary`, `--background`, `--card`, `--border`, etc. — it inherits your tokens.

### 6. (Optional) Wire the live demo to **real** crypto
Open `components/landing/CipherLabHero.tsx`. The `pseudoCipher()` call near `cipher = pseudoCipher(plaintext, ...)` is a visual stand-in. Replace it with a call to your real `lib/crypto/encryption.ts` `encrypt()` for an authentic demo. (Snippet in that file's comment.)

## Tailwind config — add to `tailwind.config.js`
```js
theme: {
  extend: {
    fontFamily: {
      sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      serif: ['var(--font-serif)', 'serif'],
      mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
    },
    // ... your existing colors / radii / etc
  }
}
```

## Notes on fidelity
- The exploration uses an electric blue accent `#3D7BFF`. Your existing `--primary` is `oklch(0.488 0.243 264.376)` which is essentially the same blue — the design uses your token automatically.
- Light mode is **fully styled** with frosted glass, accent glows tuned for white surfaces, and the same kinetic typography.
- All animations use only CSS keyframes + a tiny bit of React state (typing loop). No heavy libs.
- The live encryption demo cycles through filenames; click the input to type your own.

## Layout & navigation
- Header keeps your `Logo` and `ThemeToggle` components.
- Sign in / Get Started buttons use Next.js `Link` to `/login` and `/register` (matching your existing routes).
- Sticky nav with backdrop blur, mobile sheet supported (uses your existing `Sheet` component).
