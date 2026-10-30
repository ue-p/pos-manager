// 設定・エクスポート画面（F-07〜F-09, F-11, F-13, F-14）
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/Toast';
import { downloadExportZip } from '../data/exportZip';
import { usePos } from '../data/PosDataProvider';
import {
  saveActionLog,
  saveCashier,
  saveRegisterClosing,
  saveSettings,
  setSetLimit,
  setTestMode,
  updateCashier,
} from '../data/repo';
import { CASHIER_NAME_MAX, validateCashierName } from '../domain/cashier';
import {
  BACKUP_WARN_MINUTES,
  backupStatus,
  createCsvExportLog,
  createManualLog,
  createSetLimitLog,
  createTestModeLog,
  lastExportMs,
  recentLogsForList,
} from '../domain/actionLog';
import { closingDifference, systemCashSales } from '../domain/aggregate';
import { compareByTime } from '../domain/transaction';
import { toLocalIsoString, todayLocalDate } from '../domain/time';
import { ITEM_LABEL_MAX, validateItemLabels } from '../domain/itemLabels';
import { parseSetLimit, remainingSets, SET_LIMIT_MAX, soldSets } from '../domain/setLimit';
import { DESIGNS, ITEM_LABELS, ITEMS, type DesignCode, type Settings } from '../domain/types';
import { logout } from '../lib/auth';
import { newCashierId, REGISTER_IDS, registerLabel } from '../lib/device';
import { formatAgo, hhmm, yen } from '../lib/format';
import { useNow } from '../lib/useNow';
import { APP_VERSION } from '../lib/pwa';
import { getStoredThemePref, setThemePref, THEME_LABELS, THEME_PREFS, type ThemePref } from '../lib/theme';
import { newUuid } from '../lib/uuid';
import {
  choice,
  choiceRow,
  error as errorText,
  field as fieldClass,
  panel,
  panelTitle,
  small as smallText,
  subTitle,
  table,
  tableScroll,
  td,
  th,
} from './ui';

/**
 * この画面のスタイルは Tailwind で書く（D-31）。この画面で何度も使う組み合わせだけ、ここにまとめる。
 * 他の画面と共通の部品（パネル・選択ボタン・入力欄・表など）は ./ui.ts、btn・num・muted・tag は styles.css
 */
const tw = {
  formRow: 'my-2.5 flex flex-wrap items-end gap-2.5',
  formGrid: 'grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5',
  /** 入力欄と単位（円・枚・セット）を横に並べる */
  inputUnit: 'inline-flex items-center gap-1.5',
  unitInput: 'w-[120px] text-right',
  warn: 'font-semibold text-warn',
  /** 行の残りの幅いっぱいに広がる入力欄 */
  grow: 'min-w-0 flex-1',
};

