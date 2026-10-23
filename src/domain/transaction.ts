import { buildLines, sumDesignQty, type Cart } from './cart';
import { calcChange } from './payment';
import type { GroupSize, GroupType, Prices, Transaction } from './types';

export interface NewTransactionInput {
  transactionId: string;
  timestamp: string;
  cart: Cart;
  prices: Prices;
  groupType: GroupType;
  groupSize: GroupSize;
  received: number;
  registerId: string;
  deviceId: string;
  cashierId: string;
  isTest: boolean;
}

export function createTransaction(input: NewTransactionInput): Transaction {
  const lines = buildLines(input.cart, input.prices);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return {
    schema_version: 2,
    transaction_id: input.transactionId,
    timestamp: input.timestamp,
    group_type: input.groupType,
    group_size: input.groupSize,
    lines,
    total,
    received: input.received,
    change: calcChange(total, input.received),
    ...sumDesignQty(lines),
    register_id: input.registerId,
    device_id: input.deviceId,
    cashier_id: input.cashierId,
    is_void: false,
    voided_at: null,
    is_test: input.isTest,
  };
}

/** 「直前の取消」の対象：この端末で確定した、まだ取り消していない最新の会計（D-05） */
export function lastVoidableTransaction(txs: Transaction[], deviceId: string): Transaction | undefined {
  return txs
    .filter((t) => t.device_id === deviceId && !t.is_void)
    .sort((a, b) => compareByTime(b, a))[0];
}

export function compareByTime(
  a: { timestamp: string; transaction_id?: string },
  b: { timestamp: string; transaction_id?: string },
): number {
  const ta = Date.parse(a.timestamp);
  const tb = Date.parse(b.timestamp);
  if (ta !== tb) return ta - tb;
  return (a.transaction_id ?? '').localeCompare(b.transaction_id ?? '');
}
