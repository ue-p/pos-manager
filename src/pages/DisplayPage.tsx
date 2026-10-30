// お客さん用画面（F-05, F-02 の表示側）。ログイン不要・表示のみ
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subscribeDisplay, type DisplayState } from '../data/displaySync';
import { ITEM_LABELS, ITEMS, type ItemCode } from '../domain/types';
import { ItemArt } from '../components/ItemArt';
import { setContentsNote } from '../domain/itemLabels';
import { ITEM_TONE } from '../lib/designs';
import { yen } from '../lib/format';
import { APP_VERSION } from '../lib/pwa';
import { wrapName } from './ui';

const DONE_SHOW_MS = 10_000;

export function DisplayPage() {
  const [params] = useSearchParams();
  const registerId = params.get('reg') || 'reg_1';
  const [state, setState] = useState<DisplayState | null>(null);
  const [doneExpired, setDoneExpired] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => subscribeDisplay(registerId, setState), [registerId]);

  // 確定後のお釣りは約10秒表示してから待機表示へ（D-09）
  useEffect(() => {
    setDoneExpired(false);
    if (state?.mode !== 'done') return;
    const id = setTimeout(() => setDoneExpired(true), DONE_SHOW_MS);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // シールの表示名はレジ画面が表示データで送る（D-29）。古い版のレジからのデータには無いので「案N」
  const labels = state?.labels ?? ITEM_LABELS;
  const mode = state === null ? 'waiting' : state.mode === 'done' && doneExpired ? 'idle' : state.mode;

  return (
    // display はテストの目印。背景はダークのときグラデーションになる（--display-bg）
    <div className="display relative grid min-h-dvh place-items-center p-[clamp(16px,4vw,48px)] text-text [background:var(--display-bg,var(--bg))]">
      {!fullscreen && document.fullscreenEnabled && (
        <button
          className="absolute top-3 right-3 min-h-12 cursor-pointer rounded-[10px] border border-border bg-surface px-4 py-0 opacity-60"
          onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
        >
          全画面
        </button>
      )}
      {state?.is_test && (
        <div className="display-test absolute top-3 left-3 rounded-md bg-test px-2.5 py-0.5 text-[0.85rem] font-extrabold text-white">
          TEST
        </div>
      )}
      {/* 開店前に全端末で版がそろっているかを確かめるため、隅に小さく出す（D-28） */}
      <div
        className="pointer-events-none absolute right-3 bottom-2 text-[0.75rem] text-muted tabular-nums opacity-70"
        data-testid="display-version"
      >
        版 {APP_VERSION}
      </div>

      {mode === 'waiting' && (
        <p className="text-[1.2rem] text-muted">レジからの表示を待っています（{registerId}）</p>
      )}

      {mode === 'idle' && state && (
        <div className="w-[min(1100px,100%)] text-center">
          <h1 className="mb-[clamp(16px,4vw,40px)] text-[clamp(1.8rem,5vw,3.4rem)]">DA研 オリジナルシール</h1>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,42vw),1fr))] gap-[clamp(10px,2vw,24px)]">
            {ITEMS.map((item) => {
              const soldOut = state.sold_out.includes(item);
              const low = state.low_stock?.[item];
              return (
                <div key={item} className={menuCard(item, soldOut)}>
                  <ItemArt
                    item={item}
                    size="lg"
                    className="h-[clamp(120px,30vh,320px)] w-full max-[600px]:h-[clamp(96px,18vh,160px)]"
                  />
                  <div
                    className={`text-[clamp(1.6rem,4vw,2.6rem)] leading-[1.2] font-extrabold text-(--tone-ink) max-[600px]:text-[1.3rem] ${wrapName}`}
                  >
                    {labels[item]}
                  </div>
                  <div className="text-[clamp(1.4rem,3.5vw,2.4rem)] font-bold text-text">
                    {soldOut ? '売り切れ' : yen(state.prices[item])}
                  </div>
                  {/* 「残りわずか」の基準以下になったら残り数を出す。基準より多いときは出さず、0 は「売り切れ」だけ（D-30） */}
                  {!soldOut && low !== undefined && (
                    <div className="mt-1 rounded-full bg-warn-soft px-3 py-0.5 text-[clamp(1rem,2.4vw,1.6rem)] font-bold text-warn">
                      あと{low}
                      {item === 'set' ? 'セット' : '枚'}
                    </div>
                  )}
                  {item === 'set' && (
                    <div className="menu-note mt-1.5 text-text-2">{setContentsNote(labels)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(mode === 'cart' || mode === 'done') && state && (
        <div className="grid max-h-full w-[min(900px,100%)] gap-[clamp(12px,3vw,28px)]">
          <table className="display-lines w-full border-collapse text-[clamp(1.3rem,3.5vw,2.2rem)]">
            <tbody>
              {state.lines.map((l) => (
                <tr key={l.item} className={ITEM_TONE[l.item]}>
                  <td className={lineCell}>
                    <span
                      className={`inline-flex flex-wrap items-center gap-1 font-bold text-(--tone-ink) ${wrapName}`}
                    >
                      <ItemArt item={l.item} className="size-[clamp(40px,7vw,72px)]" />
                      {labels[l.item]}
                    </span>
                  </td>
                  {/* 金額は折り返さず、長い名前のほうを折り返す */}
                  <td className={`num ${lineCell} text-right whitespace-nowrap`}>
                    {yen(l.unit_price)} × {l.quantity}
                  </td>
                  <td className={`num ${lineCell} text-right whitespace-nowrap`}>{yen(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={`display-total ${amountRow} text-[clamp(2.2rem,7vw,4.5rem)] font-extrabold`}>
            <span>合計</span>
            <span className="num">{yen(state.total)}</span>
          </div>
          {(state.received > 0 || mode === 'done') && (
            <div className="display-pay grid gap-2 text-[clamp(1.4rem,4vw,2.6rem)] font-bold text-text-2">
              <div className={amountRow}>
                <span>お預かり</span>
                <span className="num">{yen(state.received)}</span>
              </div>
              {(mode === 'done' || state.received >= state.total) && (
                <div
                  className={`display-change ${amountRow} text-[clamp(2.2rem,7vw,4.5rem)] font-extrabold text-ok`}
                >
                  <span>お釣り</span>
                  <span className="num">{yen(state.change)}</span>
                </div>
              )}
            </div>
          )}
          {mode === 'done' && (
            <p className="display-thanks m-0 text-center text-[clamp(1.4rem,4vw,2.4rem)] font-bold">
              ありがとうございました！
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** 明細の行のセル */
const lineCell = 'border-b border-(--grid) px-1 py-2';
/** 「合計」「お預かり」「お釣り」の行（名前は左、金額は右） */
const amountRow = 'flex items-baseline justify-between';

/**
 * 待機中の商品のカード。絵柄の色は上の太い帯で示し、セットは3絵柄の色をつないだ帯にする。
 * menu-card・menu-card--set はテストの目印
 */
function menuCard(item: ItemCode, soldOut: boolean): string {
  const base =
    'menu-card flex min-w-0 flex-col items-center gap-1.5 rounded-[20px] border-2 border-t-12 border-border px-3 py-[clamp(12px,2vw,24px)]';
  const tone =
    item === 'set'
      ? 'menu-card--set border-t-transparent [background:var(--set-edge-h)_0_0/100%_12px_no-repeat_border-box,var(--surface)]'
      : 'border-t-(--tone) bg-surface';
  return `${ITEM_TONE[item]} ${base} ${tone} ${soldOut ? 'opacity-45' : ''}`;
}