export function SettingsPage() {
  return (
    <div className="mx-auto grid max-w-[920px] gap-4">
      <DeviceSection />
      <CashierSection />
      <ExportSection />
      <TestModeSection />
      <PriceStockSection />
      <SetLimitSection />
      <ItemLabelSection />
      <ActionLogSection />
      <ClosingSection />
      <section className={panel}>
        <h2 className={panelTitle()}>ログアウト</h2>
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
  const [themePref, setThemePrefState] = useState<ThemePref>(getStoredThemePref);
  const displayUrl = `${window.location.origin}/display?reg=${registerId}`;
  return (
    <section className={panel}>
      <h2 className={panelTitle()}>この端末</h2>
      <div className={tw.formRow}>
        <label className={fieldClass}>
          <span>レジ番号</span>
          <select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            {REGISTER_IDS.map((r) => (
              <option key={r} value={r}>
                {registerLabel(r)}（{r}）
              </option>
            ))}
          </select>
        </label>
        <div className={fieldClass}>
          <span>端末ID</span>
          <code>{deviceId}</code>
        </div>
        <label className={fieldClass}>
          <span>表示モード（この端末だけ）</span>
          <select
            value={themePref}
            onChange={(e) => {
              const pref = e.target.value as ThemePref;
              setThemePref(pref);
              setThemePrefState(pref);
            }}
          >
            {THEME_PREFS.map((p) => (
              <option key={p} value={p}>
                {THEME_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <div className={fieldClass}>
          <span>アプリの版</span>
          <code data-testid="app-version">{APP_VERSION}</code>
        </div>
      </div>
      <div className={fieldClass}>
        <span>お客さん用画面のURL（別端末ではこのURLを開く。ログイン不要。末尾に &amp;theme=dark / &amp;theme=light を付けると表示モードを固定できる）</span>
        <div className={tw.formRow}>
          <code className="break-all p-2.5">{displayUrl}</code>
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

/** レジ担当者の登録・編集（D-27）。削除はせず「無効」にする */
function CashierSection() {
  const { cashiers } = usePos();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const sorted = [...cashiers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ja'));
  const addError = newName.trim() === '' ? null : validateCashierName(newName, cashiers);

  const add = () => {
    const err = validateCashierName(newName, cashiers);
    if (err) return toast(err, 'error');
    const cashier = { cashier_id: newCashierId(new Set(cashiers.map((c) => c.cashier_id))), name: newName.trim(), active: true };
    saveCashier(cashier);
    toast(`担当者「${cashier.name}」を登録しました`);
    setNewName('');
  };

  const rename = (id: string) => {
    const name = drafts[id];
    if (name === undefined) return;
    const err = validateCashierName(name, cashiers, id);
    if (err) return toast(err, 'error');
    updateCashier(id, { name: name.trim() });
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    toast('名前を変更しました');
  };

  return (
    <section className={panel}>
      <h2 className={panelTitle()}>担当者</h2>
      <p className={`${smallText} ${tw.warn}`}>
        名前は呼び名かイニシャルで登録してください（例：「うえ」「Y.U」）。個人情報は扱わないため、本名は登録しないでください。
        CSV には名前は出ず、担当者のID（cs_xxxx）だけが記録されます。
      </p>
      <div className={tw.formRow}>
        <input
          className={tw.grow}
          aria-label="新しい担当者の名前"
          placeholder="呼び名・イニシャル（20文字以内）"
          maxLength={CASHIER_NAME_MAX}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()}
        />
        <button className="btn btn--primary" disabled={newName.trim() === '' || addError !== null} onClick={add}>
          追加
        </button>
      </div>
      {addError && <p className={`${errorText} ${smallText}`}>{addError}</p>}
      {sorted.length > 0 && (
        <ul className="mt-3 mb-0 grid list-none gap-2 p-0" data-testid="cashier-list">
          {sorted.map((c) => {
            const draft = drafts[c.cashier_id];
            return (
              <li key={c.cashier_id} className="flex flex-wrap items-center gap-2">
                <input
                  className={`min-w-0 flex-[1_1_160px] ${c.active ? '' : 'text-muted line-through'}`}
                  aria-label={`${c.name} の名前`}
                  maxLength={CASHIER_NAME_MAX}
                  value={draft ?? c.name}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.cashier_id]: e.target.value }))}
                />
                <code className="muted">{c.cashier_id}</code>
                {draft !== undefined && draft !== c.name && (
                  <button className="btn btn--primary btn--sm" onClick={() => rename(c.cashier_id)}>
                    名前を保存
                  </button>
                )}
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    if (c.active && !window.confirm(`「${c.name}」を無効にしますか？
この人を「いまの担当者」にしている端末は、担当者の選び直しが必要になります。`)) return;
                    updateCashier(c.cashier_id, { active: !c.active });
                  }}
                >
                  {c.active ? '無効にする' : '有効に戻す'}
                </button>
                {!c.active && <span className="tag">無効</span>}
              </li>
            );
          })}
        </ul>
      )}
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
    <section className={panel} id="export">
      <h2 className={panelTitle()}>CSVエクスポート（バックアップ）</h2>
      <p className={warn ? tw.warn : 'muted'}>
        {lastLog === undefined || elapsedMin === null
          ? 'まだどの端末もエクスポートしていません'
          : `最後のエクスポート（全端末）：${hhmm(lastLog.timestamp)} ${registerLabel(lastLog.register_id)}（${formatAgo(elapsedMin)}）`}
        {warn && ` ― ${BACKUP_WARN_MINUTES}分ごとに保存してください`}
      </p>
      {(!online || pendingCount > 0) && (
        <p className={tw.warn}>
          {!online ? 'オフライン中です。' : `未送信が ${pendingCount}件あります。`}
          エクスポートは「オンライン」かつ「未送信 0件」になってから行ってください。
        </p>
      )}
      <button className="btn btn--primary btn--lg" disabled={busy} onClick={doExport}>
        CSVをダウンロード（ZIP）
      </button>
      <p className={`muted ${smallText}`}>
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
    <section className={panel}>
      <h2 className={panelTitle()}>テストモード</h2>
      <p>
        現在：<strong className={settings.test_mode ? tw.warn : ''}>{settings.test_mode ? 'オン（練習中）' : 'オフ（本番）'}</strong>
      </p>
      <button className={`btn btn--lg ${settings.test_mode ? 'btn--primary' : ''}`} onClick={toggle}>
        {settings.test_mode ? 'テストモードを終了する' : 'テストモードにする'}
      </button>
      <p className={`muted ${smallText}`}>全端末で共有されます。開店前に、すべての端末で上部の帯が消えたことを確認してください。</p>
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
  const { settings, settingsStored, itemLabels } = usePos();
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
    <label className={fieldClass} key={key}>
      <span>{label}</span>
      <span className={tw.inputUnit}>
        <input
          className={tw.unitInput}
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
    <section className={panel}>
      <h2 className={panelTitle()}>価格・在庫</h2>
      {!settingsStored && <p className={tw.warn}>まだ設定が保存されていません（既定値で動作中）。確認して保存してください。</p>}
      <h3 className={subTitle}>価格</h3>
      <div className={tw.formGrid}>{ITEMS.map((i) => field(`price_${i}`, itemLabels[i], '円'))}</div>
      <h3 className={subTitle}>初期在庫</h3>
      <div className={tw.formGrid}>{DESIGNS.map((d) => field(`stock_${d}`, itemLabels[d], '枚'))}</div>
      <h3 className={subTitle}>その他</h3>
      <div className={tw.formGrid}>
        {field('target_amount', '回収目標額（制作費）', '円')}
        {field('low_stock_threshold', '「残りわずか」の基準', '枚以下')}
        {field('float_amount', '釣銭準備金（1レジあたり）', '円')}
      </div>
      <div className={tw.formRow}>
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
        {invalid && <span className={errorText}>0以上の整数で入力してください</span>}
      </div>
    </section>
  );
}

