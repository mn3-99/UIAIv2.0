import { ThemeOption } from '../types';

/** Themes that render dark (share the dark utility-remapping layer). */
const DARK_THEMES = new Set(['dark', 'emerald-slate', 'obsidian-amber']);

/** Resolve 'system' to the OS-level preference; everything else passes through. */
export function resolveTheme(theme: ThemeOption): Exclude<ThemeOption, 'system'> {
  if (theme !== 'system') return theme;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function isDarkTheme(theme: ThemeOption): boolean {
  return DARK_THEMES.has(resolveTheme(theme));
}

/**
 * Apply a theme to <body data-theme> instantly. When 'system' is selected a
 * live media-query listener keeps the app in sync with OS appearance changes.
 */
let mediaListenerBound = false;
export function applyTheme(theme: ThemeOption): void {
  const resolved = resolveTheme(theme);
  document.body.setAttribute('data-theme', resolved);
  // Hint native form controls/scrollbars to match.
  document.documentElement.style.colorScheme = DARK_THEMES.has(resolved) ? 'dark' : 'light';

  if (!mediaListenerBound) {
    mediaListenerBound = true;
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        // Re-resolve only when the user actually follows the system.
        const current = document.body.getAttribute('data-theme-preference');
        if (current === 'system') applyTheme('system');
      });
    } catch { /* older engines */ }
  }
  document.body.setAttribute('data-theme-preference', theme);
}

/** Read the stored theme preference pre-paint (used by the index.html FOUC guard). */
export function getStoredThemePreference(): ThemeOption {
  try {
    const raw = localStorage.getItem('mijlai_v1_settings');
    if (!raw) return 'system';
    const parsed = JSON.parse(raw);
    const t = parsed?.theme;
    return (['system', 'emerald-slate', 'obsidian-amber', 'dark', 'light'] as const).includes(t) ? t : 'system';
  } catch {
    return 'system';
  }
}
