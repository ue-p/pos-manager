// 施策ログの生成（F-14, D-24）
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

/** log_type を追加する前に保存された記録は manual として扱う */
export function normalizeActionLog(raw: Omit<ActionLog, 'log_type'> & { log_type?: ActionLog['log_type'] }): ActionLog {
  return { ...raw, log_type: raw.log_type ?? 'manual' };
}
