'use client';

import * as React from 'react';

type CipherRainProps = {
  color?: string;
  dim?: string;
  density?: number;
  speed?: number;
};

export function CipherRain({
  color = 'oklch(0.488 0.243 264.376)',
  dim = 'rgba(255,255,255,0.05)',
  density = 0.06,
  speed = 0.5,
}: CipherRainProps) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let raf = 0;
    let cols = 0;
    let drops: number[] = [];
    let cw = 0;
    let ch = 0;
    const fontSize = 16;
    const chars = '0123456789ABCDEFabcdef!@#$%^*+=-_/\\';

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      cw = rect.width;
      ch = rect.height;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.floor(cw / fontSize));
      drops = Array(cols).fill(0).map(() => (Math.random() * ch) / fontSize);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function frame() {
      if (!ctx) return;
      ctx.fillStyle = 'rgba(6,7,10,0.06)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.font = `${fontSize}px 'JetBrains Mono', ui-monospace, monospace`;
      for (let i = 0; i < cols; i += 1) {
        if (Math.random() > density) continue;
        const ch1 = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillStyle = Math.random() > 0.985 ? color : dim;
        ctx.fillText(ch1, x, y);
        if (y > ch && Math.random() > 0.975) drops[i] = 0;
        drops[i] += speed;
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, dim, density, speed]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
