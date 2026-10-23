import { describe, expect, it } from 'vitest';
import { jstDateOf, localDateOf, localHourOf, toJstDatetime, toLocalIsoString } from './time';

describe('時刻フォーマット', () => {
  it('オフセット付きISO 8601で、元の時刻を表す（Z表記にしない）', () => {
    const d = new Date(2026, 10, 3, 14, 5, 22);
    const s = toLocalIsoString(d);
    expect(s).toMatch(/^2026-11-03T14:05:22[+-]\d{2}:\d{2}$/);
    expect(Date.parse(s)).toBe(d.getTime());
  });

  it('local_datetime：timestamp を日本時間の「YYYY-MM-DD HH:mm:ss」にする（端末のタイムゾーンに左右されない）', () => {
    expect(toJstDatetime('2026-11-03T14:05:22+09:00')).toBe('2026-11-03 14:05:22');
    // 端末がUTCや他のタイムゾーンでも、日本時間に直す
    expect(toJstDatetime('2026-11-03T05:05:22+00:00')).toBe('2026-11-03 14:05:22');
    expect(toJstDatetime('2026-11-03T20:00:00-05:00')).toBe('2026-11-04 10:00:00');
    expect(toJstDatetime('2026-12-31T15:00:00Z')).toBe('2027-01-01 00:00:00');
    // 端末ローカル時刻で作った timestamp からも同じ時刻になる
    const d = new Date(Date.UTC(2026, 10, 3, 12, 28, 0));
    expect(toJstDatetime(toLocalIsoString(d))).toBe('2026-11-03 21:28:00');
  });

  it('local_datetime：日時として読めない値はエラー（空欄やNaNを出さない）', () => {
    expect(() => toJstDatetime('unknown')).toThrow();
  });

  it('日本時間の日付（担当者の選択を日付で切り替えるため。端末のタイムゾーンに左右されない）', () => {
    expect(jstDateOf(Date.UTC(2026, 10, 3, 14, 59, 59))).toBe('2026-11-03'); // 23:59:59 JST
    expect(jstDateOf(Date.UTC(2026, 10, 3, 15, 0, 0))).toBe('2026-11-04'); // 翌 0:00 JST
  });

  it('日付と時の取り出し', () => {
    expect(localDateOf('2026-11-03T09:05:22+09:00')).toBe('2026-11-03');
    expect(localHourOf('2026-11-03T09:05:22+09:00')).toBe(9);
  });
});
