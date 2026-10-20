import { addItem, cartDesignUsage, type Cart } from './cart';
import { DESIGNS, isCounted, type ItemCode, type Stock, type Transaction } from './types';

/** 絵柄別の販売枚数（取消・テストを除外） */
export function soldByDesign(txs: Transaction[]): Stock {
  const sold: Stock = { design_1: 0, design_2: 0, design_3: 0 };
  for (const t of txs) {
    if (!isCounted(t)) continue;
    for (const d of DESIGNS) sold[d] += t[`${d}_qty`];
  }
  return sold;
}

/** 残数 = 初期在庫 − 販売枚数（D-15）。在庫は保存せず毎回計算する */
export function remainingStock(initial: Stock, txs: Transaction[]): Stock {
  const sold = soldByDesign(txs);
  return {
    design_1: initial.design_1 - sold.design_1,
    design_2: initial.design_2 - sold.design_2,
    design_3: initial.design_3 - sold.design_3,
  };
}

/** カートに入っている分を差し引いた残数 */
export function remainingAfterCart(remaining: Stock, cart: Cart): Stock {
  const usage = cartDesignUsage(cart);
  return {
    design_1: remaining.design_1 - usage.design_1,
    design_2: remaining.design_2 - usage.design_2,
    design_3: remaining.design_3 - usage.design_3,
  };
}

/** その商品をもう1個カートに入れられるか（セットは3絵柄すべてに余りが必要） */
export function canAddItem(item: ItemCode, cart: Cart, remaining: Stock): boolean {
  const after = remainingAfterCart(remaining, addItem(cart, item));
  return DESIGNS.every((d) => after[d] >= 0);
}

export function isLowStock(remainingQty: number, threshold: number): boolean {
  return remainingQty <= threshold;
}
