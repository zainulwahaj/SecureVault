export type PasswordChecks = {
  length8: boolean;
  length12: boolean;
  upperLower: boolean;
  number: boolean;
  symbol: boolean;
};

export type PasswordEvaluation = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  entropyBits: number;
  ttcLabel: string;
  checks: PasswordChecks;
};

const EMPTY_CHECKS: PasswordChecks = {
  length8: false,
  length12: false,
  upperLower: false,
  number: false,
  symbol: false,
};

const LABELS = ['Too weak', 'Weak', 'Fair', 'Strong', 'Excellent'] as const;
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'] as const;

function humanizeTime(sec: number): string {
  if (sec < 1e-3) return 'instant';
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  if (sec < 31557600) return `${Math.round(sec / 86400)}d`;
  if (sec < 31557600 * 1000) return `${Math.round(sec / 31557600)} yr`;
  if (sec < 31557600 * 1e6) return `${(sec / 31557600 / 1000).toFixed(1)}k yr`;
  if (sec < 31557600 * 1e9) return `${(sec / 31557600 / 1e6).toFixed(1)}M yr`;
  if (sec < 31557600 * 1e12) return `${(sec / 31557600 / 1e9).toFixed(1)}B yr`;
  return 'heat death of the universe';
}

export function evaluatePassword(pw: string): PasswordEvaluation {
  if (!pw) {
    return {
      score: 0,
      label: '—',
      color: '#71717a',
      entropyBits: 0,
      ttcLabel: '—',
      checks: { ...EMPTY_CHECKS },
    };
  }

  const checks: PasswordChecks = {
    length8: pw.length >= 8,
    length12: pw.length >= 12,
    upperLower: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^a-zA-Z0-9]/.test(pw),
  };

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  if (!pool) pool = 26;

  const entropyBits = Math.round(pw.length * Math.log2(pool) * 10) / 10;
  const seconds = Math.pow(2, entropyBits) / 1e10;
  const ttcLabel = humanizeTime(seconds);

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (entropyBits >= 28) score = 1;
  if (entropyBits >= 40) score = 2;
  if (entropyBits >= 60) score = 3;
  if (entropyBits >= 80) score = 4;

  return {
    score,
    label: LABELS[score],
    color: COLORS[score],
    entropyBits,
    ttcLabel,
    checks,
  };
}

export function visualHash(text: string, len = 48): string {
  if (!text) return '0'.repeat(len);
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    let h = (i * 2654435761) >>> 0;
    for (let j = 0; j < text.length; j += 1) {
      h = ((h ^ text.charCodeAt(j)) * 16777619) >>> 0;
      h = (h ^ (h >>> 13)) >>> 0;
    }
    h = ((h * (i + 17)) >>> 0) ^ (text.length * 31);
    out += chars[h & 0xf];
  }
  return out;
}
