// シールの表示名（D-29）。画面に出す名前だけを変えられる。CSV のコード値（design_1〜3, set）は変えない
import { DESIGNS, ITEM_LABELS, type DesignCode, type ItemCode } from './types';

export const ITEM_LABEL_MAX = 12;

/** 設定に保存する表示名（空欄・未設定は既定の「案N」） */
export type ItemLabelSettings = Partial<Record<DesignCode, string>>;
export type ItemLabels = Record<ItemCode, string>;

/** 文字数（絵文字なども1文字として数える） */
const charCount = (s: string) => [...s].length;

/** 画面に出す名前。未設定・空欄は「案1〜3」、セットは常に「セット」 */
export function resolveItemLabels(custom: ItemLabelSettings | undefined): ItemLabels {
  const out = { ...ITEM_LABELS };
  for (const d of DESIGNS) {
    const v = custom?.[d]?.trim();
    if (v) out[d] = v;
  }
  return out;
}

/** 入力中の表示名の確認。問題のある絵柄だけエラー文を返す（空欄は「既定に戻す」なので可） */
export function validateItemLabels(input: Record<DesignCode, string>): Partial<Record<DesignCode, string>> {
  const errors: Partial<Record<DesignCode, string>> = {};
  const resolved = resolveItemLabels(input);
  DESIGNS.forEach((d, i) => {
    const v = input[d].trim();
    if (v === '') return; // 空欄は既定の「案N」に戻すだけ
    // 重なりは「入力した側」にだけ出す：相手が前の絵柄か、空欄（既定の「案N」）のとき
    const clashes = DESIGNS.some(
      (o, j) => o !== d && resolved[o] === resolved[d] && (j < i || input[o].trim() === ''),
    );
    if (charCount(v) > ITEM_LABEL_MAX) errors[d] = `${ITEM_LABEL_MAX}文字以内で入力してください`;
    else if (v === ITEM_LABELS.set) errors[d] = '「セット」は使えません';
    else if (clashes) errors[d] = '他の絵柄と同じ名前です';
  });
  return errors;
}

/** お客さん用画面のセットの説明 */
export function setContentsNote(labels: ItemLabels): string {
  return `${DESIGNS.map((d) => labels[d]).join('・')} を1枚ずつ`;
}
