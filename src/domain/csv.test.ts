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
      'transaction_id,line_no,timestamp,item,quantity,unit_price,amount,design_1_qty,design_2_qty,design_3_qty,group_type,group_size,register_id,device_id,is_void,is_test\n' +
        'T1,1,2026-11-03T14:05:22+09:00,design_1,2,200,400,2,0,0,student,2,reg_1,dev_a1b2,false,false\n' +
        'T1,2,2026-11-03T14:05:22+09:00,set,1,500,500,1,1,1,student,2,reg_1,dev_a1b2,false,false\n',
    );
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('transactions.csv：取消・テストの行も出力し、時刻順に並べる', () => {
    const late = { ...tx(['set'], { timestamp: '2026-11-03T15:00:00+09:00', is_void: true }), transaction_id: 'B' };
    const early = { ...tx(['design_2'], { timestamp: '2026-11-03T09:00:00+09:00', is_test: true }), transaction_id: 'A' };
    const lines = transactionsCsv([late, early]).trimEnd().split('\n');
    expect(lines[0]).toBe(
      'transaction_id,timestamp,group_type,group_size,total,received,change,design_1_qty,design_2_qty,design_3_qty,register_id,device_id,is_void,is_test',
    );
    expect(lines[1]).toBe('A,2026-11-03T09:00:00+09:00,student,2,200,10000,9800,0,1,0,reg_1,dev_a1b2,false,true');
    expect(lines[2]).toBe('B,2026-11-03T15:00:00+09:00,student,2,500,10000,9500,1,1,1,reg_1,dev_a1b2,true,false');
  });

  it('メモにカンマ・改行・ダブルクォートを含んでも崩れない', () => {
    expect(escapeCell('POPを変更')).toBe('POPを変更');
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('1行目\n2行目')).toBe('"1行目\n2行目"');
    expect(escapeCell('「"安い"」')).toBe('"「""安い""」"');
    const log: ActionLog = {
      log_id: 'L1',
      timestamp: '2026-11-03T12:00:00+09:00',
      note: 'POP変更, "セット推し"\n値札も',
      register_id: 'reg_1',
      device_id: 'dev_a1b2',
      is_test: false,
    };
    expect(actionLogsCsv([log])).toBe(
      'log_id,timestamp,note,register_id,device_id,is_test\nL1,2026-11-03T12:00:00+09:00,"POP変更, ""セット推し""\n値札も",reg_1,dev_a1b2,false\n',
    );
  });

  it('vr_visits.csv と register_closings.csv の列', () => {
    expect(vrVisitsCsv([{ ...vr(), visit_id: 'V1' }])).toBe(
      'visit_id,timestamp,register_id,device_id,is_void,is_test\nV1,2026-11-03T14:00:00+09:00,reg_1,dev_a1b2,false,false\n',
    );
    expect(registerClosingsCsv([]).trimEnd()).toBe(
      'closing_id,timestamp,business_date,register_id,device_id,system_cash_sales,counted_cash,float_amount,difference,is_test',
    );
  });

  it('値が欠けていたら空欄にせずエラーにする', () => {
    const broken = { ...tx(['design_1']), group_type: undefined } as never;
    expect(() => transactionsCsv([broken])).toThrow();
  });

  it('ZIPのファイル名と中身のファイル名', () => {
    expect(exportFileName(new Date(2026, 10, 3, 9, 5))).toBe('pos_export_20261103_0905.zip');
    expect(Object.keys(buildExportFiles({ transactions: [], vrVisits: [], actionLogs: [], registerClosings: [] }))).toEqual([
      'sales_lines.csv',
      'transactions.csv',
      'vr_visits.csv',
      'action_logs.csv',
      'register_closings.csv',
    ]);
  });
});
