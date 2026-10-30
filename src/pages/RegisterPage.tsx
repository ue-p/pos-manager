// スタッフ入力画面（F-01〜F-04, F-06, F-12）。1会計は文字入力なし・タップのみで完了する
import { useEffect, useMemo, useRef, useState } from 'react';
import { HistoryDialog } from '../components/HistoryDialog';
import { ItemArt } from '../components/ItemArt';
import { useToast } from '../components/Toast';
import { createDisplaySender, type DisplayState } from '../data/displaySync';
import { usePos } from '../data/PosDataProvider';
import { saveTransaction, saveVrVisit, voidTransaction, voidVrVisit } from '../data/repo';
import { remainingToTarget, totalSales } from '../domain/aggregate';
import { addItem, buildLines, cartTotal, decrementItem, EMPTY_CART, isCartEmpty, type Cart } from '../domain/cart';
import { addReceived, calcChange, confirmBlockers, exactReceived, RECEIVED_BUTTONS } from '../domain/payment';
import { availableSets, displayLowStock, remainingSets } from '../domain/setLimit';
import { canAddItem, isLowStock, remainingAfterCart, remainingStock } from '../domain/stock';
import { localDateOf, toLocalIsoString, todayLocalDate } from '../domain/time';
import { createTransaction, lastVoidableTransaction } from '../domain/transaction';
import {
  DESIGNS,
  GROUP_SIZE_LABELS,
  GROUP_SIZES,
  GROUP_TYPE_LABELS,
  GROUP_TYPES,
  ITEMS,
  type GroupSize,
  type GroupType,
  type ItemCode,
  type Transaction,
  type VrVisit,
} from '../domain/types';
import type { ItemLabels } from '../domain/itemLabels';
import { choice, choiceRow, meter, meterFill, panel, panelTitle, wrapName } from './ui';
import { ITEM_TONE } from '../lib/designs';
import { describeLines, hhmm, yen } from '../lib/format';
import { setSaleInProgress } from '../lib/pwa';
import { newUuid } from '../lib/uuid';

