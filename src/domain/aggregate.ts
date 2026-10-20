import { localDateOf, localHourOf } from './time';
import {
  GROUP_TYPES,
  isCounted,
  type GroupType,
  type ItemCode,
  type Stock,
  type Transaction,
  type VrVisit,
} from './types';
import { soldByDesign } from './stock';

/** date が null なら全期間。timestamp のローカル日付で区切る（D-17） */
export function filterByDate<T extends { timestamp: string }>(records: T[], date: string | null): T[] {
  if (date === null) return records;
  return records.filter((r) => localDateOf(r.timestamp) === date);
}

/** 記録に含まれる日付（昇順、重複なし） */
export function distinctDates(records: { timestamp: string }[]): string[] {
  return [...new Set(records.map((r) => localDateOf(r.timestamp)))].sort();
}

export function totalSales(txs: Transaction[]): number {
  return txs.filter(isCounted).reduce((s, t) => s + t.total, 0);
}

/** 黒字まであと何円か（0未満にはしない） */
export function remainingToTarget(sales: number, target: number): number {
  return Math.max(0, target - sales);
}

export function itemQuantities(txs: Transaction[]): Record<ItemCode, number> {
  const q: Record<ItemCode, number> = { design_1: 0, design_2: 0, design_3: 0, set: 0 };
  for (const t of txs) {
    if (!isCounted(t)) continue;
    for (const l of t.lines) q[l.item] += l.quantity;
  }
  return q;
}

export interface Summary {
  sales: number;
  transactionCount: number;
  vrCount: number;
  /** 購入組数 ÷ VR体験者数。VR体験者が0なら null */
  purchaseRate: number | null;
  soldByDesign: Stock;
  itemQuantities: Record<ItemCode, number>;
  averageSpend: number | null;
}

export function summarize(txs: Transaction[], vrs: VrVisit[]): Summary {
  const counted = txs.filter(isCounted);
  const vrCount = vrs.filter(isCounted).length;
  const sales = totalSales(counted);
  return {
    sales,
    transactionCount: counted.length,
    vrCount,
    purchaseRate: vrCount === 0 ? null : counted.length / vrCount,
    soldByDesign: soldByDesign(counted),
    itemQuantities: itemQuantities(counted),
    averageSpend: counted.length === 0 ? null : sales / counted.length,
  };
}

export interface HourlyRow {
  hour: number;
  sales: number;
  transactions: number;
  vrVisits: number;
}

/** 時間帯別（1時間ごと）。記録がある最初の時刻から最後の時刻まで、空の時間帯も0で埋める */
export function hourlyBreakdown(txs: Transaction[], vrs: VrVisit[]): HourlyRow[] {
  const counted = txs.filter(isCounted);
  const countedVr = vrs.filter(isCounted);
  const hours = [...counted, ...countedVr].map((r) => localHourOf(r.timestamp));
  if (hours.length === 0) return [];
  const rows: HourlyRow[] = [];
  for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
    rows.push({ hour: h, sales: 0, transactions: 0, vrVisits: 0 });
  }
  const first = rows[0].hour;
  for (const t of counted) {
    const row = rows[localHourOf(t.timestamp) - first];
    row.sales += t.total;
    row.transactions += 1;
  }
  for (const v of countedVr) rows[localHourOf(v.timestamp) - first].vrVisits += 1;
  return rows;
}

export interface GroupRow {
  group_type: GroupType;
  transactions: number;
  people: number;
  sales: number;
  /** 客単価（1組あたり） */
  averageSpend: number | null;
  /** 1組あたりの購入枚数 */
  averageSheets: number | null;
}

export function groupBreakdown(txs: Transaction[]): GroupRow[] {
  const counted = txs.filter(isCounted);
  return GROUP_TYPES.map((g) => {
    const rows = counted.filter((t) => t.group_type === g);
    const sales = rows.reduce((s, t) => s + t.total, 0);
    const sheets = rows.reduce((s, t) => s + t.design_1_qty + t.design_2_qty + t.design_3_qty, 0);
    return {
      group_type: g,
      transactions: rows.length,
      people: rows.reduce((s, t) => s + t.group_size, 0),
      sales,
      averageSpend: rows.length === 0 ? null : sales / rows.length,
      averageSheets: rows.length === 0 ? null : sheets / rows.length,
    };
  });
}

/** レジ締め用：そのレジ・その日のシステム上の現金売上（F-13） */
export function systemCashSales(txs: Transaction[], registerId: string, date: string): number {
  return totalSales(filterByDate(txs, date).filter((t) => t.register_id === registerId));
}

/** 差額 = (数えた現金 − 釣銭準備金) − システム上の現金売上（D-14） */
export function closingDifference(countedCash: number, floatAmount: number, systemSales: number): number {
  return countedCash - floatAmount - systemSales;
}

