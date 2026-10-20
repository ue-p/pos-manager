import { describe, expect, it } from 'vitest';
import { formatAgo } from './format';

describe('経過時間の表記', () => {
  it('1分未満は「1分以内」（「前」を付けない）、それ以外は「◯分前」「◯時間◯分前」', () => {
    expect(formatAgo(0)).toBe('1分以内');
    expect(formatAgo(1)).toBe('1分前');
    expect(formatAgo(29)).toBe('29分前');
    expect(formatAgo(59)).toBe('59分前');
    expect(formatAgo(60)).toBe('1時間0分前');
    expect(formatAgo(125)).toBe('2時間5分前');
  });

  it('状態バーの文と自然につながる', () => {
    expect(`CSV保存 ${formatAgo(0)}`).toBe('CSV保存 1分以内');
    expect(`CSV保存 ${formatAgo(25)}`).toBe('CSV保存 25分前');
    expect(`CSV保存 ${formatAgo(95)}`).toBe('CSV保存 1時間35分前');
  });
});
