import { usePos } from '../data/PosDataProvider';
import { activeCashiers } from '../domain/cashier';

/**
 * 画面上部の「担当」：この端末の、いまレジに立っている担当者（D-27）。
 * 交代するときだけ選び直す。日付（日本時間）が変わると未選択に戻る。未選択のときは会計できない
 */
export function CashierPicker() {
  const { cashiers, currentCashier, setCurrentCashier } = usePos();
  const options = activeCashiers(cashiers);
  return (
    <label className={`cashier-picker ${currentCashier ? '' : 'cashier-picker--empty'}`}>
      <span>担当</span>
      <select
        aria-label="担当"
        value={currentCashier?.cashier_id ?? ''}
        onChange={(e) => setCurrentCashier(e.target.value || null)}
      >
        <option value="">{options.length === 0 ? '（設定画面で登録）' : '⚠ 選んでください'}</option>
        {options.map((c) => (
          <option key={c.cashier_id} value={c.cashier_id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
