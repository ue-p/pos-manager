import { describe, expect, it } from 'vitest';
import {
  closingDifference,
  filterByDate,
  groupBreakdown,
  hourlyBreakdown,
  remainingToTarget,
  summarize,
  systemCashSales,
} from './aggregate';
import { tx, vr } from './testutil';

describe('集計', () => {
  it('価格変更前後の会計が混在しても、販売時点の単価で売上を出す', () => {
    const before = tx(['design_1', 'set']); // 200 + 500
    const after = tx(['design_1', 'set'], { prices: { design_1: 300, design_2: 300, design_3: 300, set: 800 } });
    const s = summarize([before, after], []);
    expect(s.sales).toBe(700 + 1100);
    expect(s.soldByDesign).toEqual({ design_1: 4, design_2: 2, design_3: 2 });
    expect(s.itemQuantities).toEqual({ design_1: 2, design_2: 0, design_3: 0, set: 2 });
  });

  it('取消とテストは除外し、購入率 = 購入組数 ÷ VR体験者数', () => {
    const txs = [tx(['design_1']), tx(['design_1']), tx(['set'], { is_void: true }), tx(['set'], { is_test: true })];
    const vrs = [vr(), vr(), vr(), vr(), vr({ is_void: true }), vr({ is_test: true })];
    const s = summarize(txs, vrs);
    expect(s.sales).toBe(400);
    expect(s.transactionCount).toBe(2);
    expect(s.vrCount).toBe(4);
    expect(s.purchaseRate).toBe(0.5);
    expect(summarize(txs, []).purchaseRate).toBeNull();
  });

  it('黒字まであと何円（超えたら0）', () => {
    expect(remainingToTarget(10000, 40750)).toBe(30750);
    expect(remainingToTarget(50000, 40750)).toBe(0);
  });

  it('時間帯別：空の時間帯を0で埋める', () => {
    const rows = hourlyBreakdown(
      [tx(['design_1'], { timestamp: '2026-11-03T10:15:00+09:00' }), tx(['set'], { timestamp: '2026-11-03T12:59:59+09:00' })],
      [vr({ timestamp: '2026-11-03T11:00:00+09:00' })],
    );
    expect(rows).toEqual([
      { hour: 10, sales: 200, transactions: 1, vrVisits: 0 },
      { hour: 11, sales: 0, transactions: 0, vrVisits: 1 },
      { hour: 12, sales: 500, transactions: 1, vrVisits: 0 },
    ]);
  });

  it('客層別', () => {
    const rows = groupBreakdown([tx(['set'], { group_type: 'family' }), tx(['design_1'], { group_type: 'family' })]);
    expect(rows.find((r) => r.group_type === 'family')).toEqual({
      group_type: 'family',
      transactions: 2,
      people: 4,
      sales: 700,
      averageSpend: 350,
      averageSheets: 2,
    });
    expect(rows.find((r) => r.group_type === 'adult')?.averageSpend).toBeNull();
  });

  it('日付で絞り込む', () => {
    const a = tx(['design_1'], { timestamp: '2026-11-03T10:00:00+09:00' });
    const b = tx(['design_1'], { timestamp: '2026-11-04T10:00:00+09:00' });
    expect(filterByDate([a, b], '2026-11-04')).toEqual([b]);
    expect(filterByDate([a, b], null)).toHaveLength(2);
  });

  it('レジ締め：レジ・日付ごとの現金売上と差額', () => {
    const txs = [
      tx(['set'], { timestamp: '2026-11-03T10:00:00+09:00' }),
      tx(['set'], { timestamp: '2026-11-03T11:00:00+09:00', register_id: 'reg_2' }),
      tx(['set'], { timestamp: '2026-11-04T10:00:00+09:00' }),
      tx(['set'], { timestamp: '2026-11-03T12:00:00+09:00', is_void: true }),
    ];
    const sys = systemCashSales(txs, 'reg_1', '2026-11-03');
    expect(sys).toBe(500);
    expect(closingDifference(5400, 5000, sys)).toBe(-100);
  });
});
