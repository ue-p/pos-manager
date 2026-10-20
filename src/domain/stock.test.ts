import { describe, expect, it } from 'vitest';
import { EMPTY_CART } from './cart';
import { canAddItem, isLowStock, remainingStock } from './stock';
import { cartOf, tx } from './testutil';
import type { Stock } from './types';

const initial: Stock = { design_1: 100, design_2: 100, design_3: 100 };

describe('在庫計算', () => {
  it('セットは3絵柄を各1枚減らす。取消とテストは除外する', () => {
    const txs = [
      tx(['set', 'design_1']),
      tx(['design_2'], { is_void: true }),
      tx(['design_3', 'design_3'], { is_test: true }),
    ];
    expect(remainingStock(initial, txs)).toEqual({ design_1: 98, design_2: 99, design_3: 99 });
  });

  it('在庫ちょうど0でボタン無効', () => {
    const remaining: Stock = { design_1: 0, design_2: 5, design_3: 5 };
    expect(canAddItem('design_1', EMPTY_CART, remaining)).toBe(false);
    expect(canAddItem('set', EMPTY_CART, remaining)).toBe(false);
    expect(canAddItem('design_2', EMPTY_CART, remaining)).toBe(true);
  });

  it('カートに入っている分も差し引いて判定する', () => {
    const remaining: Stock = { design_1: 2, design_2: 9, design_3: 9 };
    expect(canAddItem('design_1', cartOf(['set']), remaining)).toBe(true);
    expect(canAddItem('design_1', cartOf(['set', 'design_1']), remaining)).toBe(false);
    expect(canAddItem('set', cartOf(['set', 'set']), remaining)).toBe(false);
  });

  it('残りわずかの判定は閾値以下', () => {
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(11, 10)).toBe(false);
  });
});
