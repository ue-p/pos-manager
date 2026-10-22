import { describe, expect, it } from 'vitest';
import { resolveThemePref } from './theme';

describe('表示モードの決め方', () => {
  it('URL の指定 → 端末に保存した設定 → 自動 の順に使う', () => {
    expect(resolveThemePref('dark', 'light')).toBe('dark');
    expect(resolveThemePref(null, 'light')).toBe('light');
    expect(resolveThemePref(null, null)).toBe('auto');
  });

  it('知らない値は無視する', () => {
    expect(resolveThemePref('blue', 'dark')).toBe('dark');
    expect(resolveThemePref(null, 'sepia')).toBe('auto');
  });
});
