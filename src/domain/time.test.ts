import { describe, expect, it } from 'vitest';
import { localDateOf, localHourOf, toLocalIsoString } from './time';

describe('時刻フォーマット', () => {
  it('オフセット付きISO 8601で、元の時刻を表す（Z表記にしない）', () => {
    const d = new Date(2026, 10, 3, 14, 5, 22);
    const s = toLocalIsoString(d);
    expect(s).toMatch(/^2026-11-03T14:05:22[+-]\d{2}:\d{2}$/);
    expect(Date.parse(s)).toBe(d.getTime());
  });

  it('日付と時の取り出し', () => {
    expect(localDateOf('2026-11-03T09:05:22+09:00')).toBe('2026-11-03');
    expect(localHourOf('2026-11-03T09:05:22+09:00')).toBe(9);
  });
});
