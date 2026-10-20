// 設定・エクスポート画面（F-07〜F-09, F-11, F-13, F-14）
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/Toast';
import { downloadExportZip } from '../data/exportZip';
import { usePos } from '../data/PosDataProvider';
import { saveActionLog, saveRegisterClosing, saveSettings, setTestMode } from '../data/repo';
import {
  BACKUP_WARN_MINUTES,
  backupStatus,
  createCsvExportLog,
  createManualLog,
  createTestModeLog,
  lastExportMs,
  recentLogsForList,
} from '../domain/actionLog';
import { closingDifference, systemCashSales } from '../domain/aggregate';
import { compareByTime } from '../domain/transaction';
import { toLocalIsoString, todayLocalDate } from '../domain/time';
import { DESIGNS, ITEM_LABELS, ITEMS, type Settings } from '../domain/types';
import { logout } from '../lib/auth';
import { REGISTER_IDS, registerLabel } from '../lib/device';
import { formatAgo, hhmm, yen } from '../lib/format';
import { useNow } from '../lib/useNow';
import { newUuid } from '../lib/uuid';

export function SettingsPage() {
  return (
    <div className="settings">
      <DeviceSection />
      <ExportSection />
      <TestModeSection />
      <PriceStockSection />
      <ActionLogSection />
      <ClosingSection />
      <section className="panel">
        <h2 className="panel-title">ログアウト</h2>
        <button className="btn" onClick={() => logout()}>
          この端末からログアウト
        </button>
      </section>
    </div>
  );
}

