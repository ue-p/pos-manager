// 1系列の棒グラフ（色は1色。値は棒の先に表示し、ホバー／タップで詳細を出す）
import { useState, type ReactNode } from 'react';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  tooltip?: ReactNode;
}

/** 横棒（カテゴリの比較用） */
export function HBarChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="hbar" role="img" aria-label={ariaLabel}>
      {data.map((d) => (
        <div
          key={d.key}
          className="hbar-row"
          tabIndex={0}
          onMouseEnter={() => setHover(d.key)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(d.key)}
          onBlur={() => setHover(null)}
        >
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track">
            <span className="hbar-bar" style={{ width: `${(d.value / max) * 100}%` }} />
            <span className="hbar-value num">{d.valueLabel}</span>
          </span>
          {hover === d.key && d.tooltip && <div className="chart-tip">{d.tooltip}</div>}
        </div>
      ))}
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}K` : String(n);
}

/** 縦棒（時間帯の推移用） */
export function ColumnChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [top, top / 2, 0];
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="colchart" role="img" aria-label={ariaLabel}>
      <div className="colchart-axis">
        {ticks.map((t) => (
          <span key={t} className="num">
            {compact(t)}
          </span>
        ))}
      </div>
      <div className="colchart-plot">
        <div className="colchart-grid">
          {ticks.map((t) => (
            <span key={t} />
          ))}
        </div>
        <div className="colchart-cols">
          {data.map((d) => (
            <div
              key={d.key}
              className={`colchart-col ${hover === d.key ? 'is-hover' : ''}`}
              tabIndex={0}
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.key)}
              onBlur={() => setHover(null)}
              onClick={() => setHover((h) => (h === d.key ? null : d.key))}
            >
              <div className="colchart-bar-area">
                <div className="colchart-bar" style={{ height: `${(d.value / top) * 100}%` }} />
              </div>
              <span className="colchart-label">{d.label}</span>
              {hover === d.key && d.tooltip && <div className="chart-tip chart-tip--col">{d.tooltip}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
