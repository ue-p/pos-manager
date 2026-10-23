import { describe, expect, it } from 'vitest';
import {
  actionLogsCsv,
  buildExportFiles,
  escapeCell,
  exportFileName,
  registerClosingsCsv,
  salesLinesCsv,
  transactionsCsv,
  vrVisitsCsv,
} from './csv';
import { tx, vr } from './testutil';
import type { ActionLog } from './types';

describe('CSV', () => {
  it('sales_lines.csv：要件6.2の列順、1行＝1明細、セットの展開、真偽値は小文字', () => {
    const t = { ...tx(['set', 'design_1', 'design_1']), transaction_id: 'T1' };
    const csv = salesLinesCsv([t]);
    expect(csv).toBe(
      'transaction_id,line_no,timestamp,local_datetime,item,quantity,unit_price,amount,design_1_qty,design_2_qty,design_3_qty,group_type,group_size,register_id,device_id,cashier_id,is_void,is_test\n' +
        'T1,1,2026-11-03T14:05:22+09:00,2026-11-03 14:05:22,design_1,2,200,400,2,0,0,student,2,reg_1,dev_a1b2,cs_k3f9,false,false\n' +
        'T1,2,2026-11-03T14:05:22+09:00,2026-11-03 14:05:22,set,1,500,500,1,1,1,student,2,reg_1,dev_a1b2,cs_k3f9,false,false\n',
    );
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('transactions.csv：取消・テストの行も出力し、時刻順に並べる', () => {
    const late = { ...tx(['set'], { timestamp: '2026-11-03T15:00:00+09:00', is_void: true }), transaction_id: 'B' };
    const early = { ...tx(['design_2'], { timestamp: '2026-11-03T09:00:00+09:00', is_test: true }), transaction_id: 'A' };
    const lines = transactionsCsv([late, early]).trimEnd().split('\n');
    expect(lines[0]).toBe(
      'transaction_id,timestamp,local_datetime,group_type,group_size,total,received,change,design_1_qty,design_2_qty,design_3_qty,total_sheets,set_qty,register_id,device_id,cashier_id,is_void,is_test',
    );
    expect(lines[1]).toBe('A,2026-11-03T09:00:00+09:00,2026-11-03 09:00:00,student,2,200,10000,9800,0,1,0,1,0,reg_1,dev_a1b2,cs_k3f9,false,true');
    expect(lines[2]).toBe('B,2026-11-03T15:00:00+09:00,2026-11-03 15:00:00,student,2,500,10000,9500,1,1,1,3,1,reg_1,dev_a1b2,cs_k3f9,true,false');
  });

  it('transactions.csv：total_sheets は3絵柄の枚数の合計、set_qty はセットの個数（取消・テストの会計にも入る）', () => {
    const t = { ...tx(['set', 'set', 'design_1'], { is_void: true, is_test: true }), transaction_id: 'C' };
    const [header, row] = transactionsCsv([t]).trimEnd().split('\n');
    const cells = Object.fromEntries(header.split(',').map((c, i) => [c, row.split(',')[i]]));
    expect(cells).toMatchObject({
      design_1_qty: '3',
      design_2_qty: '2',
      design_3_qty: '2',
      total_sheets: '7',
      set_qty: '2',
      is_void: 'true',
      is_test: 'true',
    });
  });

  it('メモにカンマ・改行・ダブルクォートを含んでも崩れない', () => {
    expect(escapeCell('POPを変更')).toBe('POPを変更');
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('1行目\n2行目')).toBe('"1行目\n2行目"');
    expect(escapeCell('「"安い"」')).toBe('"「""安い""」"');
    const log: ActionLog = {
      log_id: 'L1',
      timestamp: '2026-11-03T12:00:00+09:00',
      log_type: 'manual',
      note: 'POP変更, "セット推し"\n値札も',
      register_id: 'reg_1',
      device_id: 'dev_a1b2',
      is_test: false,
    };
    expect(actionLogsCsv([log])).toBe(
      'log_id,timestamp,local_datetime,log_type,note,register_id,device_id,is_test\nL1,2026-11-03T12:00:00+09:00,2026-11-03 12:00:00,manual,"POP変更, ""セット推し""\n値札も",reg_1,dev_a1b2,false\n',
    );
  });

  it('action_logs.csv：テストモード切替の自動記録は log_type 付き・is_test=false で出る', () => {
    const on: ActionLog = {
      log_id: 'L2',
      timestamp: '2026-11-03T08:00:00+09:00',
      log_type: 'test_mode_on',
      note: 'テストモードをオンにした',
      register_id: 'reg_1',
      device_id: 'dev_a1b2',
      is_test: false,
    };
    const off: ActionLog = { ...on, log_id: 'L3', timestamp: '2026-11-03T08:30:00+09:00', log_type: 'test_mode_off', note: 'テストモードをオフにした' };
    expect(actionLogsCsv([off, on]).trimEnd().split('\n').slice(1)).toEqual([
      'L2,2026-11-03T08:00:00+09:00,2026-11-03 08:00:00,test_mode_on,テストモードをオンにした,reg_1,dev_a1b2,false',
      'L3,2026-11-03T08:30:00+09:00,2026-11-03 08:30:00,test_mode_off,テストモードをオフにした,reg_1,dev_a1b2,false',
    ]);
  });

  it('vr_visits.csv と register_closings.csv の列', () => {
    expect(vrVisitsCsv([{ ...vr(), visit_id: 'V1' }])).toBe(
      'visit_id,timestamp,local_datetime,register_id,device_id,is_void,is_test\nV1,2026-11-03T14:00:00+09:00,2026-11-03 14:00:00,reg_1,dev_a1b2,false,false\n',
    );
    expect(registerClosingsCsv([]).trimEnd()).toBe(
      'closing_id,timestamp,local_datetime,business_date,register_id,device_id,cashier_id,system_cash_sales,counted_cash,float_amount,difference,is_test',
    );
    const closing = {
      closing_id: 'C1',
      timestamp: '2026-11-03T18:30:05+09:00',
      business_date: '2026-11-03',
      register_id: 'reg_1',
      device_id: 'dev_a1b2',
      cashier_id: 'cs_k3f9',
      system_cash_sales: 2100,
      counted_cash: 2000,
      float_amount: 0,
      difference: -100,
      is_test: false,
    };
    expect(registerClosingsCsv([closing]).trimEnd().split('\n')[1]).toBe(
      'C1,2026-11-03T18:30:05+09:00,2026-11-03 18:30:05,2026-11-03,reg_1,dev_a1b2,cs_k3f9,2100,2000,0,-100,false',
    );
  });

  it('5つのCSVすべてで local_datetime は timestamp の直後。端末がUTCでも日本時間で出る', () => {
    const utc = '2026-11-03T05:05:22+00:00';
    const files = buildExportFiles({
      transactions: [tx(['design_1'], { timestamp: utc })],
      vrVisits: [vr({ timestamp: utc })],
      actionLogs: [{ log_id: 'L', timestamp: utc, log_type: 'manual', note: 'x', register_id: 'reg_1', device_id: 'd', is_test: false }],
      registerClosings: [
        {
          closing_id: 'C',
          timestamp: utc,
          business_date: '2026-11-03',
          register_id: 'reg_1',
          device_id: 'd',
          cashier_id: 'cs_k3f9',
          system_cash_sales: 0,
          counted_cash: 0,
          float_amount: 0,
          difference: 0,
          is_test: false,
        },
      ],
    });
    for (const [name, csv] of Object.entries(files)) {
      const [header, row] = csv.trimEnd().split('\n');
      const cols = header.split(',');
      const i = cols.indexOf('timestamp');
      expect(cols[i + 1], name).toBe('local_datetime');
      expect(row.split(',').slice(i, i + 2), name).toEqual([utc, '2026-11-03 14:05:22']);
    }
  });

  it('cashier_id は3つのCSVで device_id の直後。名前は出さない。機能追加前の記録は unknown', () => {
    const old: Record<string, unknown> = { ...tx(['design_1']), transaction_id: 'OLD' };
    delete old.cashier_id;
    const files = buildExportFiles({
      transactions: [{ ...tx(['set']), transaction_id: 'NEW' }, old as never],
      vrVisits: [],
      actionLogs: [],
      registerClosings: [],
    });
    for (const name of ['sales_lines.csv', 'transactions.csv', 'register_closings.csv']) {
      const cols = files[name].split('\n')[0].split(',');
      expect(cols[cols.indexOf('device_id') + 1], name).toBe('cashier_id');
      expect(cols.some((c) => c.includes('name')), name).toBe(false);
    }
    const tcols = files['transactions.csv'].split('\n')[0].split(',');
    const rows = files['transactions.csv'].trimEnd().split('\n').slice(1).map((r) => r.split(','));
    expect(Object.fromEntries(rows.map((r) => [r[0], r[tcols.indexOf('cashier_id')]]))).toEqual({ NEW: 'cs_k3f9', OLD: 'unknown' });
    expect(files['vr_visits.csv']).not.toContain('cashier_id');
    expect(files['action_logs.csv']).not.toContain('cashier_id');
  });

  it('値が欠けていたら空欄にせずエラーにする', () => {
    const broken = { ...tx(['design_1']), group_type: undefined } as never;
    expect(() => transactionsCsv([broken])).toThrow();
  });

  it('ZIPのファイル名と中身のファイル名', () => {
    expect(exportFileName(new Date(2026, 10, 3, 9, 5, 7), 'reg_1')).toBe('pos_export_reg_1_20261103_090507.zip');
    expect(exportFileName(new Date(2026, 10, 3, 23, 59, 59), 'reg_9')).toBe('pos_export_reg_9_20261103_235959.zip');
    expect(Object.keys(buildExportFiles({ transactions: [], vrVisits: [], actionLogs: [], registerClosings: [] }))).toEqual([
      'sales_lines.csv',
      'transactions.csv',
      'vr_visits.csv',
      'action_logs.csv',
      'register_closings.csv',
    ]);
  });
});
