import { describe, expect, it } from 'vitest';
import {
  backupStatus,
  createCsvExportLog,
  createManualLog,
  createSetLimitLog,
  createTestModeLog,
  lastExportMs,
  normalizeActionLog,
  recentLogsForList,
} from './actionLog';
import type { ActionLog } from './types';

const base = { logId: 'L1', timestamp: '2026-11-03T09:00:00+09:00', registerId: 'reg_2', deviceId: 'dev_a1b2' };

describe('テストモード切替の自動記録（D-24）', () => {
  it('オンにした記録', () => {
    expect(createTestModeLog({ ...base, on: true })).toEqual({
      log_id: 'L1',
      timestamp: '2026-11-03T09:00:00+09:00',
      log_type: 'test_mode_on',
      note: 'テストモードをオンにした',
      register_id: 'reg_2',
      device_id: 'dev_a1b2',
      is_test: false,
    });
  });

  it('オフにした記録', () => {
    expect(createTestModeLog({ ...base, on: false })).toMatchObject({
      log_type: 'test_mode_off',
      note: 'テストモードをオフにした',
      is_test: false,
    });
  });
});

describe('セットの販売上限の変更の自動記録（D-30）', () => {
  it('種類は set_limit_change、メモに変更前→変更後、常に is_test=false', () => {
    expect(createSetLimitLog({ ...base, before: 100, after: 40 })).toEqual({
      log_id: 'L1',
      timestamp: '2026-11-03T09:00:00+09:00',
      log_type: 'set_limit_change',
      note: 'セットの販売上限を変更した（100→40）',
      register_id: 'reg_2',
      device_id: 'dev_a1b2',
      is_test: false,
    });
  });

  it('メモから変更前・変更後を取り出せる（分析用。check_csv.py と同じ形）', () => {
    const { note } = createSetLimitLog({ ...base, before: 0, after: 100 });
    expect(/^セットの販売上限を変更した（(\d+)→(\d+)）$/.exec(note)?.slice(1)).toEqual(['0', '100']);
  });
});

describe('手入力の施策ログ', () => {
  it('種類は manual、テストモード中なら is_test=true', () => {
    expect(createManualLog({ ...base, note: '  POPを変更 ', isTest: true })).toEqual({
      log_id: 'L1',
      timestamp: '2026-11-03T09:00:00+09:00',
      log_type: 'manual',
      note: 'POPを変更',
      register_id: 'reg_2',
      device_id: 'dev_a1b2',
      is_test: true,
    });
  });
});

describe('CSVエクスポートの自動記録（D-25）', () => {
  it('種類は csv_export、メモにファイル名、テストモード中でも is_test=false', () => {
    expect(createCsvExportLog({ ...base, fileName: 'pos_export_reg_2_20261103_090000.zip' })).toEqual({
      log_id: 'L1',
      timestamp: '2026-11-03T09:00:00+09:00',
      log_type: 'csv_export',
      note: 'CSVをエクスポートした（pos_export_reg_2_20261103_090000.zip）',
      register_id: 'reg_2',
      device_id: 'dev_a1b2',
      is_test: false,
    });
  });

  const log = (log_type: ActionLog['log_type'], timestamp: string, device_id = 'dev_a1b2'): ActionLog => ({
    log_id: `${log_type}-${timestamp}`,
    timestamp,
    log_type,
    note: '',
    register_id: 'reg_1',
    device_id,
    is_test: false,
  });

  it('最後のエクスポートは、全端末の csv_export 記録のうち最新のもの（他の種類は無視）', () => {
    const logs = [
      log('csv_export', '2026-11-03T10:00:00+09:00', 'dev_a'),
      log('csv_export', '2026-11-03T10:30:00+09:00', 'dev_b'),
      log('manual', '2026-11-03T11:00:00+09:00'),
      log('test_mode_off', '2026-11-03T11:10:00+09:00'),
    ];
    expect(lastExportMs(logs)).toBe(Date.parse('2026-11-03T10:30:00+09:00'));
    expect(lastExportMs([log('manual', '2026-11-03T11:00:00+09:00')])).toBeNull();
  });

  it('設定画面の一覧は csv_export を除いた最新10件（テストモード切替は残す）', () => {
    const logs = [
      ...Array.from({ length: 12 }, (_, i) => log('manual', `2026-11-03T10:${String(i).padStart(2, '0')}:00+09:00`)),
      log('test_mode_on', '2026-11-03T10:30:00+09:00'),
      log('csv_export', '2026-11-03T10:40:00+09:00'),
      log('test_mode_off', '2026-11-03T10:50:00+09:00'),
      log('csv_export', '2026-11-03T11:00:00+09:00'),
    ];
    const listed = recentLogsForList(logs);
    expect(listed).toHaveLength(10);
    expect(listed.map((l) => l.log_type)).not.toContain('csv_export');
    expect(listed.slice(0, 3).map((l) => l.log_type)).toEqual(['test_mode_off', 'test_mode_on', 'manual']);
  });

  it('経過時間と警告：未実施は警告、30分以上で警告', () => {
    const last = Date.parse('2026-11-03T10:00:00+09:00');
    expect(backupStatus(null, last)).toEqual({ elapsedMin: null, warn: true });
    expect(backupStatus(last, last + 29 * 60_000 + 59_000)).toEqual({ elapsedMin: 29, warn: false });
    expect(backupStatus(last, last + 30 * 60_000)).toEqual({ elapsedMin: 30, warn: true });
    // 他端末の時計が進んでいても負の経過時間にしない
    expect(backupStatus(last, last - 90_000)).toEqual({ elapsedMin: 0, warn: false });
  });
});

describe('log_type 追加前のデータ', () => {
  it('log_type が無い記録は manual として扱う', () => {
    const old = { log_id: 'L0', timestamp: base.timestamp, note: 'メモ', register_id: 'reg_1', device_id: 'dev_x', is_test: false };
    expect(normalizeActionLog(old).log_type).toBe('manual');
    expect(normalizeActionLog({ ...old, log_type: 'test_mode_off' }).log_type).toBe('test_mode_off');
  });
});
