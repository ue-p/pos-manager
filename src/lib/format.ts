import { ITEM_LABELS, type ItemCode, type SaleLine } from '../domain/types';

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

/** 例：案1×2・セット×1（labels は設定の表示名。D-29） */
export function describeLines(
  lines: Pick<SaleLine, 'item' | 'quantity'>[],
  labels: Record<ItemCode, string> = ITEM_LABELS,
): string {
  return lines.map((l) => `${labels[l.item]}×${l.quantity}`).join('・');
}

/** timestamp（ローカルISO）から HH:MM */
export function hhmm(timestamp: string): string {
  return timestamp.slice(11, 16);
}

/** 経過時間（分）の表示。「前」まで含める。例：1分以内 / 25分前 / 1時間前 / 1時間5分前 */
export function formatAgo(min: number): string {
  if (min < 1) return '1分以内';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}時間前` : `${h}時間${m}分前`;
}

export function percent(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`;
}
