import { describe, expect, it } from 'vitest';
import { EMPTY_CART } from './cart';
import { availableSets, displayLowStock, parseSetLimit, remainingSets, SET_LIMIT_MAX, soldSets } from './setLimit';
import { canAddItem } from './stock';
import { cartOf, tx } from './testutil';
import { DEFAULT_SETTINGS, type Stock } from './types';

const plenty: Stock = { design_1: 100, design_2: 100, design_3: 100 };

describe('セットの販売上限（D-30）', () => {
  it('初期値は100（実質、制限なし）。範囲は0〜100', () => {
    expect(DEFAULT_SETTINGS.set_limit).toBe(100);
    expect(SET_LIMIT_MAX).toBe(100);
  });

  it('販売済みのセット数は明細のセットの個数の合計。取消・テストは数えない（在庫と同じ）', () => {
    const txs = [
      tx(['set', 'set', 'design_1']),
      tx(['set']),
      tx(['set'], { is_void: true }),
      tx(['set', 'set'], { is_test: true }),
      tx(['design_2']),
    ];
    expect(soldSets(txs)).toBe(3);
    expect(remainingSets(10, txs)).toBe(7);
  });

  it('販売済みより低い上限にしても、残りは0（マイナスにしない）', () => {
    const txs = [tx(['set', 'set', 'set'])];
    expect(remainingSets(3, txs)).toBe(0);
    expect(remainingSets(1, txs)).toBe(0);
    expect(remainingSets(0, [])).toBe(0);
  });

  it('上限の入力は0〜100の整数だけ', () => {
    expect(parseSetLimit('0')).toBe(0);
    expect(parseSetLimit('100')).toBe(100);
    expect(parseSetLimit(' 35 ')).toBe(35);
    for (const bad of ['', '101', '-1', '1.5', 'abc', '１０']) expect(parseSetLimit(bad)).toBeNull();
  });

  it('売れるセット数は、残りセット数と3絵柄の在庫の少ない方', () => {
    expect(availableSets(plenty, 5)).toBe(5);
    expect(availableSets({ design_1: 2, design_2: 9, design_3: 9 }, 5)).toBe(2);
    expect(availableSets({ design_1: -1, design_2: 9, design_3: 9 }, 5)).toBe(0);
  });
});

describe('カートに入れられるか（上限つき）', () => {
  it('残りセット数が0ならセットは押せない。単品は上限に関係ない', () => {
    expect(canAddItem('set', EMPTY_CART, plenty, 0)).toBe(false);
    expect(canAddItem('design_1', EMPTY_CART, plenty, 0)).toBe(true);
  });

  it('カートのセットの個数は残りセット数を超えられない', () => {
    expect(canAddItem('set', cartOf(['set']), plenty, 2)).toBe(true);
    expect(canAddItem('set', cartOf(['set', 'set']), plenty, 2)).toBe(false);
  });

  it('どれかの絵柄の在庫が足りなければ、上限に余りがあってもセットは売れない', () => {
    expect(canAddItem('set', EMPTY_CART, { design_1: 0, design_2: 9, design_3: 9 }, 100)).toBe(false);
  });
});

describe('お客さん用画面の「残りわずか」（D-30）', () => {
  it('基準より多い商品は出さない。基準以下で1以上の商品だけ、残り数を出す', () => {
    const remaining: Stock = { design_1: 11, design_2: 10, design_3: 1 };
    expect(displayLowStock(remaining, 10, 10)).toEqual({ design_2: 10, design_3: 1, set: 10 });
    expect(displayLowStock(plenty, 11, 10)).toEqual({});
  });

  it('セットは「売れるセット数」（上限の残りと在庫の少ない方）で判定する', () => {
    expect(displayLowStock(plenty, availableSets(plenty, 3), 10)).toEqual({ set: 3 });
  });

  it('0（売り切れ）・マイナスは出さない（「売り切れ」と表示するため）', () => {
    expect(displayLowStock({ design_1: 0, design_2: -2, design_3: 50 }, 0, 10)).toEqual({});
  });
});

