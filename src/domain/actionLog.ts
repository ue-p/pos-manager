// 施策ログの生成（F-14, D-24）
import { compareByTime } from './transaction';
import type { ActionLog } from './types';

interface LogBase {
  logId: string;
  timestamp: string;
  registerId: string;
  deviceId: string;
}

export const TEST_MODE_NOTES = {
  on: 'テストモードをオンにした',
  off: 'テストモードをオフにした',
} as const;

/** 手入力のメモ。テストモード中の入力は is_test=true */
export function createManualLog(input: LogBase & { note: string; isTest: boolean }): ActionLog {
  return {
    log_id: input.logId,
    timestamp: input.timestamp,
    log_type: 'manual',
    note: input.note.trim(),
    register_id: input.registerId,
    device_id: input.deviceId,
    is_test: input.isTest,
  };
}

/** テストモード切替の自動記録。本番・テストの境目を残すため、常に is_test=false */
export function createTestModeLog(input: LogBase & { on: boolean }): ActionLog {
  return {
    log_id: input.logId,
    timestamp: input.timestamp,
    log_type: input.on ? 'test_mode_on' : 'test_mode_off',
    note: input.on ? TEST_MODE_NOTES.on : TEST_MODE_NOTES.off,
    register_id: input.registerId,
    device_id: input.deviceId,
    is_test: false,
  };
}

/** CSVエクスポートの自動記録（D-25）。全端末で共通の「最後のエクスポート」に使うため、常に is_test=false */
export function createCsvExportLog(input: LogBase & { fileName: string }): ActionLog {
  return {
    log_id: input.logId,
    timestamp: input.timestamp,
    log_type: 'csv_export',
    note: `CSVをエクスポートした（${input.fileName}）`,
    register_id: input.registerId,
    device_id: input.deviceId,
    is_test: false,
  };
}

/** 上限の変更の記録の note。分析で変更前・変更後を取り出せるよう形を固定する（D-30） */
export function setLimitNote(before: number, after: number): string {
  return `セットの販売上限を変更した（${before}→${after}）`;
}

/** セットの販売上限の変更の自動記録（D-30）。売れ行きを見て調整した記録なので、常に is_test=false */
export function createSetLimitLog(input: LogBase & { before: number; after: number }): ActionLog {
  return {
    log_id: input.logId,
    timestamp: input.timestamp,
    log_type: 'set_limit_change',
    note: setLimitNote(input.before, input.after),
    register_id: input.registerId,
    device_id: input.deviceId,
    is_test: false,
  };
}

/** 全端末の csv_export 記録のうち最新の時刻（ミリ秒）。1件もなければ null */
export function lastExportMs(logs: ActionLog[]): number | null {
  let last: number | null = null;
  for (const l of logs) {
    if (l.log_type !== 'csv_export') continue;
    const ms = Date.parse(l.timestamp);
    if (!Number.isNaN(ms) && (last === null || ms > last)) last = ms;
  }
  return last;
}

/**
 * 設定画面の施策ログ一覧：新しい順に最大 limit 件。csv_export は30分ごとに増えて手入力のメモを押し出すので除く（D-25）。
 * テストモード切替の記録は境目の確認に使うので残す。CSV には csv_export も含めて出力する
 */
export function recentLogsForList(logs: ActionLog[], limit = 10): ActionLog[] {
  return logs
    .filter((l) => l.log_type !== 'csv_export')
    .sort((a, b) => compareByTime(b, a))
    .slice(0, limit);
}

export const BACKUP_WARN_MINUTES = 30;

/** バックアップ通知（F-08）：最後のエクスポートからの経過分と警告色にするか。未実施は警告 */
export function backupStatus(lastMs: number | null, nowMs: number): { elapsedMin: number | null; warn: boolean } {
  if (lastMs === null) return { elapsedMin: null, warn: true };
  // 他端末の時計が少し進んでいて負になる場合は 0 分とする
  const elapsedMin = Math.max(0, Math.floor((nowMs - lastMs) / 60_000));
  return { elapsedMin, warn: elapsedMin >= BACKUP_WARN_MINUTES };
}

/** log_type を追加する前に保存された記録は manual として扱う */
export function normalizeActionLog(raw: Omit<ActionLog, 'log_type'> & { log_type?: ActionLog['log_type'] }): ActionLog {
  return { ...raw, log_type: raw.log_type ?? 'manual' };
}
