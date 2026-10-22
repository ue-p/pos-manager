// 表示モード（ライト／ダーク）。D-26
// 既定は端末の設定に合わせる（auto）。端末ごとに設定画面で固定でき（localStorage）、
// お客さん用画面などは URL の ?theme=light|dark|auto で指定できる（URL の指定は保存しない）
export const THEME_PREFS = ['auto', 'light', 'dark'] as const;
export type ThemePref = (typeof THEME_PREFS)[number];

export const THEME_LABELS: Record<ThemePref, string> = {
  auto: '自動（端末の設定に合わせる）',
  light: 'ライト',
  dark: 'ダーク',
};

const KEY = 'pos.theme';

function isPref(v: unknown): v is ThemePref {
  return typeof v === 'string' && (THEME_PREFS as readonly string[]).includes(v);
}

/** URL の指定を優先し、なければ端末に保存した設定、それもなければ auto */
export function resolveThemePref(fromUrl: string | null, stored: string | null): ThemePref {
  if (isPref(fromUrl)) return fromUrl;
  if (isPref(stored)) return stored;
  return 'auto';
}

export function getStoredThemePref(): ThemePref {
  try {
    return resolveThemePref(null, localStorage.getItem(KEY));
  } catch {
    return 'auto';
  }
}

export function applyTheme(pref: ThemePref): void {
  if (pref === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // 保存できない環境でも、この画面では切り替える
  }
  applyTheme(pref);
}

/** 起動時に1回呼ぶ */
export function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    stored = null;
  }
  applyTheme(resolveThemePref(new URLSearchParams(window.location.search).get('theme'), stored));
}
