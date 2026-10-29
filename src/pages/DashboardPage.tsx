// ダッシュボード（F-12, F-15）。取消・テストを除いた会計から毎回計算する
import { useMemo, useState } from 'react';
import { ColumnChart, HBarChart } from '../components/Charts';
import { usePos } from '../data/PosDataProvider';
import {
  distinctDates,
  filterByDate,
  groupBreakdown,
  hourlyBreakdown,
  remainingToTarget,
  summarize,
  totalSales,
} from '../domain/aggregate';
import { remainingStock } from '../domain/stock';
import { todayLocalDate } from '../domain/time';
import { DESIGNS, GROUP_TYPE_LABELS, ITEMS } from '../domain/types';
import { percent, yen } from '../lib/format';

export function DashboardPage() {
  const { transactions, vrVisits, settings, itemLabels } = usePos();
  const dates = useMemo(() => distinctDates([...transactions, ...vrVisits]), [transactions, vrVisits]);
  const today = todayLocalDate();
  const [date, setDate] = useState<string | null>(() => (dates.includes(today) ? today : null));

  const txs = useMemo(() => filterByDate(transactions, date), [transactions, date]);
  const vrs = useMemo(() => filterByDate(vrVisits, date), [vrVisits, date]);
  const s = useMemo(() => summarize(txs, vrs), [txs, vrs]);
  const hourly = useMemo(() => hourlyBreakdown(txs, vrs), [txs, vrs]);
  const groups = useMemo(() => groupBreakdown(txs), [txs]);

  // 黒字進捗は常に累計（制作費の回収が目的のため）
  const cumulative = totalSales(transactions);
  const toTarget = remainingToTarget(cumulative, settings.target_amount);
  const remaining = remainingStock(settings.initial_stock, transactions);
  const sheets = s.soldByDesign.design_1 + s.soldByDesign.design_2 + s.soldByDesign.design_3;

  return (
    <div className="dashboard">
      <div className="dash-filter">
        <span>期間</span>
        <div className="seg">
          <button className={date === null ? 'on' : ''} onClick={() => setDate(null)}>
            全期間
          </button>
          {dates.map((d) => (
            <button key={d} className={date === d ? 'on' : ''} onClick={() => setDate(d)}>
              {d.slice(5).replace('-', '/')}
              {d === today && '（今日）'}
            </button>
          ))}
        </div>
        <span className="muted small">取消・テストモードの記録は含みません</span>
      </div>

      <section className="panel hero">
        <div>
          <div className="hero-label">売上{date ? `（${date.slice(5).replace('-', '/')}）` : '（全期間）'}</div>
          <div className="hero-value">{yen(s.sales)}</div>
        </div>
        <div className="hero-target">
          <div className="hero-label">
            累計 {yen(cumulative)} ／ 目標 {yen(settings.target_amount)}
          </div>
          <div className="hero-sub">{toTarget === 0 ? '黒字達成！' : `黒字まであと ${yen(toTarget)}`}</div>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.min(100, (cumulative / settings.target_amount) * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="tiles">
        <Tile label="会計数（組）" value={`${s.transactionCount}`} />
        <Tile label="販売枚数" value={`${sheets}枚`} />
        <Tile label="客単価" value={s.averageSpend === null ? '—' : yen(s.averageSpend)} />
        <Tile label="VR体験者" value={`${s.vrCount}人`} />
        <Tile label="購入率" value={percent(s.purchaseRate)} hint="購入組数 ÷ VR体験者数" />
      </section>

      <div className="dash-grid">
        <section className="panel">
          <h2 className="panel-title">絵柄別の販売枚数</h2>
          <HBarChart
            ariaLabel="絵柄別の販売枚数"
            data={DESIGNS.map((d) => ({
              key: d,
              label: itemLabels[d],
              value: s.soldByDesign[d],
              valueLabel: `${s.soldByDesign[d]}枚`,
              tooltip: (
                <>
                  <strong>{itemLabels[d]}</strong>
                  <br />
                  販売 {s.soldByDesign[d]}枚（セット分を含む）
                  <br />
                  在庫残り {remaining[d]}枚
                </>
              ),
            }))}
          />
          <h3 className="sub-title">商品別の販売数</h3>
          <HBarChart
            ariaLabel="商品別の販売数"
            data={ITEMS.map((i) => ({
              key: i,
              label: itemLabels[i],
              value: s.itemQuantities[i],
              valueLabel: `${s.itemQuantities[i]}個`,
            }))}
          />
        </section>

        <section className="panel">
          <h2 className="panel-title">時間帯別の売上</h2>
          {hourly.length === 0 ? (
            <p className="muted">データがありません</p>
          ) : (
            <>
              <ColumnChart
                ariaLabel="時間帯別の売上"
                data={hourly.map((h) => ({
                  key: String(h.hour),
                  label: `${h.hour}時`,
                  value: h.sales,
                  valueLabel: yen(h.sales),
                  tooltip: (
                    <>
                      <strong>
                        {h.hour}:00〜{h.hour}:59
                      </strong>
                      <br />
                      売上 {yen(h.sales)}
                      <br />
                      会計 {h.transactions}組・VR {h.vrVisits}人
                      <br />
                      購入率 {percent(h.vrVisits === 0 ? null : h.transactions / h.vrVisits)}
                    </>
                  ),
                }))}
              />
              <details className="table-view">
                <summary>表で見る</summary>
                <table className="table">
                  <thead>
                    <tr>
                      <th>時間帯</th>
                      <th>売上</th>
                      <th>会計数</th>
                      <th>VR体験者</th>
                      <th>購入率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourly.map((h) => (
                      <tr key={h.hour}>
                        <td>{h.hour}時台</td>
                        <td className="num">{yen(h.sales)}</td>
                        <td className="num">{h.transactions}</td>
                        <td className="num">{h.vrVisits}</td>
                        <td className="num">{percent(h.vrVisits === 0 ? null : h.transactions / h.vrVisits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </section>

        <section className="panel dash-wide">
          <h2 className="panel-title">客層別</h2>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>客層</th>
                  <th>組数</th>
                  <th>人数</th>
                  <th>売上</th>
                  <th>客単価</th>
                  <th>1組あたり枚数</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.group_type}>
                    <td>{GROUP_TYPE_LABELS[g.group_type]}</td>
                    <td className="num">{g.transactions}</td>
                    <td className="num">{g.people}</td>
                    <td className="num">{yen(g.sales)}</td>
                    <td className="num">{g.averageSpend === null ? '—' : yen(g.averageSpend)}</td>
                    <td className="num">{g.averageSheets === null ? '—' : g.averageSheets.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  );
}
