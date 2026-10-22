"""design-assets/ の絵柄画像を、アプリに同梱する WebP に変換する（開発時に1回実行する）。

使い方:
    python scripts/build_images.py

- 透明な余白を切り詰め、表示サイズに合わせて2種類に縮小する
    - src/assets/designs/design_N_sm.webp：商品ボタン・カート・在庫表示用（長辺 192px）
    - src/assets/designs/design_N_lg.webp：お客さん用画面の待機表示用（長辺 560px）
- 出力はアプリの JS に data URL として埋め込む（src/lib/designs.ts）。オフラインでも表示できるようにするため
- 元画像の名前：案1.png → design_1、案2.png → design_2、案3.png → design_3
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design-assets"
OUT = ROOT / "src" / "assets" / "designs"
SIZES = {"sm": 192, "lg": 560}
QUALITY = 82


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for n in (1, 2, 3):
        src = SRC / f"案{n}.png"
        im = Image.open(src).convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        if bbox:
            im = im.crop(bbox)
        for key, long_side in SIZES.items():
            scale = long_side / max(im.size)
            size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
            out = OUT / f"design_{n}_{key}.webp"
            im.resize(size, Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
            print(f"{src.name} -> {out.relative_to(ROOT)} {size} {out.stat().st_size / 1024:.1f}KB")


if __name__ == "__main__":
    main()
