import { Link } from 'react-router-dom';
import { usePos } from '../data/PosDataProvider';
import { getLastExportAt, registerLabel } from '../lib/device';
import { useNow } from '../lib/useNow';

export const BACKUP_WARN_MINUTES = 30;

/** 通信状態・未送信件数・レジ番号・最終エクスポートからの経過（F-08, D-11） */
export function StatusBar() {
  const { online, pendingCount, registerId } = usePos();
  const now = useNow(15_000);
  const last = getLastExportAt();
  const elapsedMin = last === null ? null : Math.floor((now - last) / 60_000);
  const backupWarn = elapsedMin === null || elapsedMin >= BACKUP_WARN_MINUTES;

  return (
    <div className="status-bar">
      <span className={`pill ${online ? 'pill--ok' : 'pill--bad'}`}>
        <span className="dot" aria-hidden />
        {online ? 'オンライン' : 'オフライン'}
      </span>
      <span className={`pill ${pendingCount > 0 ? 'pill--warn' : ''}`}>未送信 {pendingCount}件</span>
      <span className="pill">{registerLabel(registerId)}</span>
      <Link to="/settings#export" className={`pill pill--link ${backupWarn ? 'pill--warn' : ''}`}>
        {elapsedMin === null ? '⚠ CSV未保存' : `${backupWarn ? '⚠ ' : ''}CSV保存 ${formatElapsed(elapsedMin)}前`}
      </Link>
    </div>
  );
}

function formatElapsed(min: number): string {
  if (min < 1) return '1分以内';
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}
