// 分析用CSV（要件 6.1〜6.3、D-13、D-14）。列名・列順を変えると分析スクリプトが壊れるので注意
import { compareByTime } from './transaction';
import type { ActionLog, RegisterClosing, Transaction, VrVisit } from './types';

type Cell = string | number | boolean;

export const SALES_LINES_COLUMNS = [
  'transaction_id',
  'line_no',
  'timestamp',
  'item',
  'quantity',
  'unit_price',
  'amount',
  'design_1_qty',
  'design_2_qty',
  'design_3_qty',
  'group_type',
  'group_size',
  'register_id',
  'device_id',
  'is_void',
  'is_test',
] as const;

export const TRANSACTIONS_COLUMNS = [
  'transaction_id',
  'timestamp',
  'group_type',
  'group_size',
  'total',
  'received',
  'change',
  'design_1_qty',
  'design_2_qty',
  'design_3_qty',
  'register_id',
  'device_id',
  'is_void',
  'is_test',
] as const;

export const VR_VISITS_COLUMNS = ['visit_id', 'timestamp', 'register_id', 'device_id', 'is_void', 'is_test'] as const;

export const ACTION_LOGS_COLUMNS = [
  'log_id',
  'timestamp',
  'log_type',
  'note',
  'register_id',
  'device_id',
  'is_test',
] as const;

export const REGISTER_CLOSINGS_COLUMNS = [
  'closing_id',
  'timestamp',
  'business_date',
  'register_id',
  'device_id',
  'system_cash_sales',
  'counted_cash',
  'float_amount',
  'difference',
  'is_test',
] as const;

/** カンマ・改行・ダブルクォートを含む値だけ " で囲む */
export function escapeCell(value: Cell): string {
  const s = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<C extends string>(columns: readonly C[], rows: Record<C, Cell>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(row[c])).join(','));
  return lines.join('\n') + '\n';
}

function pick<C extends string>(columns: readonly C[], src: Record<string, unknown>): Record<C, Cell> {
  const out = {} as Record<C, Cell>;
  for (const c of columns) {
    const v = src[c];
    if (v === undefined || v === null) throw new Error(`CSV列 ${c} の値がありません`);
    out[c] = v as Cell;
  }
  return out;
}

function sortedByTime<T extends { timestamp: string }>(records: T[], idKey: keyof T): T[] {
  return [...records].sort((a, b) =>
    compareByTime(
      { timestamp: a.timestamp, transaction_id: String(a[idKey]) },
      { timestamp: b.timestamp, transaction_id: String(b[idKey]) },
    ),
  );
}

export function salesLinesCsv(txs: Transaction[]): string {
  const rows: Record<(typeof SALES_LINES_COLUMNS)[number], Cell>[] = [];
  for (const t of sortedByTime(txs, 'transaction_id')) {
    for (const l of [...t.lines].sort((a, b) => a.line_no - b.line_no)) {
      rows.push(pick(SALES_LINES_COLUMNS, { ...t, ...l }));
    }
  }
  return toCsv(SALES_LINES_COLUMNS, rows);
}

export function transactionsCsv(txs: Transaction[]): string {
  return toCsv(
    TRANSACTIONS_COLUMNS,
    sortedByTime(txs, 'transaction_id').map((t) => pick(TRANSACTIONS_COLUMNS, { ...t })),
  );
}

export function vrVisitsCsv(vrs: VrVisit[]): string {
  return toCsv(VR_VISITS_COLUMNS, sortedByTime(vrs, 'visit_id').map((v) => pick(VR_VISITS_COLUMNS, { ...v })));
}

export function actionLogsCsv(logs: ActionLog[]): string {
  return toCsv(ACTION_LOGS_COLUMNS, sortedByTime(logs, 'log_id').map((l) => pick(ACTION_LOGS_COLUMNS, { ...l })));
}

export function registerClosingsCsv(closings: RegisterClosing[]): string {
  return toCsv(
    REGISTER_CLOSINGS_COLUMNS,
    sortedByTime(closings, 'closing_id').map((c) => pick(REGISTER_CLOSINGS_COLUMNS, { ...c })),
  );
}

export interface ExportData {
  transactions: Transaction[];
  vrVisits: VrVisit[];
  actionLogs: ActionLog[];
  registerClosings: RegisterClosing[];
}

/** ZIPに入れるファイル名と中身（ファイル名は固定。D-13） */
export function buildExportFiles(data: ExportData): Record<string, string> {
  return {
    'sales_lines.csv': salesLinesCsv(data.transactions),
    'transactions.csv': transactionsCsv(data.transactions),
    'vr_visits.csv': vrVisitsCsv(data.vrVisits),
    'action_logs.csv': actionLogsCsv(data.actionLogs),
    'register_closings.csv': registerClosingsCsv(data.registerClosings),
  };
}

/** pos_export_YYYYMMDD_HHmm.zip */
export function exportFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `pos_export_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.zip`;
}
