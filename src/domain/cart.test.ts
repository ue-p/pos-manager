import { describe, expect, it } from 'vitest';
import { addItem, buildLines, cartTotal, decrementItem, EMPTY_CART, isCartEmpty, removeItem } from './cart';
import { cartOf } from './testutil';
import { DEFAULT_SETTINGS } from './types';

const prices = DEFAULT_SETTINGS.prices;

describe('カート操作', () => {
  it('押した回数が個数になり、−で減らせる（0未満にならない）', () => {
    let c = addItem(addItem(EMPTY_CART, 'design_1'), 'design_1');
    expect(c.design_1).toBe(2);
    c = decrementItem(c, 'design_1');
    expect(c.design_1).toBe(1);
    c = decrementItem(decrementItem(c, 'design_1'), 'design_1');
    expect(c.design_1).toBe(0);
    expect(isCartEmpty(c)).toBe(true);
  });

  it('削除で個数が0になる', () => {
    expect(removeItem(cartOf(['set', 'set']), 'set').set).toBe(0);
  });
});

describe('明細生成', () => {
  it('商品ごとに1行、line_no は1から連番、単価を焼き込む', () => {
    const lines = buildLines(cartOf(['design_3', 'design_1', 'design_1']), prices);
    expect(lines).toEqual([
      { line_no: 1, item: 'design_1', quantity: 2, unit_price: 200, amount: 400, design_1_qty: 2, design_2_qty: 0, design_3_qty: 0 },
      { line_no: 2, item: 'design_3', quantity: 1, unit_price: 200, amount: 200, design_1_qty: 0, design_2_qty: 0, design_3_qty: 1 },
    ]);
  });

  it('セットは個数分、案1〜3を各1枚に展開する', () => {
    const [line] = buildLines(cartOf(['set', 'set']), prices);
    expect(line).toMatchObject({ item: 'set', quantity: 2, amount: 1000, design_1_qty: 2, design_2_qty: 2, design_3_qty: 2 });
  });

  it('合計金額', () => {
    expect(cartTotal(cartOf(['design_1', 'design_2', 'set']), prices)).toBe(900);
  });
});
