// 絵柄の画像と代表色。画像は JS に data URL として埋め込み、オフラインでも表示できるようにする
// （元画像は design-assets/、変換は scripts/build_images.py）
import d1sm from '../assets/designs/design_1_sm.webp?inline';
import d1lg from '../assets/designs/design_1_lg.webp?inline';
import d2sm from '../assets/designs/design_2_sm.webp?inline';
import d2lg from '../assets/designs/design_2_lg.webp?inline';
import d3sm from '../assets/designs/design_3_sm.webp?inline';
import d3lg from '../assets/designs/design_3_lg.webp?inline';
import type { DesignCode, ItemCode } from '../domain/types';

export const DESIGN_IMAGES: Record<DesignCode, { sm: string; lg: string }> = {
  design_1: { sm: d1sm, lg: d1lg },
  design_2: { sm: d2sm, lg: d2lg },
  design_3: { sm: d3sm, lg: d3lg },
};

/** 商品ごとの色のクラス名（色の値は styles.css の --d1〜--d3 / --set で定義） */
export const ITEM_TONE: Record<ItemCode, string> = {
  design_1: 'tone-d1',
  design_2: 'tone-d2',
  design_3: 'tone-d3',
  set: 'tone-set',
};
