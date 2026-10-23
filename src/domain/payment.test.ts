import { describe, expect, it } from 'vitest';
import { EMPTY_CART } from './cart';
import { addReceived, calcChange, confirmBlockers, exactReceived } from './payment';
import { cartOf } from './testutil';

describe('預かり金とお釣り', () => {
  it('金額ボタンは加算、「ちょうど」は合計に置き換え', () => {
    expect(addReceived(addReceived(0, 500), 1000)).toBe(1500);
    expect(exactReceived(700)).toBe(700);
  });

  it('お釣り', () => {
    expect(calcChange(700, 1000)).toBe(300);
    expect(calcChange(700, 700)).toBe(0);
  });
});

describe('確定可否', () => {
  const base = {
    cart: cartOf(['design_1']),
    total: 200,
    received: 500,
    groupType: 'adult' as const,
    groupSize: 1 as const,
    cashierSelected: true,
  };

  it('担当者が未選択なら確定できない（テストモード中も同じ）', () => {
    expect(confirmBlockers({ ...base, cashierSelected: false })).toEqual(['担当者を選んでください（画面上部の「担当」）']);
  });

  it('すべて揃えば確定できる', () => {
    expect(confirmBlockers(base)).toEqual([]);
  });

  it('預かり不足で確定できない', () => {
    expect(confirmBlockers({ ...base, total: 700, received: 500 })).toEqual(['預かり金が 200 円不足しています']);
    expect(confirmBlockers({ ...base, received: 0 })).toEqual(['預かり金を入れてください']);
  });

  it('客層・人数・商品が未選択なら理由を返す', () => {
    expect(confirmBlockers({ ...base, cart: EMPTY_CART, total: 0, groupType: null, groupSize: null })).toEqual([
      '商品を選んでください',
      '客層を選んでください',
      '人数を選んでください',
    ]);
  });
});
