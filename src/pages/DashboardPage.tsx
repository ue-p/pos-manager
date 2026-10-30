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
import { remainingSets, soldSets } from '../domain/setLimit';
import { remainingStock } from '../domain/stock';
import { todayLocalDate } from '../domain/time';
import { DESIGNS, GROUP_TYPE_LABELS, ITEMS } from '../domain/types';
import { percent, yen } from '../lib/format';
import { meter, meterFill, panel, panelTitle, small, subTitle, table, tableScroll, td, th } from './ui';

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
  // セットの販売上限は全期間で数える（D-30）
  const setsSold = soldSets(transactions);
  const setsLeft = remainingSets(settings.set_limit, transactions);
  const sheets = s.soldByDesign.design_1 + s.soldByDesign.design_2 + s.soldByDesign.design_3;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>期間</span>
        <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
          <button className={segButton(date === null)} onClick={() => setDate(null)}>
            全期間
          </button>
          {dates.map((d) => (
            <button key={d} className={segButton(date === d)} onClick={() => setDate(d)}>
              {d.slice(5).replace('-', '/')}
              {d === today && '（今日）'}
            </button>
          ))}
        </div>
        <span className={`muted ${small}`}>取消・テストモードの記録は含みません</span>
      </div>

      <section className={`${panel} grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-10 gap-y-4 max-[900px]:grid-cols-[minmax(0,1fr)]`}>
        <div>
          <div className={heroLabel}>売上{date ? `（${date.slice(5).replace('-', '/')}）` : '（全期間）'}</div>
          <div className="hero-value text-[clamp(2.6rem,7vw,3.6rem)] leading-[1.1] font-extrabold">{yen(s.sales)}</div>
        </div>
        <div>
          <div className={heroLabel}>
            累計 {yen(cumulative)} ／ 目標 {yen(settings.target_amount)}
          </div>
          <div className="mt-0.5 mb-2 text-[1.3rem] font-bold">{toTarget === 0 ? '黒字達成！' : `黒字まであと ${yen(toTarget)}`}</div>
          <div className={meter}>
            <div className={meterFill} style={{ width: `${Math.min(100, (cumulative / settings.target_amount) * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Tile label="会計数（組）" value={`${s.transactionCount}`} />
        <Tile label="販売枚数" value={`${sheets}枚`} />
        <Tile label="客単価" value={s.averageSpend === null ? '—' : yen(s.averageSpend)} />
        <Tile label="VR体験者" value={`${s.vrCount}人`} />
        <Tile label="購入率" value={percent(s.purchaseRate)} hint="購入組数 ÷ VR体験者数" />
        <Tile
          label="セット 販売済み／上限"
          value={`${setsSold}／${settings.set_limit}`}
          hint={`全期間・残り ${setsLeft}セット`}
        />
      </section>

      <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <section className={panel}>
          <h2 className={panelTitle()}>絵柄別の販売枚数</h2>
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
          <h3 className={subTitle}>商品別の販売数</h3>
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

        <section className={panel}>
          <h2 className={panelTitle()}>時間帯別の売上</h2>
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
              <details>
                <summary className="flex min-h-12 cursor-pointer items-center text-text-2">表で見る</summary>
                <table className={table}>
                  <thead>
                    <tr>
                      <th className={th(true)}>時間帯</th>
                      <th className={th(false)}>売上</th>
                      <th className={th(false)}>会計数</th>
                      <th className={th(false)}>VR体験者</th>
                      <th className={th(false)}>購入率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourly.map((h) => (
                      <tr key={h.hour}>
                        <td className={td()}>{h.hour}時台</td>
                        <td className={td(true)}>{yen(h.sales)}</td>
                        <td className={td(true)}>{h.transactions}</td>
                        <td className={td(true)}>{h.vrVisits}</td>
                        <td className={td(true)}>{percent(h.vrVisits === 0 ? null : h.transactions / h.vrVisits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </section>

        <section className={`${panel} col-span-full`}>
          <h2 className={panelTitle()}>客層別</h2>
          <div className={tableScroll}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th(true)}>客層</th>
                  <th className={th(false)}>組数</th>
                  <th className={th(false)}>人数</th>
                  <th className={th(false)}>売上</th>
                  <th className={th(false)}>客単価</th>
                  <th className={th(false)}>1組あたり枚数</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.group_type}>
                    <td className={td()}>{GROUP_TYPE_LABELS[g.group_type]}</td>
                    <td className={td(true)}>{g.transactions}</td>
                    <td className={td(true)}>{g.people}</td>
                    <td className={td(true)}>{yen(g.sales)}</td>
                    <td className={td(true)}>{g.averageSpend === null ? '—' : yen(g.averageSpend)}</td>
                    <td className={td(true)}>{g.averageSheets === null ? '—' : g.averageSheets.toFixed(1)}</td>
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

const heroLabel = 'text-[0.9rem] text-text-2';

/** 期間の切り替えボタン（選んでいるものは白く浮かせる） */
function segButton(on: boolean): string {
  return `min-h-11 cursor-pointer rounded-[9px] border-0 px-3.5 py-0 font-semibold ${on ? 'bg-surface text-text shadow-(--shadow)' : 'bg-transparent text-text-2'}`;
}

/** 数字のタイル。tile はテストの目印 */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`tile ${panel}`}>
      <div className="text-[0.85rem] text-text-2">{label}</div>
      <div className="text-[1.7rem] font-extrabold">{value}</div>
      {hint && <div className="text-[0.75rem] text-muted">{hint}</div>}
    </div>
  );
}
