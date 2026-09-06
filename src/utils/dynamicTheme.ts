/**
 * Dynamic accent theme — لون تمييز قابل للتخصيص
 * ===============================================
 * حقن متغيرات --accent-* على :root ليعاد تلوين كل مكوّن يستخدم التوكنات
 * فوراً (بلا إعادة تحميل). المستخدم يختار لوناً أساسياً من Settings، ونشتق
 * منه بقية الدرجات (hover/soft/glow/tgrad) بما يناسب الثيم الفاتح أو الداكن.
 */

const DARK_THEMES = new Set(['dark', 'emerald-slate', 'obsidian-amber']);

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [37, 99, 235]; // default blue
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix hex with another color: mix(target, other, amountOfOther 0..1) → hex */
function mix(hex: string, other: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  const p = Math.max(0, Math.min(1, amount));
  const out = a.map((v, i) => clamp(v + (b[i] - v) * p));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Is the current body data-theme a dark one? */
function isDark(): boolean {
  try {
    return DARK_THEMES.has(document.body.getAttribute('data-theme') || 'light');
  } catch {
    return false;
  }
}

export interface AccentShades {
  base: string;
  hover: string;
  soft: string;
  gradA: string;
  gradB: string;
  glow: string;
}

/** Derive the full accent shade set from one base color for the current theme. */
export function deriveAccentShades(baseHex: string): AccentShades {
  const dark = isDark();
  const base = baseHex.replace('#', '').length === 3
    ? '#' + baseHex.slice(1).split('').map((c) => c + c).join('')
    : baseHex;
  const hover = dark ? mix(base, '#ffffff', 0.22) : mix(base, '#000000', 0.14);
  const gradA = dark ? mix(base, '#ffffff', 0.1) : base;
  const gradB = dark ? mix(base, '#ffffff', 0.32) : mix(base, '#ffffff', 0.2);
  const soft = rgba(base, dark ? 0.16 : 0.12);
  const glow = rgba(base, dark ? 0.32 : 0.2);
  return { base, hover, soft, gradA, gradB, glow };
}

const PROPS: Array<[string, keyof AccentShades]> = [
  ['--accent-color', 'base'],
  ['--accent-hover', 'hover'],
  ['--accent-soft', 'soft'],
  ['--accent-grad-a', 'gradA'],
  ['--accent-grad-b', 'gradB'],
  ['--accent-glow', 'glow'],
];

/**
 * Apply (or clear) a custom accent color onto the root element. Passing null
 * removes the overrides so the active theme's own tokens win again.
 */
export function applyAccent(accent: string | null | undefined): void {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (!root) return;
  if (!accent) {
    PROPS.forEach(([prop]) => root.style.removeProperty(prop));
    root.style.removeProperty('--accent-color-rgb');
    return;
  }
  const shades = deriveAccentShades(accent);
  PROPS.forEach(([prop, key]) => root.style.setProperty(prop, shades[key]));
  const [r, g, b] = hexToRgb(shades.base);
  root.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);
}

/** Validate a hex color string, normalizing 3/6-digit forms. */
export function normalizeHex(value: string): string | null {
  let v = (value || '').trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return null;
}

/** Suggested preset accents (covers light + dark). */
export const ACCENT_PRESETS: Array<{ name: string; color: string }> = [
  { name: 'أزرق', color: '#2563eb' },
  { name: 'سماوي', color: '#0891b2' },
  { name: 'أخضر', color: '#059669' },
  { name: 'بنفسجي', color: '#7c3aed' },
  { name: 'وردي', color: '#db2777' },
  { name: 'برتقالي', color: '#ea580c' },
  { name: 'أحمر', color: '#dc2626' },
  { name: 'ذهبي', color: '#d97706' },
];
