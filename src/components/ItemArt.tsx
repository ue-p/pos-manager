import { DESIGNS, type ItemCode } from '../domain/types';
import { DESIGN_IMAGES } from '../lib/designs';

/** 商品の画像。セットは3絵柄を重ねて見せる。文字ラベルは呼び出し側で必ず併記する（画像は装飾扱い） */
export function ItemArt({ item, size = 'sm', className = '' }: { item: ItemCode; size?: 'sm' | 'lg'; className?: string }) {
  if (item === 'set') {
    return (
      <span className={`item-art item-art--set ${className}`} aria-hidden>
        {DESIGNS.map((d) => (
          <img key={d} src={DESIGN_IMAGES[d][size]} alt="" draggable={false} />
        ))}
      </span>
    );
  }
  return (
    <span className={`item-art ${className}`} aria-hidden>
      <img src={DESIGN_IMAGES[item][size]} alt="" draggable={false} />
    </span>
  );
}
