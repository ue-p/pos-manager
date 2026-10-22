import { useEffect, useMemo, useState } from 'react';
import { usePos } from '../data/PosDataProvider';
import { voidTransaction } from '../data/repo';
import { compareByTime } from '../domain/transaction';
import { GROUP_SIZE_LABELS, GROUP_TYPE_LABELS } from '../domain/types';
import { registerLabel } from '../lib/device';
import { describeLines, yen } from '../lib/format';
import { useToast } from './Toast';

const PAGE = 30;

/** 過去の会計一覧。選んで取り消す（確認あり。D-05） */
export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { transactions, registerId } = usePos();
  const toast = useToast();
  const [onlyThisRegister, setOnlyThisRegister] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo(
    () =>
      transactions
        .filter((t) => !onlyThisRegister || t.register_id === registerId)
        .sort((a, b) => compareByTime(b, a)),
    [transactions, onlyThisRegister, registerId],
  );

  const doVoid = (id: string, label: string) => {
    if (!window.confirm(`この会計を取り消しますか？\n${label}\n（取消は元に戻せません）`)) return;
    voidTransaction(id);
    toast(`取り消しました：${label}`);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="会計一覧" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>会計一覧</h2>
          <label className="check">
            <input type="checkbox" checked={onlyThisRegister} onChange={(e) => setOnlyThisRegister(e.target.checked)} />
            {registerLabel(registerId)}のみ
          </label>
          <button className="btn" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="dialog-body">
          {rows.length === 0 && <p className="muted">会計はまだありません</p>}
          <ul className="history">
            {rows.slice(0, limit).map((t) => {
              const label = `${t.timestamp.slice(5, 10).replace('-', '/')} ${t.timestamp.slice(11, 16)} ${describeLines(t.lines)} ${yen(t.total)}`;
              return (
                <li key={t.transaction_id} className={t.is_void ? 'is-void' : ''}>
                  <div className="history-main">
                    <span className="num">{label}</span>
                    <span className="muted">
                      {GROUP_TYPE_LABELS[t.group_type]}・{GROUP_SIZE_LABELS[t.group_size]}・{registerLabel(t.register_id)}
                      {t.is_test && <span className="tag tag--test">テスト</span>}
                      {t.is_void && <span className="tag">取消済</span>}
                    </span>
                  </div>
                  {!t.is_void && (
                    <button className="btn btn--undo btn--sm" onClick={() => doVoid(t.transaction_id, label)}>
                      取消
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > limit && (
            <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
              さらに表示
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
