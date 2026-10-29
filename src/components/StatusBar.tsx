import { Link } from 'react-router-dom';
import { usePos } from '../data/PosDataProvider';
import { backupStatus, lastExportMs } from '../domain/actionLog';
import { registerLabel } from '../lib/device';
import { formatAgo } from '../lib/format';
import { applyUpdate, useNeedRefresh, useSaleInProgress } from '../lib/pwa';
import { useNow } from '../lib/useNow';

/** 通信状態・未送信件数・レジ番号・最終エクスポートからの経過（F-08, D-11, D-25） */
export function StatusBar() {
  const { online, pendingCount, registerId, actionLogs } = usePos();
  const now = useNow(15_000);
  // 全端末の csv_export 記録のうち最新のもの（自端末のオフライン中の記録も含む）
  const { elapsedMin, warn: backupWarn } = backupStatus(lastExportMs(actionLogs), now);
  const needRefresh = useNeedRefresh();
  const saleInProgress = useSaleInProgress();

  return (
    <div className="status-bar">
      <span className={`pill ${online ? 'pill--ok' : 'pill--bad'}`}>
        <span className="dot" aria-hidden />
        {online ? 'オンライン' : 'オフライン'}
      </span>
      <span className={`pill ${pendingCount > 0 ? 'pill--warn' : ''}`}>未送信 {pendingCount}件</span>
      <span className="pill">{registerLabel(registerId)}</span>
      {needRefresh && (
        <span className="pill pill--update">
          新しい版があります
          {/* 会計の途中では切り替えない（D-28） */}
          <button className="btn btn--strong btn--sm" disabled={saleInProgress} onClick={applyUpdate}>
            {saleInProgress ? '会計のあとで更新' : '更新'}
          </button>
        </span>
      )}
      <Link to="/settings#export" className={`pill pill--link ${backupWarn ? 'pill--warn' : ''}`}>
        {elapsedMin === null ? '⚠ CSV未保存' : `${backupWarn ? '⚠ ' : ''}CSV保存 ${formatAgo(elapsedMin)}`}
      </Link>
    </div>
  );
}