/** セットの販売上限（D-30）。変えると施策ログに変更前→変更後を自動で記録する */
function SetLimitSection() {
  const { settings, transactions, registerId, deviceId } = usePos();
  const toast = useToast();
  const current = settings.set_limit;
  const [input, setInput] = useState(String(current));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setInput(String(current));
  }, [current, dirty]);
  const sold = soldSets(transactions);
  const next = parseSetLimit(input);

  const save = () => {
    if (next === null || next === current) return;
    const below = next < sold ? `\n販売済み（${sold}セット）より少ないため、残りは0セットになります。` : '';
    if (!window.confirm(`セットの販売上限を ${current} → ${next} セットに変更しますか？${below}\n施策ログに自動で記録されます。`)) return;
    // 変更と施策ログへの記録は1つのバッチで書く（D-30。テストモード中も is_test=false）
    const log = createSetLimitLog({
      before: current,
      after: next,
      logId: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      registerId,
      deviceId,
    });
    setSetLimit(next, log);
    setDirty(false);
    toast(`${log.note}（施策ログに記録）`);
  };

  return (
    <section className={panel}>
      <h2 className={panelTitle()}>セットの販売上限</h2>
      <p>
        上限 <strong className="num">{current}</strong>セット ／ 販売済み <strong className="num">{sold}</strong>セット ／ 残り{' '}
        <strong className="num">{remainingSets(current, transactions)}</strong>セット
      </p>
      <div className={tw.formRow}>
        <label className={fieldClass}>
          <span>新しい上限（0〜{SET_LIMIT_MAX}）</span>
          <span className={tw.inputUnit}>
            <input
              className={tw.unitInput}
              inputMode="numeric"
              aria-label="セットの販売上限"
              value={input}
              aria-invalid={next === null}
              onChange={(e) => {
                setInput(e.target.value.trim());
                setDirty(true);
              }}
            />
            セット
          </span>
        </label>
        <button className="btn btn--primary" disabled={next === null || next === current} onClick={save}>
          保存
        </button>
        <button
          className="btn"
          disabled={!dirty}
          onClick={() => {
            setInput(String(current));
            setDirty(false);
          }}
        >
          元に戻す
        </button>
      </div>
      {next === null && <p className={`${errorText} ${smallText}`}>0〜{SET_LIMIT_MAX}の整数で入力してください</p>}
      {next !== null && next !== current && next < sold && (
        <p className={`${smallText} ${tw.warn}`}>販売済み（{sold}セット）より少ないため、保存すると残りは0セットになります。</p>
      )}
      <p className={`muted ${smallText}`}>
        全端末で共有されます。取消・テストモードの会計は数えません。{SET_LIMIT_MAX}セットで実質制限なしです。
        変更すると施策ログに自動で記録されます（分析用）。
      </p>
    </section>
  );
}

