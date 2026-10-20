import { DESIGNS, ITEMS, type DesignCode, type DesignQty, type ItemCode, type Prices, type SaleLine, type Stock } from './types';

/** カート：商品ごとの個数 */
export type Cart = Record<ItemCode, number>;

export const EMPTY_CART: Cart = { design_1: 0, design_2: 0, design_3: 0, set: 0 };

export function addItem(cart: Cart, item: ItemCode): Cart {
  return { ...cart, [item]: cart[item] + 1 };
}

export function decrementItem(cart: Cart, item: ItemCode): Cart {
  return { ...cart, [item]: Math.max(0, cart[item] - 1) };
}

export function removeItem(cart: Cart, item: ItemCode): Cart {
  return { ...cart, [item]: 0 };
}

export function isCartEmpty(cart: Cart): boolean {
  return ITEMS.every((i) => cart[i] === 0);
}

/** 商品1個あたりに出ていく絵柄別の枚数。セットは案1〜3を各1枚 */
export function designsPerUnit(item: ItemCode): Stock {
  if (item === 'set') return { design_1: 1, design_2: 1, design_3: 1 };
  return { design_1: 0, design_2: 0, design_3: 0, [item]: 1 } as Stock;
}

export function designQtyFor(item: ItemCode, quantity: number): DesignQty {
  const per = designsPerUnit(item);
  return {
    design_1_qty: per.design_1 * quantity,
    design_2_qty: per.design_2 * quantity,
    design_3_qty: per.design_3 * quantity,
  };
}

/** カートが消費する絵柄別の枚数 */
export function cartDesignUsage(cart: Cart): Stock {
  const usage: Stock = { design_1: 0, design_2: 0, design_3: 0 };
  for (const item of ITEMS) {
    const per = designsPerUnit(item);
    for (const d of DESIGNS) usage[d] += per[d] * cart[item];
  }
  return usage;
}

/** 明細を作る。単価はこの時点の価格を焼き込む（F-11） */
export function buildLines(cart: Cart, prices: Prices): SaleLine[] {
  const lines: SaleLine[] = [];
  for (const item of ITEMS) {
    const quantity = cart[item];
    if (quantity <= 0) continue;
    const unit_price = prices[item];
    lines.push({
      line_no: lines.length + 1,
      item,
      quantity,
      unit_price,
      amount: unit_price * quantity,
      ...designQtyFor(item, quantity),
    });
  }
  return lines;
}

export function cartTotal(cart: Cart, prices: Prices): number {
  return ITEMS.reduce((sum, item) => sum + prices[item] * cart[item], 0);
}

export function sumDesignQty(lines: DesignQty[]): DesignQty {
  return lines.reduce<DesignQty>(
    (acc, l) => ({
      design_1_qty: acc.design_1_qty + l.design_1_qty,
      design_2_qty: acc.design_2_qty + l.design_2_qty,
      design_3_qty: acc.design_3_qty + l.design_3_qty,
    }),
    { design_1_qty: 0, design_2_qty: 0, design_3_qty: 0 },
  );
}

export function designQtyKey(d: DesignCode): `${DesignCode}_qty` {
  return `${d}_qty`;
}