function DeviceSection() {
  const { registerId, setRegisterId, deviceId } = usePos();
  const toast = useToast();
  const displayUrl = `${window.location.origin}/display?reg=${registerId}`;
  return (
    <section className="panel">
      <h2 className="panel-title">この端末</h2>
      <div className="form-row">
        <label className="field">
          <span>レジ番号</span>
          <select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            {REGISTER_IDS.map((r) => (
              <option key={r} value={r}>
                {registerLabel(r)}（{r}）
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>端末ID</span>
          <code>{deviceId}</code>
        </div>
      </div>
      <div className="field">
        <span>お客さん用画面のURL（別端末ではこのURLを開く。ログイン不要）</span>
        <div className="form-row">
          <code className="url">{displayUrl}</code>
          <button className="btn" onClick={() => window.open(`/display?reg=${registerId}`, `pos-display-${registerId}`)}>
            この端末で開く
          </button>
          <button
            className="btn"
            onClick={() =>
              navigator.clipboard
                ?.writeText(displayUrl)
                .then(() => toast('URLをコピーしました'))
                .catch(() => toast('コピーできませんでした', 'error'))
            }
          >
            コピー
          </button>
        </div>
      </div>
    </section>
  );
}

function ExportSection() {
  const { transactions, vrVisits, actionLogs, registerClosings, pendingCount, online, registerId, deviceId } = usePos();
  const toast = useToast();
  const now = useNow(15_000);
  const lastLog = useMemo(
    () => [...actionLogs].filter((l) => l.log_type === 'csv_export').sort((a, b) => compareByTime(b, a))[0],
    [actionLogs],
  );
  const { elapsedMin, warn } = backupStatus(lastExportMs(actionLogs), now);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const exportedAt = new Date();
      const name = await downloadExportZip({ transactions, vrVisits, actionLogs, registerClosings }, registerId, exportedAt);
      // 全端末で共通の「最後のエクスポート」にするため施策ログに記録する（D-25）。オフライン中も端末に残り、復帰後に送信される
      saveActionLog(
        createCsvExportLog({
          logId: newUuid(),
          timestamp: toLocalIsoString(exportedAt),
          fileName: name,
          registerId,
          deviceId,
        }),
      );
      toast(`${name} を保存しました`);
    } catch (err) {
      console.error(err);
      toast(`エクスポートに失敗しました：${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" id="export">
      <h2 className="panel-title">CSVエクスポート（バックアップ）</h2>
      <p className={warn ? 'warn-text' : 'muted'}>
        {lastLog === undefined || elapsedMin === null
          ? 'まだどの端末もエクスポートしていません'
          : `最後のエクスポート（全端末）：${hhmm(lastLog.timestamp)} ${registerLabel(lastLog.register_id)}（${formatAgo(elapsedMin)}）`}
        {warn && ` ― ${BACKUP_WARN_MINUTES}分ごとに保存してください`}
      </p>
      {(!online || pendingCount > 0) && (
        <p className="warn-text">
          {!online ? 'オフライン中です。' : `未送信が ${pendingCount}件あります。`}
          エクスポートは「オンライン」かつ「未送信 0件」になってから行ってください。
        </p>
      )}
      <button className="btn btn--primary btn--lg" disabled={busy} onClick={doExport}>
        CSVをダウンロード（ZIP）
      </button>
      <p className="muted small">
        中身：sales_lines.csv / transactions.csv / vr_visits.csv / action_logs.csv / register_closings.csv（UTF-8・取消/テスト行も含む）。
        会計 {transactions.length}件・VR {vrVisits.length}件。
        {pendingCount > 0 && ` この端末の未送信 ${pendingCount}件も含みます。オフライン中の他端末の分は含まれません。`}
      </p>
    </section>
  );
}

function TestModeSection() {
  const { settings, registerId, deviceId } = usePos();
  const toast = useToast();
  const toggle = () => {
    const next = !settings.test_mode;
    const msg = next
      ? 'テストモードをオンにしますか？\n全端末の入力にテストフラグが付き、集計・在庫から除外されます。'
      : 'テストモードをオフにしますか？\nこれ以降の入力は本番の売上として記録されます。';
    if (!window.confirm(msg)) return;
    // 切替と施策ログへの記録は1つのバッチで書く（D-24）
    const log = createTestModeLog({
      on: next,
      logId: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      registerId,
      deviceId,
    });
    setTestMode(next, log);
    toast(`${log.note}（施策ログに記録）`);
  };
  return (
    <section className="panel">
      <h2 className="panel-title">テストモード</h2>
      <p>
        現在：<strong className={settings.test_mode ? 'warn-text' : ''}>{settings.test_mode ? 'オン（練習中）' : 'オフ（本番）'}</strong>
      </p>
      <button className={`btn btn--lg ${settings.test_mode ? 'btn--primary' : ''}`} onClick={toggle}>
        {settings.test_mode ? 'テストモードを終了する' : 'テストモードにする'}
      </button>
      <p className="muted small">全端末で共有されます。開店前に、すべての端末で上部の帯が消えたことを確認してください。</p>
    </section>
  );
}

type NumForm = Record<string, string>;

function toForm(s: Settings): NumForm {
  return {
    ...Object.fromEntries(ITEMS.map((i) => [`price_${i}`, String(s.prices[i])])),
    ...Object.fromEntries(DESIGNS.map((d) => [`stock_${d}`, String(s.initial_stock[d])])),
    target_amount: String(s.target_amount),
    low_stock_threshold: String(s.low_stock_threshold),
    float_amount: String(s.float_amount),
  };
}

function PriceStockSection() {
  const { settings, settingsStored } = usePos();
  const toast = useToast();
  const original = useMemo(() => toForm(settings), [settings]);
  const [form, setForm] = useState<NumForm>(original);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setForm(original);
  }, [original, dirty]);

  const invalid = Object.values(form).some((v) => !/^\d+$/.test(v));

  const save = () => {
    if (invalid) return;
    const n = (k: string) => Number(form[k]);
    const patch: Partial<Settings> = {
      prices: { design_1: n('price_design_1'), design_2: n('price_design_2'), design_3: n('price_design_3'), set: n('price_set') },
      initial_stock: { design_1: n('stock_design_1'), design_2: n('stock_design_2'), design_3: n('stock_design_3') },
      target_amount: n('target_amount'),
      low_stock_threshold: n('low_stock_threshold'),
      float_amount: n('float_amount'),
    };
    if (!window.confirm('設定を保存しますか？\nこれまでの会計は販売時点の価格のまま残ります。')) return;
    saveSettings(patch);
    setDirty(false);
    toast('設定を保存しました');
  };

  const field = (key: string, label: string, unit: string) => (
    <label className="field field--num" key={key}>
      <span>{label}</span>
      <span className="input-unit">
        <input
          inputMode="numeric"
          value={form[key]}
          onChange={(e) => {
            setForm((f) => ({ ...f, [key]: e.target.value.trim() }));
            setDirty(true);
          }}
          aria-invalid={!/^\d+$/.test(form[key])}
        />
        {unit}
      </span>
    </label>
  );

  return (
    <section className="panel">
      <h2 className="panel-title">価格・在庫</h2>
      {!settingsStored && <p className="warn-text">まだ設定が保存されていません（既定値で動作中）。確認して保存してください。</p>}
      <h3 className="sub-title">価格</h3>
      <div className="form-grid">{ITEMS.map((i) => field(`price_${i}`, ITEM_LABELS[i], '円'))}</div>
      <h3 className="sub-title">初期在庫</h3>
      <div className="form-grid">{DESIGNS.map((d) => field(`stock_${d}`, ITEM_LABELS[d], '枚'))}</div>
      <h3 className="sub-title">その他</h3>
      <div className="form-grid">
        {field('target_amount', '回収目標額（制作費）', '円')}
        {field('low_stock_threshold', '「残りわずか」の基準', '枚以下')}
        {field('float_amount', '釣銭準備金（1レジあたり）', '円')}
      </div>
      <div className="form-row">
        <button className="btn btn--primary" disabled={!dirty || invalid} onClick={save}>
          保存
        </button>
        <button
          className="btn"
          disabled={!dirty}
          onClick={() => {
            setForm(original);
            setDirty(false);
          }}
        >
          元に戻す
        </button>
        {invalid && <span className="error">0以上の整数で入力してください</span>}
      </div>
    </section>
  );
}

const PRESETS = ['POPを変更', '陳列を変更', '呼び込み開始', '呼び込み終了', '価格を変更', 'VR体験を一時停止', 'VR体験を再開', '休憩・交代'];

function ActionLogSection() {
  const { actionLogs, settings, registerId, deviceId } = usePos();
  const toast = useToast();
  const [note, setNote] = useState('');

  const record = (text: string) => {
    if (!text.trim()) return;
    const log = createManualLog({
      logId: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      note: text,
      registerId,
      deviceId,
      isTest: settings.test_mode,
    });
    saveActionLog(log);
    toast(`記録しました：${log.note}`);
    setNote('');
  };

  const recent = recentLogsForList(actionLogs);

  return (
    <section className="panel">
      <h2 className="panel-title">施策ログ</h2>
      <div className="choice-row">
        {PRESETS.map((p) => (
          <button key={p} className="choice choice--sm" onClick={() => record(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="form-row">
        <input
          className="grow"
          placeholder="自由メモ（例：セット推しのPOPに変更）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && record(note)}
        />
        <button className="btn btn--primary" disabled={!note.trim()} onClick={() => record(note)}>
          記録
        </button>
      </div>
      {recent.length > 0 && (
        <ul className="log-list">
          {recent.map((l) => (
            <li key={l.log_id}>
              <span className="num muted">
                {l.timestamp.slice(5, 10).replace('-', '/')} {hhmm(l.timestamp)}
              </span>
              {l.note}
              {l.log_type !== 'manual' && <span className="tag">自動</span>}
              {l.is_test && <span className="tag tag--test">テスト</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClosingSection() {
  const { transactions, registerClosings, settings, registerId, deviceId } = usePos();
  const toast = useToast();
  const [date, setDate] = useState(todayLocalDate());
  const [reg, setReg] = useState(registerId);
  const [counted, setCounted] = useState('');

  const system = systemCashSales(transactions, reg, date);
  const countedNum = /^\d+$/.test(counted) ? Number(counted) : null;
  const diff = countedNum === null ? null : closingDifference(countedNum, settings.float_amount, system);

  const save = () => {
    if (countedNum === null || diff === null) return;
    if (!window.confirm(`${registerLabel(reg)} ${date} のレジ締めを記録しますか？\n差額 ${diff >= 0 ? '+' : ''}${diff}円`)) return;
    saveRegisterClosing({
      closing_id: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      business_date: date,
      register_id: reg,
      device_id: deviceId,
      system_cash_sales: system,
      counted_cash: countedNum,
      float_amount: settings.float_amount,
      difference: diff,
      is_test: settings.test_mode,
    });
    toast(diff === 0 ? 'レジ締めを記録しました（差額なし）' : 'レジ締めを記録しました。差額の理由を施策ログに書いてください', diff === 0 ? 'info' : 'error');
    setCounted('');
  };

  const past = [...registerClosings].sort((a, b) => compareByTime(b, a)).slice(0, 10);

  return (
    <section className="panel">
      <h2 className="panel-title">レジ締め</h2>
      <div className="form-row">
        <label className="field">
          <span>営業日</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>レジ</span>
          <select value={reg} onChange={(e) => setReg(e.target.value)}>
            {REGISTER_IDS.map((r) => (
              <option key={r} value={r}>
                {registerLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--num">
          <span>数えた現金の総額</span>
          <span className="input-unit">
            <input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.trim())} />円
          </span>
        </label>
      </div>
      <dl className="closing-grid">
        <dt>システム上の現金売上</dt>
        <dd className="num">{yen(system)}</dd>
        <dt>釣銭準備金</dt>
        <dd className="num">{yen(settings.float_amount)}</dd>
        <dt>差額（数えた現金 − 準備金 − 売上）</dt>
        <dd className={`num ${diff !== null && diff !== 0 ? 'warn-text' : ''}`}>
          {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${diff.toLocaleString()}円`}
        </dd>
      </dl>
      <button className="btn btn--primary" disabled={countedNum === null} onClick={save}>
        レジ締めを記録
      </button>
      {past.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>営業日</th>
                <th>レジ</th>
                <th>売上</th>
                <th>数えた現金</th>
                <th>差額</th>
              </tr>
            </thead>
            <tbody>
              {past.map((c) => (
                <tr key={c.closing_id}>
                  <td>
                    {c.business_date}
                    {c.is_test && <span className="tag tag--test">テスト</span>}
                  </td>
                  <td>{registerLabel(c.register_id)}</td>
                  <td className="num">{yen(c.system_cash_sales)}</td>
                  <td className="num">{yen(c.counted_cash)}</td>
                  <td className="num">{c.difference.toLocaleString()}円</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