/** シールの表示名（D-29）。画面に出す名前だけを変える。CSV のコード値（design_1〜3）は変わらない */
function ItemLabelSection() {
  const { settings } = usePos();
  const toast = useToast();
  const original = useMemo(
    () => Object.fromEntries(DESIGNS.map((d) => [d, settings.item_labels[d] ?? ''])) as Record<DesignCode, string>,
    [settings.item_labels],
  );
  const [form, setForm] = useState(original);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setForm(original);
  }, [original, dirty]);
  const errors = validateItemLabels(form);
  const invalid = Object.keys(errors).length > 0;

  const save = () => {
    if (invalid) return;
    const item_labels = Object.fromEntries(DESIGNS.map((d) => [d, form[d].trim()])) as Record<DesignCode, string>;
    saveSettings({ item_labels });
    setDirty(false);
    toast('シールの表示名を保存しました');
  };

  return (
    <section className={panel}>
      <h2 className={panelTitle()}>シールの表示名</h2>
      <p className={`muted ${smallText}`}>
        レジ画面・お客さん用画面・ダッシュボードに出す名前です（{ITEM_LABEL_MAX}文字まで）。空欄にすると「案1〜3」に戻ります。
        CSV の値（design_1〜design_3）は変わりません。
      </p>
      <div className={tw.formGrid}>
        {DESIGNS.map((d) => (
          <label className={fieldClass} key={d}>
            <span>{ITEM_LABELS[d]}の表示名</span>
            <input
              value={form[d]}
              placeholder={ITEM_LABELS[d]}
              maxLength={ITEM_LABEL_MAX * 2}
              aria-invalid={errors[d] !== undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, [d]: e.target.value }));
                setDirty(true);
              }}
            />
            {errors[d] && <span className={`${errorText} ${smallText}`}>{errors[d]}</span>}
          </label>
        ))}
      </div>
      <div className={tw.formRow}>
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
    <section className={panel}>
      <h2 className={panelTitle()}>施策ログ</h2>
      <div className={choiceRow}>
        {PRESETS.map((p) => (
          <button key={p} className={choice({ small: true })} onClick={() => record(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className={tw.formRow}>
        <input
          className={tw.grow}
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
        <ul className="mt-2 mb-0 grid list-none gap-1 p-0" data-testid="log-list">
          {recent.map((l) => (
            <li key={l.log_id}>
              <span className="num muted mr-2.5">
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
  const { transactions, registerClosings, settings, registerId, deviceId, currentCashier } = usePos();
  const toast = useToast();
  const [date, setDate] = useState(todayLocalDate());
  const [reg, setReg] = useState(registerId);
  const [counted, setCounted] = useState('');

  const system = systemCashSales(transactions, reg, date);
  const countedNum = /^\d+$/.test(counted) ? Number(counted) : null;
  const diff = countedNum === null ? null : closingDifference(countedNum, settings.float_amount, system);

  const save = () => {
    if (countedNum === null || diff === null || currentCashier === null) return;
    if (!window.confirm(`${registerLabel(reg)} ${date} のレジ締めを記録しますか？\n差額 ${diff >= 0 ? '+' : ''}${diff}円`)) return;
    saveRegisterClosing({
      closing_id: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      business_date: date,
      register_id: reg,
      device_id: deviceId,
      cashier_id: currentCashier.cashier_id, // レジ締めをした担当者（D-27）
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
    <section className={panel}>
      <h2 className={panelTitle()}>レジ締め</h2>
      <div className={tw.formRow}>
        <label className={fieldClass}>
          <span>営業日</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={fieldClass}>
          <span>レジ</span>
          <select value={reg} onChange={(e) => setReg(e.target.value)}>
            {REGISTER_IDS.map((r) => (
              <option key={r} value={r}>
                {registerLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass}>
          <span>数えた現金の総額</span>
          <span className={tw.inputUnit}>
            <input className={tw.unitInput} inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.trim())} />円
          </span>
        </label>
      </div>
      <dl className="mt-2 mb-3 grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-1">
        <dt className="text-text-2">システム上の現金売上</dt>
        <dd className="num m-0 text-right font-bold">{yen(system)}</dd>
        <dt className="text-text-2">釣銭準備金</dt>
        <dd className="num m-0 text-right font-bold">{yen(settings.float_amount)}</dd>
        <dt className="text-text-2">差額（数えた現金 − 準備金 − 売上）</dt>
        {/* 差額のある行は文字色だけ変える（太さは他の行と同じ 700） */}
        <dd className={`num m-0 text-right font-bold ${diff !== null && diff !== 0 ? 'text-warn' : ''}`}>
          {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${diff.toLocaleString()}円`}
        </dd>
      </dl>
      {currentCashier === null && <p className={tw.warn}>レジ締めの前に、画面上部の「担当」で担当者を選んでください。</p>}
      <button className="btn btn--primary" disabled={countedNum === null || currentCashier === null} onClick={save}>
        レジ締めを記録
      </button>
      {past.length > 0 && (
        <div className={tableScroll}>
          <table className={table}>
            <thead>
              <tr>
                <th className={th(true)}>営業日</th>
                <th className={th(false)}>レジ</th>
                <th className={th(false)}>売上</th>
                <th className={th(false)}>数えた現金</th>
                <th className={th(false)}>差額</th>
              </tr>
            </thead>
            <tbody>
              {past.map((c) => (
                <tr key={c.closing_id}>
                  <td className={td()}>
                    {c.business_date}
                    {c.is_test && <span className="tag tag--test">テスト</span>}
                  </td>
                  <td className={td()}>{registerLabel(c.register_id)}</td>
                  <td className={td(true)}>{yen(c.system_cash_sales)}</td>
                  <td className={td(true)}>{yen(c.counted_cash)}</td>
                  <td className={td(true)}>{c.difference.toLocaleString()}円</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
