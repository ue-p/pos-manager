import { useEffect, useState } from 'react';

/** 一定間隔で現在時刻（ms）を更新する。localStorage の変化もすぐ反映するため pos-tick イベントでも更新 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    window.addEventListener('pos-tick', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('pos-tick', tick);
    };
  }, [intervalMs]);
  return now;
}

export function notifyTick(): void {
  window.dispatchEvent(new Event('pos-tick'));
}