export function RegisterPage() {
  const { transactions, vrVisits, settings, deviceId, registerId, currentCashier, itemLabels } = usePos();
  const toast = useToast();
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [groupType, setGroupType] = useState<GroupType | null>(null);
  const [groupSize, setGroupSize] = useState<GroupSize | null>(null);
  const [received, setReceived] = useState(0);
  const [done, setDone] = useState<Transaction | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const confirmLock = useRef(false);

  const prices = settings.prices;
  const total = cartTotal(cart, prices);
  const remaining = useMemo(() => remainingStock(settings.initial_stock, transactions), [settings.initial_stock, transactions]);
  const afterCart = remainingAfterCart(remaining, cart);
  // セットの販売上限（D-30）。取消・テストを除いた販売済みのセット数から毎回計算する
  const setsLeft = useMemo(() => remainingSets(settings.set_limit, transactions), [settings.set_limit, transactions]);
  const canAdd = (item: ItemCode) => canAddItem(item, cart, remaining, setsLeft);
  const blockers = confirmBlockers({ cart, total, received, groupType, groupSize, cashierSelected: currentCashier !== null });
  const sales = useMemo(() => totalSales(transactions), [transactions]);
  const lastTx = lastVoidableTransaction(transactions, deviceId);

  // 会計の途中は、新しい版への切り替え（状態バーの［更新］）をさせない（D-28）
  const inSale = !isCartEmpty(cart) || received > 0 || groupType !== null || groupSize !== null;
  useEffect(() => {
    setSaleInProgress(inSale);
  }, [inSale]);
  useEffect(() => () => setSaleInProgress(false), []);

  // ---- お客さん用画面へ送る（失敗しても入力画面は止めない） ----
  const sender = useRef<ReturnType<typeof createDisplaySender> | null>(null);
  useEffect(() => {
    const s = createDisplaySender(registerId);
    sender.current = s;
    return () => {
      s.close();
      sender.current = null;
    };
  }, [registerId]);

  const soldOut = ITEMS.filter((i) => !canAddItem(i, EMPTY_CART, remaining, setsLeft));
  const soldOutKey = soldOut.join(',');
  // お客さん用画面の「あと◯枚」「あと◯セット」（D-30）。基準より多い商品は送らない
  const lowStock = displayLowStock(remaining, availableSets(remaining, setsLeft), settings.low_stock_threshold);
  const lowStockKey = JSON.stringify(lowStock);
  useEffect(() => {
    const lines = done ? done.lines : buildLines(cart, prices);
    const state: DisplayState = {
      register_id: registerId,
      mode: done ? 'done' : isCartEmpty(cart) ? 'idle' : 'cart',
      lines: lines.map(({ item, quantity, unit_price, amount }) => ({ item, quantity, unit_price, amount })),
      total: done ? done.total : total,
      received: done ? done.received : received,
      change: done ? done.change : calcChange(total, received),
      prices,
      labels: itemLabels,
      sold_out: soldOutKey ? (soldOutKey.split(',') as ItemCode[]) : [],
      low_stock: JSON.parse(lowStockKey) as Partial<Record<ItemCode, number>>,
      is_test: settings.test_mode,
      updated_at_ms: Date.now(),
    };
    try {
      sender.current?.send(state);
    } catch (err) {
      console.warn('[display]', err);
    }
  }, [cart, received, done, prices, itemLabels, total, registerId, soldOutKey, lowStockKey, settings.test_mode]);

  // ---- 操作 ----
  const beginIfDone = () => {
    if (done) setDone(null);
  };

  const tapItem = (item: ItemCode) => {
    beginIfDone();
    if (!canAdd(item)) return;
    setCart((c) => addItem(c, item));
  };

  const confirm = () => {
    if (confirmLock.current || blockers.length > 0 || groupType === null || groupSize === null || currentCashier === null) return;
    confirmLock.current = true;
    const t = createTransaction({
      transactionId: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      cart,
      prices,
      groupType,
      groupSize,
      received,
      registerId,
      deviceId,
      cashierId: currentCashier.cashier_id, // 確定時の担当者を焼き込む（D-27）
      isTest: settings.test_mode,
    });
    saveTransaction(t); // await しない（オフラインでは解決しないため）
    setDone(t);
    setCart(EMPTY_CART);
    setGroupType(null);
    setGroupSize(null);
    setReceived(0);
    setTimeout(() => (confirmLock.current = false), 500);
  };

  const undoLast = () => {
    if (!lastTx) return;
    voidTransaction(lastTx.transaction_id);
    if (done?.transaction_id === lastTx.transaction_id) setDone(null);
    toast(`取り消しました：${hhmm(lastTx.timestamp)} ${describeLines(lastTx.lines, itemLabels)} ${yen(lastTx.total)}`);
  };

  const clearAll = () => {
    setCart(EMPTY_CART);
    setGroupType(null);
    setGroupSize(null);
    setReceived(0);
    setDone(null);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-4 max-[900px]:grid-cols-[minmax(0,1fr)] max-[600px]:gap-3">
      {currentCashier === null && (
        <p
          className="col-span-full m-0 rounded-(--radius) border-2 border-warn bg-warn-soft px-4 py-3 font-bold text-warn"
          role="alert"
        >
          担当者が選ばれていません。画面上部の「担当」で、いまレジに立っている人を選んでください。
        </p>
      )}
      {/* スマホ幅では左右の列をほどいて、合計・確定ボタンを上に、VR・売上を下に並べ替える */}
      <section className="grid gap-3 max-[600px]:contents">
        <div className={panel}>
          <h2 className={panelTitle()}>商品</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {ITEMS.map((item) => {
              const enabled = canAdd(item);
              const low = item !== 'set' && isLowStock(remaining[item], settings.low_stock_threshold);
              // セットは「残り◯セット」：販売上限の残りと3絵柄の在庫の少ない方から、カートの分を引いた数（D-30）
              const stockOut = !canAddItem(item, cart, remaining, Infinity);
              const stockText =
                item === 'set'
                  ? stockOut
                    ? '在庫なし'
                    : `残り ${availableSets(afterCart, setsLeft - cart.set)}セット`
                  : enabled
                    ? `残り ${afterCart[item]}`
                    : '在庫なし';
              return (
                <button key={item} className={itemButton(item, low)} disabled={!enabled} onClick={() => tapItem(item)}>
                  <ItemArt item={item} className="max-[600px]:size-12" />
                  <span className="flex min-w-0 flex-col pr-[30px] max-[600px]:items-center max-[600px]:pr-0">
                    <span
                      className={`text-[1.6rem] leading-[1.15] font-extrabold text-(--tone-ink) max-[600px]:text-[1.1rem] max-[600px]:leading-[1.2] ${wrapName}`}
                    >
                      {itemLabels[item]}
                    </span>
                    <span className="text-[1.1rem] font-semibold">{yen(prices[item])}</span>
                    <span className={`text-[0.85rem] ${low ? 'font-bold text-warn' : 'text-text-2'}`}>
                      {stockText}
                      {low && enabled && ' ・残りわずか'}
                    </span>
                  </span>
                  {cart[item] > 0 && (
                    <span className="item-count absolute top-2 right-2 grid h-8 min-w-8 place-items-center rounded-2xl bg-accent px-2 font-extrabold text-accent-ink">
                      {cart[item]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <StockLine remaining={remaining} threshold={settings.low_stock_threshold} labels={itemLabels} />
        </div>

        <div className={panel}>
          <h2 className={panelTitle()}>
            カート
            {!isCartEmpty(cart) && (
              <button className="btn btn--ghost btn--sm" onClick={clearAll}>
                全部クリア
              </button>
            )}
          </h2>
          {isCartEmpty(cart) ? (
            <p className="muted">{done ? '次の会計は商品ボタンから始まります' : '商品ボタンを押してください'}</p>
          ) : (
            <ul className="cart-list m-0 grid list-none gap-1.5 p-0">
              {buildLines(cart, prices).map((l) => (
                <li
                  key={l.item}
                  className={`${ITEM_TONE[l.item]} grid grid-cols-[1fr_auto_90px] items-center gap-2.5 border-l-6 border-l-(--tone) pl-2 max-[600px]:grid-cols-[1fr_auto_72px] ${l.item === 'set' ? '[border-image:var(--set-edge)_1]' : ''}`}
                >
                  <span className={`inline-flex flex-wrap items-center gap-2 text-[1.1rem] font-bold text-(--tone-ink) ${wrapName}`}>
                    <ItemArt item={l.item} className="size-10 max-[600px]:size-8" />
                    {itemLabels[l.item]}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <button className="btn btn--icon" aria-label="1つ減らす" onClick={() => setCart((c) => decrementItem(c, l.item))}>
                      −
                    </button>
                    <span className="num min-w-7 text-center text-[1.2rem] font-bold">{l.quantity}</span>
                    <button
                      className="btn btn--icon"
                      aria-label="1つ増やす"
                      disabled={!canAdd(l.item)}
                      onClick={() => setCart((c) => addItem(c, l.item))}
                    >
                      ＋
                    </button>
                  </span>
                  <span className="num text-right font-semibold">{yen(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <VrCounter vrVisits={vrVisits} deviceId={deviceId} registerId={registerId} isTest={settings.test_mode} />
      </section>

      <section className="grid gap-3 max-[600px]:contents">
        <div className={panel}>
          <h2 className={panelTitle()}>客層</h2>
          <div className={choiceRow}>
            {GROUP_TYPES.map((g) => (
              <button
                key={g}
                className={choice({ on: groupType === g })}
                aria-pressed={groupType === g}
                onClick={() => {
                  beginIfDone();
                  setGroupType(g);
                }}
              >
                {GROUP_TYPE_LABELS[g]}
              </button>
            ))}
          </div>
          <h2 className={panelTitle(true)}>人数</h2>
          <div className={choiceRow}>
            {GROUP_SIZES.map((n) => (
              <button
                key={n}
                className={choice({ on: groupSize === n })}
                aria-pressed={groupSize === n}
                onClick={() => {
                  beginIfDone();
                  setGroupSize(n);
                }}
              >
                {GROUP_SIZE_LABELS[n]}
              </button>
            ))}
          </div>
          <h2 className={panelTitle(true)}>預かり金</h2>
          <div className={choiceRow}>
            <button className={choice()} disabled={isCartEmpty(cart)} onClick={() => setReceived(exactReceived(total))}>
              ちょうど
            </button>
            {RECEIVED_BUTTONS.map((a) => (
              <button
                key={a}
                className={choice()}
                onClick={() => {
                  beginIfDone();
                  setReceived((r) => addReceived(r, a));
                }}
              >
                {a.toLocaleString()}
              </button>
            ))}
            <button className={choice({ muted: true })} disabled={received === 0} onClick={() => setReceived(0)}>
              クリア
            </button>
          </div>
        </div>

        {/* スマホ幅では画面の下に固定して、スクロールしても確定ボタンを押せるようにする */}
        <div
          className={`${panel} max-[600px]:sticky max-[600px]:bottom-0 max-[600px]:z-10 max-[600px]:order-1 max-[600px]:shadow-[0_-4px_16px_rgb(0_0_0/0.12)]`}
        >
          {done ? (
            <div className="grid justify-items-center gap-1.5 text-center">
              <div className="text-[1.2rem] text-text-2">お釣り</div>
              <div className="done-change text-[clamp(3rem,9vw,5.5rem)] leading-[1.1] font-extrabold text-ok">{yen(done.change)}</div>
              <div className="mb-2 text-text-2">
                合計 {yen(done.total)} ／ 預かり {yen(done.received)}
              </div>
              <button className="btn btn--lg" onClick={() => setDone(null)}>
                次の会計へ
              </button>
            </div>
          ) : (
            <>
              <dl className="mt-0 mb-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
                <dt className="text-text-2">合計</dt>
                <dd className={`summary-total ${summaryValue} text-[2.2rem] max-[600px]:text-[1.8rem]`}>{yen(total)}</dd>
                <dt className="text-text-2">預かり</dt>
                <dd className={`${summaryValue} ${summarySize}`}>{yen(received)}</dd>
                <dt className="text-text-2">お釣り</dt>
                <dd className={`${summaryValue} ${summarySize} text-ok`}>
                  {received >= total && total > 0 ? yen(calcChange(total, received)) : '—'}
                </dd>
              </dl>
              {blockers.length > 0 && !isCartEmpty(cart) && (
                <ul className="mt-0 mb-2.5 rounded-lg bg-warn-soft py-2 pr-3 pl-7 text-[0.95rem] font-semibold text-warn">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <button className="btn btn--confirm btn--xl" disabled={blockers.length > 0} onClick={confirm}>
                <span className="btn-mark" aria-hidden>
                  ✓
                </span>
                会計確定
              </button>
            </>
          )}
        </div>

        <div className={`${panel} grid grid-cols-[1fr_auto] gap-2`}>
          <button className="btn btn--undo" disabled={!lastTx} onClick={undoLast}>
            <span className="btn-mark" aria-hidden>
              ↶
            </span>
            直前の取消
            {lastTx && (
              <small>
                {hhmm(lastTx.timestamp)} {yen(lastTx.total)}
              </small>
            )}
          </button>
          <button className="btn" onClick={() => setHistoryOpen(true)}>
            会計一覧
          </button>
        </div>

        <div className={`progress ${panel} max-[600px]:order-3`}>
          <div className="mb-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-text-2">
            <span>
              売上 <strong className="num text-text">{yen(sales)}</strong>
            </span>
            <span>
              {remainingToTarget(sales, settings.target_amount) === 0
                ? '黒字達成！'
                : `黒字まであと ${yen(remainingToTarget(sales, settings.target_amount))}`}
            </span>
          </div>
          <div className={meter} role="meter" aria-valuemin={0} aria-valuemax={settings.target_amount} aria-valuenow={sales}>
            <div className={meterFill} style={{ width: `${Math.min(100, (sales / settings.target_amount) * 100)}%` }} />
          </div>
        </div>
      </section>

      {historyOpen && <HistoryDialog onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

/** 合計・預かり・お釣りの金額 */
const summaryValue = 'm-0 text-right font-bold tabular-nums';
const summarySize = 'text-[1.4rem] max-[600px]:text-[1.15rem]';

/**
 * 商品ボタン。絵柄の色は左の太い帯で示し、セットは3絵柄の色をつないだ帯にする。
 * 残りわずかは外側の太い枠で知らせる。スマホ幅では画像を上・文字を下にする。item-btn・item-btn--set はテストの目印
 */
function itemButton(item: ItemCode, low: boolean): string {
  const base =
    'item-btn relative flex min-h-28 cursor-pointer touch-manipulation flex-row items-center justify-start gap-3 rounded-[14px] border-2 border-l-12 border-border px-3.5 py-2.5 text-left text-text active:not-disabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 max-[600px]:min-h-23 max-[600px]:flex-col max-[600px]:justify-center max-[600px]:gap-0.5 max-[600px]:px-1.5 max-[600px]:py-2 max-[600px]:text-center';
  const tone =
    item === 'set'
      ? 'item-btn--set border-l-transparent [background:var(--set-edge)_0_0/12px_100%_no-repeat_border-box,var(--surface)] active:not-disabled:[background:var(--set-edge)_0_0/12px_100%_no-repeat_border-box,var(--surface-2)]'
      : 'border-l-(--tone) bg-surface active:not-disabled:bg-surface-2';
  return `${ITEM_TONE[item]} ${base} ${tone} ${low ? 'shadow-[0_0_0_3px_var(--warn)]' : ''}`;
}

function StockLine({ remaining, threshold, labels }: { remaining: Record<string, number>; threshold: number; labels: ItemLabels }) {
  return (
    <p className="stock-line mt-2.5 mb-0 flex flex-wrap gap-1.5 text-[0.9rem] text-text-2">
      在庫：
      {DESIGNS.map((d) => {
        const low = isLowStock(remaining[d], threshold);
        return (
          <span
            key={d}
            className={`${ITEM_TONE[d]} inline-flex items-center gap-1.5 rounded-full border-2 py-0.5 pr-3 pl-1 font-bold ${wrapName} ${low ? 'border-warn bg-warn-soft text-warn' : 'border-(--tone) bg-surface text-(--tone-ink)'}`}
          >
            <ItemArt item={d} className="size-7" />
            {labels[d]} {remaining[d]}枚
            {low && <strong className="text-[0.8rem]">残りわずか</strong>}
          </span>
        );
      })}
    </p>
  );
}

function VrCounter(props: { vrVisits: VrVisit[]; deviceId: string; registerId: string; isTest: boolean }) {
  const { vrVisits, deviceId, registerId, isTest } = props;
  const toast = useToast();
  const today = todayLocalDate();
  // テストモード中は練習分の件数を表示する
  const active = vrVisits.filter((v) => !v.is_void && v.is_test === isTest);
  const todayCount = active.filter((v) => localDateOf(v.timestamp) === today).length;
  const last = active
    .filter((v) => v.device_id === deviceId)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];

  const add = () => {
    saveVrVisit({
      visit_id: newUuid(),
      timestamp: toLocalIsoString(new Date()),
      register_id: registerId,
      device_id: deviceId,
      is_void: false,
      voided_at: null,
      is_test: isTest,
    });
  };

  const undo = () => {
    if (!last) return;
    voidVrVisit(last.visit_id);
    toast(`VR体験 ${hhmm(last.timestamp)} の記録を取り消しました`);
  };

  return (
    <div className={`${panel} max-[600px]:order-2`}>
      <h2 className={panelTitle()}>VR体験者</h2>
      <div className="flex items-center gap-2.5">
        <div className="vr-count flex-1 font-bold">
          <span className="num mr-0.5 text-[2rem]">{todayCount}</span>人<small className="font-normal text-muted">（本日）</small>
        </div>
        <button className="btn btn--strong btn--lg" onClick={add}>
          ＋1人
        </button>
        <button className="btn btn--undo" disabled={!last} onClick={undo}>
          <span className="btn-mark" aria-hidden>
            ↶
          </span>
          取消
        </button>
      </div>
    </div>
  );
}
