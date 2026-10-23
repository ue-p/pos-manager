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
import { canAddItem, isLowStock, remainingAfterCart, remainingStock } from '../domain/stock';
import { localDateOf, toLocalIsoString, todayLocalDate } from '../domain/time';
import { createTransaction, lastVoidableTransaction } from '../domain/transaction';
import {
  DESIGNS,
  GROUP_SIZE_LABELS,
  GROUP_SIZES,
  GROUP_TYPE_LABELS,
  GROUP_TYPES,
  ITEM_LABELS,
  ITEMS,
  type GroupSize,
  type GroupType,
  type ItemCode,
  type Transaction,
  type VrVisit,
} from '../domain/types';
import { ITEM_TONE } from '../lib/designs';
import { describeLines, hhmm, yen } from '../lib/format';
import { newUuid } from '../lib/uuid';

export function RegisterPage() {
  const { transactions, vrVisits, settings, deviceId, registerId, currentCashier } = usePos();
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
  const blockers = confirmBlockers({ cart, total, received, groupType, groupSize, cashierSelected: currentCashier !== null });
  const sales = useMemo(() => totalSales(transactions), [transactions]);
  const lastTx = lastVoidableTransaction(transactions, deviceId);

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

  const soldOut = ITEMS.filter((i) => !canAddItem(i, EMPTY_CART, remaining));
  const soldOutKey = soldOut.join(',');
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
      sold_out: soldOutKey ? (soldOutKey.split(',') as ItemCode[]) : [],
      is_test: settings.test_mode,
      updated_at_ms: Date.now(),
    };
    try {
      sender.current?.send(state);
    } catch (err) {
      console.warn('[display]', err);
    }
  }, [cart, received, done, prices, total, registerId, soldOutKey, settings.test_mode]);

  // ---- 操作 ----
  const beginIfDone = () => {
    if (done) setDone(null);
  };

  const tapItem = (item: ItemCode) => {
    beginIfDone();
    if (!canAddItem(item, cart, remaining)) return;
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
    toast(`取り消しました：${hhmm(lastTx.timestamp)} ${describeLines(lastTx.lines)} ${yen(lastTx.total)}`);
  };

  const clearAll = () => {
    setCart(EMPTY_CART);
    setGroupType(null);
    setGroupSize(null);
    setReceived(0);
    setDone(null);
  };

  return (
    <div className="register">
      {currentCashier === null && (
        <p className="register-alert" role="alert">
          担当者が選ばれていません。画面上部の「担当」で、いまレジに立っている人を選んでください。
        </p>
      )}
      <section className="register-left">
        <div className="panel">
          <h2 className="panel-title">商品</h2>
          <div className="item-grid">
            {ITEMS.map((item) => {
              const left =
                item === 'set' ? Math.min(...DESIGNS.map((d) => afterCart[d])) : afterCart[item];
              const enabled = canAddItem(item, cart, remaining);
              const low = item !== 'set' && isLowStock(remaining[item], settings.low_stock_threshold);
              return (
                <button
                  key={item}
                  className={`item-btn ${ITEM_TONE[item]} ${low ? 'item-btn--low' : ''} ${item === 'set' ? 'item-btn--set' : ''}`}
                  disabled={!enabled}
                  onClick={() => tapItem(item)}
                >
                  <ItemArt item={item} />
                  <span className="item-text">
                    <span className="item-name">{ITEM_LABELS[item]}</span>
                    <span className="item-price">{yen(prices[item])}</span>
                    <span className="item-stock">
                      {enabled ? `残り ${left}` : '在庫なし'}
                      {low && enabled && ' ・残りわずか'}
                    </span>
                  </span>
                  {cart[item] > 0 && <span className="item-count">{cart[item]}</span>}
                </button>
              );
            })}
          </div>
          <StockLine remaining={remaining} threshold={settings.low_stock_threshold} />
        </div>

        <div className="panel">
          <h2 className="panel-title">
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
            <ul className="cart-list">
              {buildLines(cart, prices).map((l) => (
                <li key={l.item} className={ITEM_TONE[l.item]}>
                  <span className="cart-name">
                    <ItemArt item={l.item} />
                    {ITEM_LABELS[l.item]}
                  </span>
                  <span className="cart-qty">
                    <button className="btn btn--icon" aria-label="1つ減らす" onClick={() => setCart((c) => decrementItem(c, l.item))}>
                      −
                    </button>
                    <span className="num">{l.quantity}</span>
                    <button
                      className="btn btn--icon"
                      aria-label="1つ増やす"
                      disabled={!canAddItem(l.item, cart, remaining)}
                      onClick={() => setCart((c) => addItem(c, l.item))}
                    >
                      ＋
                    </button>
                  </span>
                  <span className="cart-amount num">{yen(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <VrCounter vrVisits={vrVisits} deviceId={deviceId} registerId={registerId} isTest={settings.test_mode} />
      </section>

      <section className="register-right">
        <div className="panel">
          <h2 className="panel-title">客層</h2>
          <div className="choice-row">
            {GROUP_TYPES.map((g) => (
              <button
                key={g}
                className={`choice ${groupType === g ? 'choice--on' : ''}`}
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
          <h2 className="panel-title">人数</h2>
          <div className="choice-row">
            {GROUP_SIZES.map((n) => (
              <button
                key={n}
                className={`choice ${groupSize === n ? 'choice--on' : ''}`}
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
          <h2 className="panel-title">預かり金</h2>
          <div className="choice-row">
            <button className="choice" disabled={isCartEmpty(cart)} onClick={() => setReceived(exactReceived(total))}>
              ちょうど
            </button>
            {RECEIVED_BUTTONS.map((a) => (
              <button
                key={a}
                className="choice"
                onClick={() => {
                  beginIfDone();
                  setReceived((r) => addReceived(r, a));
                }}
              >
                {a.toLocaleString()}
              </button>
            ))}
            <button className="choice choice--muted" disabled={received === 0} onClick={() => setReceived(0)}>
              クリア
            </button>
          </div>
        </div>

        <div className="panel summary">
          {done ? (
            <div className="done">
              <div className="done-label">お釣り</div>
              <div className="done-change">{yen(done.change)}</div>
              <div className="done-detail">
                合計 {yen(done.total)} ／ 預かり {yen(done.received)}
              </div>
              <button className="btn btn--lg" onClick={() => setDone(null)}>
                次の会計へ
              </button>
            </div>
          ) : (
            <>
              <dl className="summary-grid">
                <dt>合計</dt>
                <dd className="summary-total">{yen(total)}</dd>
                <dt>預かり</dt>
                <dd>{yen(received)}</dd>
                <dt>お釣り</dt>
                <dd className="summary-change">{received >= total && total > 0 ? yen(calcChange(total, received)) : '—'}</dd>
              </dl>
              {blockers.length > 0 && !isCartEmpty(cart) && (
                <ul className="blockers">
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

        <div className="panel undo-row">
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

        <div className="panel progress">
          <div className="progress-text">
            <span>
              売上 <strong className="num">{yen(sales)}</strong>
            </span>
            <span>
              {remainingToTarget(sales, settings.target_amount) === 0
                ? '黒字達成！'
                : `黒字まであと ${yen(remainingToTarget(sales, settings.target_amount))}`}
            </span>
          </div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={settings.target_amount} aria-valuenow={sales}>
            <div className="meter-fill" style={{ width: `${Math.min(100, (sales / settings.target_amount) * 100)}%` }} />
          </div>
        </div>
      </section>

      {historyOpen && <HistoryDialog onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

function StockLine({ remaining, threshold }: { remaining: Record<string, number>; threshold: number }) {
  return (
    <p className="stock-line">
      在庫：
      {DESIGNS.map((d) => (
        <span key={d} className={`stock-chip ${ITEM_TONE[d]} ${isLowStock(remaining[d], threshold) ? 'low' : ''}`}>
          <ItemArt item={d} />
          {ITEM_LABELS[d]} {remaining[d]}枚
          {isLowStock(remaining[d], threshold) && <strong>残りわずか</strong>}
        </span>
      ))}
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
    <div className="panel vr">
      <h2 className="panel-title">VR体験者</h2>
      <div className="vr-row">
        <div className="vr-count">
          <span className="num">{todayCount}</span>人<small>（本日）</small>
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
