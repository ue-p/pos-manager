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
  /** 1：初版、2：cashier_id を追加（D-27） */
  schema_version: 1 | 2;
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
  /** 会計した担当者（cs_xxxx）。この機能より前の記録は読み込み時に unknown（D-27） */
  cashier_id: string;
  is_void: boolean;
  voided_at: string | null;
  is_test: boolean;
}

/** レジ担当者（D-27）。名前は呼び名・イニシャルで登録し、CSVには出さない。削除せず active=false で無効にする */
export interface Cashier {
  cashier_id: string;
  name: string;
  active: boolean;
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

/** 施策ログの種類：手入力 / テストモードをオンにした / オフにした（D-24）/ CSVをエクスポートした（D-25）/ セットの販売上限を変えた（D-30） */
export const LOG_TYPES = ['manual', 'test_mode_on', 'test_mode_off', 'csv_export', 'set_limit_change'] as const;
export type LogType = (typeof LOG_TYPES)[number];

export interface ActionLog {
  log_id: string;
  timestamp: string;
  log_type: LogType;
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
  /** レジ締めをした担当者（D-27） */
  cashier_id: string;
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
  /** シールの表示名（画面に出す名前だけ。空欄・未設定は「案N」。D-29） */
  item_labels: Partial<Record<DesignCode, string>>;
  /** セットの販売上限（0〜100セット。D-30） */
  set_limit: number;
}

export const DEFAULT_SETTINGS: Settings = {
  prices: { design_1: 200, design_2: 200, design_3: 200, set: 500 },
  initial_stock: { design_1: 100, design_2: 100, design_3: 100 },
  target_amount: 40750,
  test_mode: false,
  low_stock_threshold: 10,
  float_amount: 0,
  item_labels: {},
  set_limit: 100,
};

/** 集計・在庫計算の対象になる記録か（取消・テストを除外） */
export function isCounted(r: { is_void?: boolean; is_test: boolean }): boolean {
  return !r.is_void && !r.is_test;
}
