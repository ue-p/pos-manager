import { describe, expect, it } from 'vitest';
import { createTransaction, lastVoidableTransaction } from './transaction';
import { cartOf, tx } from './testutil';
import { DEFAULT_SETTINGS } from './types';

describe('会計の生成', () => {
  it('セットを含む会計の design_n_qty は明細の合計', () => {
    const t = createTransaction({
      transactionId: 'abc',
      timestamp: '2026-11-03T14:05:22+09:00',
      cart: cartOf(['set', 'design_2', 'design_2']),
      prices: DEFAULT_SETTINGS.prices,
      groupType: 'family',
      groupSize: 3,
      received: 1000,
      registerId: 'reg_1',
      deviceId: 'dev_a1b2',
      cashierId: 'cs_k3f9',
      isTest: false,
    });
    expect(t).toMatchObject({
      schema_version: 2,
      cashier_id: 'cs_k3f9',
      total: 900,
      received: 1000,
      change: 100,
      design_1_qty: 1,
      design_2_qty: 3,
      design_3_qty: 1,
      is_void: false,
      voided_at: null,
    });
    expect(t.lines).toHaveLength(2);
  });
});

describe('直前の取消の対象', () => {
  it('この端末の、取り消していない最新の会計', () => {
    const a = tx(['design_1'], { timestamp: '2026-11-03T14:00:00+09:00' });
    const b = tx(['design_1'], { timestamp: '2026-11-03T14:10:00+09:00' });
    const c = tx(['design_1'], { timestamp: '2026-11-03T14:20:00+09:00', is_void: true });
    const other = tx(['design_1'], { timestamp: '2026-11-03T14:30:00+09:00', device_id: 'dev_zzzz' });
    expect(lastVoidableTransaction([a, b, c, other], 'dev_a1b2')?.transaction_id).toBe(b.transaction_id);
    expect(lastVoidableTransaction([other], 'dev_a1b2')).toBeUndefined();
  });
});
