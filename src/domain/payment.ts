import { isCartEmpty, type Cart } from './cart';
import type { GroupSize, GroupType } from './types';

export const RECEIVED_BUTTONS = [500, 1000, 5000, 10000] as const;

/** 金額ボタン：押すたびに加算（D-08） */
export function addReceived(received: number, amount: number): number {
  return received + amount;
}

/** 「ちょうど」：預かり金を合計額に置き換える */
export function exactReceived(total: number): number {
  return total;
}

export function calcChange(total: number, received: number): number {
  return Math.max(0, received - total);
}

export interface ConfirmInput {
  cart: Cart;
  total: number;
  received: number;
  groupType: GroupType | null;
  groupSize: GroupSize | null;
}

/** 会計確定できるか。できない場合は足りない項目を日本語で返す */
export function confirmBlockers(input: ConfirmInput): string[] {
  const reasons: string[] = [];
  if (isCartEmpty(input.cart)) reasons.push('商品を選んでください');
  if (input.groupType === null) reasons.push('客層を選んでください');
  if (input.groupSize === null) reasons.push('人数を選んでください');
  if (!isCartEmpty(input.cart) && input.received < input.total) {
    reasons.push(input.received === 0 ? '預かり金を入れてください' : `預かり金が ${input.total - input.received} 円不足しています`);
  }
  return reasons;
}
