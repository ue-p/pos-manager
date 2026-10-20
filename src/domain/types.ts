// 商品・客層などのコード値と、Firestore / CSV と共通のデータ型（D-04, D-07, D-14）

export const DESIGNS = ['design_1', 'design_2', 'design_3'] as const;
export type DesignCode = (typeof DESIGNS)[number];

export const ITEMS = ['design_1', 'design_2', 'design_3', 'set'] as const;
export type ItemCode = (typeof ITEMS)[number];

export const GROUP_TYPES = ['family', 'student', 'adult', 'other', 'unknown'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export const GROUP_SIZES = [1, 2, 3, 4, 5] as const;
export type GroupSize = (typeof GROUP_SIZES)[number];

export const ITEM_LABELS: Record<ItemCode, string> = {
  design_1: '案1',
  design_2: '案2',
  design_3: '案3',
  set: 'セット',
};

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  family: '子連れ',
  student: '学生',
  adult: '大人',
  other: 'その他',
  unknown: '不明',
};

export const GROUP_SIZE_LABELS: Record<GroupSize, string> = {
  1: '1人',
  2: '2人',
  3: '3人',
  4: '4人',
  5: '5人以上',
};

export type DesignQty = Record<`${DesignCode}_qty`, number>;

export interface SaleLine extends DesignQty {
  line_no: number;
  item: ItemCode;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Transaction extends DesignQty {
  schema_version: 1;
  transaction_id: string;
  timestamp: string;
  group_type: GroupType;
  group_size: GroupSize;
  lines: SaleLine[];
  total: number;
  received: number;
  change: number;
  register_id: string;
  device_id: string;
  is_void: boolean;
  voided_at: string | null;
  is_test: boolean;
}

export interface VrVisit {
  visit_id: string;
  timestamp: string;
  register_id: string;
  device_id: string;
  is_void: boolean;
  voided_at: string | null;
  is_test: boolean;
}

export interface ActionLog {
  log_id: string;
  timestamp: string;
  note: string;
  register_id: string;
  device_id: string;
  is_test: boolean;
}

export interface RegisterClosing {
  closing_id: string;
  timestamp: string;
  business_date: string;
  register_id: string;
  device_id: string;
  system_cash_sales: number;
  counted_cash: number;
  float_amount: number;
  difference: number;
  is_test: boolean;
}

export type Prices = Record<ItemCode, number>;
export type Stock = Record<DesignCode, number>;

export interface Settings {
  prices: Prices;
  initial_stock: Stock;
  target_amount: number;
  test_mode: boolean;
  low_stock_threshold: number;
  float_amount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  prices: { design_1: 200, design_2: 200, design_3: 200, set: 500 },
  initial_stock: { design_1: 100, design_2: 100, design_3: 100 },
  target_amount: 40750,
  test_mode: false,
  low_stock_threshold: 10,
  float_amount: 0,
};

/** 集計・在庫計算の対象になる記録か（取消・テストを除外） */
export function isCounted(r: { is_void?: boolean; is_test: boolean }): boolean {
  return !r.is_void && !r.is_test;
}
