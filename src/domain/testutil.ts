// テスト用のデータ生成（本番コードからは使わない）
import { addItem, EMPTY_CART, type Cart } from './cart';
import { createTransaction } from './transaction';
import { DEFAULT_SETTINGS, type ItemCode, type Prices, type Transaction, type VrVisit } from './types';

export function cartOf(items: ItemCode[]): Cart {
  return items.reduce(addItem, EMPTY_CART);
}

let seq = 0;

export function tx(
  items: ItemCode[],
  opts: Partial<Pick<Transaction, 'is_void' | 'is_test' | 'timestamp' | 'group_type' | 'register_id' | 'device_id'>> & {
    prices?: Prices;
    received?: number;
  } = {},
): Transaction {
  seq += 1;
  const t = createTransaction({
    transactionId: `tx-${String(seq).padStart(4, '0')}`,
    timestamp: opts.timestamp ?? '2026-11-03T14:05:22+09:00',
    cart: cartOf(items),
    prices: opts.prices ?? DEFAULT_SETTINGS.prices,
    groupType: opts.group_type ?? 'student',
    groupSize: 2,
    received: opts.received ?? 10000,
    registerId: opts.register_id ?? 'reg_1',
    deviceId: opts.device_id ?? 'dev_a1b2',
    isTest: opts.is_test ?? false,
  });
  return { ...t, is_void: opts.is_void ?? false };
}

export function vr(opts: Partial<VrVisit> = {}): VrVisit {
  seq += 1;
  return {
    visit_id: `vr-${seq}`,
    timestamp: '2026-11-03T14:00:00+09:00',
    register_id: 'reg_1',
    device_id: 'dev_a1b2',
    is_void: false,
    voided_at: null,
    is_test: false,
    ...opts,
  };
}
