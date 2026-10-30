// 画面（src/pages）で共通に使う部品の Tailwind のクラス（D-31）。
// 同じ設定（背景色・枠の色など）がぶつかる組み合わせは、どちらか片方だけを出すよう関数にしている。
// btn・num・muted・tag・item-art・tone-* は src/components でも使うので、styles.css に残している

/** パネル（白い箱） */
export const panel = 'rounded-[14px] border border-border bg-surface px-4 py-3.5 shadow-(--shadow)';

/** パネルの見出し（h2）。選択ボタンの列の直後に置く見出しは、上の間隔を広げる */
export function panelTitle(afterRow = false): string {
  return `${afterRow ? 'mt-4' : 'mt-1'} mb-2.5 flex items-center justify-between gap-2 text-[0.95rem] text-text-2`;
}

/** パネルの中の小見出し（h3） */
export const subTitle = 'mt-4 mb-2 text-[0.9rem] text-text-2';

export const small = 'text-[0.85rem]';
export const error = 'text-bad';

/** ラベルつきの入力欄（label）。最初の span がラベル。field はテストの目印 */
export const field =
  'field grid gap-1 [&>span:first-child]:text-[0.85rem] [&>span:first-child]:font-semibold [&>span:first-child]:text-text-2';

/** 客層・人数・預かり金などの選択ボタンの列 */
export const choiceRow = 'flex flex-wrap gap-2';

/** 選択ボタン。on：選ばれている、muted：控えめな文字色、small：小さめ（施策ログのプリセット） */
export function choice(opts: { on?: boolean; muted?: boolean; small?: boolean } = {}): string {
  const { on = false, muted = false, small = false } = opts;
  const size = small ? 'min-h-12 flex-[0_1_auto] px-3.5 py-0 text-[0.95rem]' : 'min-h-14 flex-[1_1_0] text-[1.05rem]';
  const color = on ? 'border-accent bg-accent text-accent-ink' : `border-border bg-surface ${muted ? 'text-text-2' : ''}`;
  return `min-w-[72px] cursor-pointer touch-manipulation rounded-(--radius) border-2 font-bold disabled:opacity-40 max-[600px]:min-w-[60px] max-[600px]:text-[0.95rem] ${size} ${color}`;
}

/** 表 */
export const tableScroll = 'overflow-x-auto';
export const table = 'mt-2 w-full border-collapse text-[0.95rem]';
const cell = 'border-b border-(--grid) px-2.5 py-2 whitespace-nowrap';
/** 見出しのセル。2列目以降は右寄せ */
export function th(first: boolean): string {
  return `${cell} text-[0.85rem] font-semibold text-text-2 ${first ? 'text-left' : 'text-right'}`;
}
/** データのセル。数値（num）は右寄せ */
export function td(num = false): string {
  return `${cell} ${num ? 'num text-right' : 'text-left'}`;
}

/** 進み具合のメーター（黒字まで） */
export const meter = 'h-2.5 overflow-hidden rounded-[5px] bg-surface-2';
export const meterFill = 'h-full rounded-[5px] bg-(--series-1)';

/** 長いシールの表示名を枠の中で折り返す（D-29） */
export const wrapName = 'min-w-0 wrap-anywhere [word-break:normal]';
