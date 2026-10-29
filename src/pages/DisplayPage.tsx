// お客さん用画面（F-05, F-02 の表示側）。ログイン不要・表示のみ
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subscribeDisplay, type DisplayState } from '../data/displaySync';
import { ITEM_LABELS, ITEMS } from '../domain/types';
import { ItemArt } from '../components/ItemArt';
import { setContentsNote } from '../domain/itemLabels';
import { ITEM_TONE } from '../lib/designs';
import { yen } from '../lib/format';
import { APP_VERSION } from '../lib/pwa';

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
    <div className="display">
      {!fullscreen && document.fullscreenEnabled && (
        <button className="display-fs" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
          全画面
        </button>
      )}
      {state?.is_test && <div className="display-test">TEST</div>}
      {/* 開店前に全端末で版がそろっているかを確かめるため、隅に小さく出す（D-28） */}
      <div className="display-version" data-testid="display-version">
        版 {APP_VERSION}
      </div>

      {mode === 'waiting' && <p className="display-wait">レジからの表示を待っています（{registerId}）</p>}

      {mode === 'idle' && state && (
        <div className="display-idle">
          <h1>DA研 オリジナルシール</h1>
          <div className="display-menu">
            {ITEMS.map((item) => {
              const soldOut = state.sold_out.includes(item);
              const low = state.low_stock?.[item];
              return (
                <div
                  key={item}
                  className={`menu-card ${ITEM_TONE[item]} ${item === 'set' ? 'menu-card--set' : ''} ${soldOut ? 'is-soldout' : ''}`}
                >
                  <ItemArt item={item} size="lg" className="menu-art" />
                  <div className="menu-name">{labels[item]}</div>
                  <div className="menu-price">{soldOut ? '売り切れ' : yen(state.prices[item])}</div>
                  {/* 「残りわずか」の基準以下になったら残り数を出す。基準より多いときは出さず、0 は「売り切れ」だけ（D-30） */}
                  {!soldOut && low !== undefined && (
                    <div className="menu-remaining">
                      残りわずか（あと{low}
                      {item === 'set' ? 'セット' : '枚'}）
                    </div>
                  )}
                  {item === 'set' && <div className="menu-note">{setContentsNote(labels)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(mode === 'cart' || mode === 'done') && state && (
        <div className="display-cart">
          <table className="display-lines">
            <tbody>
              {state.lines.map((l) => (
                <tr key={l.item} className={ITEM_TONE[l.item]}>
                  <td>
                    <span className="display-line-name">
                      <ItemArt item={l.item} />
                      {labels[l.item]}
                    </span>
                  </td>
                  <td className="num">
                    {yen(l.unit_price)} × {l.quantity}
                  </td>
                  <td className="num">{yen(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="display-total">
            <span>合計</span>
            <span className="num">{yen(state.total)}</span>
          </div>
          {(state.received > 0 || mode === 'done') && (
            <div className="display-pay">
              <div>
                <span>お預かり</span>
                <span className="num">{yen(state.received)}</span>
              </div>
              {(mode === 'done' || state.received >= state.total) && (
                <div className="display-change">
                  <span>お釣り</span>
                  <span className="num">{yen(state.change)}</span>
                </div>
              )}
            </div>
          )}
          {mode === 'done' && <p className="display-thanks">ありがとうございました！</p>}
        </div>
      )}
    </div>
  );
}
