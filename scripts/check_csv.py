"""エクスポートしたCSVを pandas で読み、列名・型・空欄なしを検査して簡単に集計する。

使い方:
    python scripts/check_csv.py pos_export_reg_1_20261103_143005.zip
    python scripts/check_csv.py 展開したフォルダ/

前処理なしで読めること（要件 6.3）を確かめるため、read_csv は既定の引数のみで呼ぶ。
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import pandas as pd

BOOL = "bool"
INT = "int"
STR = "str"

SCHEMAS: dict[str, dict[str, str]] = {
    "sales_lines.csv": {
        "transaction_id": STR, "line_no": INT, "timestamp": STR, "local_datetime": STR, "item": STR, "quantity": INT,
        "unit_price": INT, "amount": INT, "design_1_qty": INT, "design_2_qty": INT, "design_3_qty": INT,
        "group_type": STR, "group_size": INT, "register_id": STR, "device_id": STR,
        "is_void": BOOL, "is_test": BOOL,
    },
    "transactions.csv": {
        "transaction_id": STR, "timestamp": STR, "local_datetime": STR, "group_type": STR, "group_size": INT, "total": INT,
        "received": INT, "change": INT, "design_1_qty": INT, "design_2_qty": INT, "design_3_qty": INT,
        "total_sheets": INT, "set_qty": INT, "register_id": STR, "device_id": STR, "is_void": BOOL, "is_test": BOOL,
    },
    "vr_visits.csv": {
        "visit_id": STR, "timestamp": STR, "local_datetime": STR, "register_id": STR, "device_id": STR, "is_void": BOOL, "is_test": BOOL,
    },
    "action_logs.csv": {
        "log_id": STR, "timestamp": STR, "local_datetime": STR, "log_type": STR, "note": STR, "register_id": STR, "device_id": STR, "is_test": BOOL,
    },
    "register_closings.csv": {
        "closing_id": STR, "timestamp": STR, "local_datetime": STR, "business_date": STR, "register_id": STR, "device_id": STR,
        "system_cash_sales": INT, "counted_cash": INT, "float_amount": INT, "difference": INT, "is_test": BOOL,
    },
}

CODES = {
    "item": {"design_1", "design_2", "design_3", "set"},
    "group_type": {"family", "student", "adult", "other", "unknown"},
    "log_type": {"manual", "test_mode_on", "test_mode_off", "csv_export"},
}

TIMESTAMP_RE = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$"
# 日本時間（Asia/Tokyo）は UTC+9 固定（サマータイムなし）。tzdata が無い Windows でも動くよう固定値で変換する
JST_OFFSET = pd.Timedelta(hours=9)
LOCAL_DATETIME_RE = r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$"


def load(source: Path) -> dict[str, bytes]:
    if source.is_dir():
        return {name: (source / name).read_bytes() for name in SCHEMAS if (source / name).exists()}
    with zipfile.ZipFile(source) as z:
        return {name: z.read(name) for name in z.namelist() if name in SCHEMAS}


def check(name: str, raw: bytes, errors: list[str]) -> pd.DataFrame | None:
    if raw.startswith(b"\xef\xbb\xbf"):
        errors.append(f"{name}: BOM付きになっている")
    df = pd.read_csv(io.BytesIO(raw))
    expected = list(SCHEMAS[name])
    if list(df.columns) != expected:
        errors.append(f"{name}: 列が違う\n  期待: {expected}\n  実際: {list(df.columns)}")
        return None
    if len(df) == 0:
        return df
    if df.isna().any().any():
        cols = df.columns[df.isna().any()].tolist()
        errors.append(f"{name}: 空欄がある列 {cols}")
    for col, kind in SCHEMAS[name].items():
        dtype = df[col].dtype
        if kind == INT and not pd.api.types.is_integer_dtype(dtype):
            errors.append(f"{name}.{col}: 整数として読めない（{dtype}）")
        if kind == BOOL and not pd.api.types.is_bool_dtype(dtype):
            errors.append(f"{name}.{col}: 真偽値として読めない（{dtype}）")
    if not df["timestamp"].astype(str).str.match(TIMESTAMP_RE).all():
        errors.append(f"{name}.timestamp: オフセット付きISO 8601でない行がある")
    # local_datetime（Tableau 用。D-14）：形式と、timestamp を日本時間にしたものと一致するか
    local = df["local_datetime"].astype(str)
    if not local.str.match(LOCAL_DATETIME_RE).all():
        errors.append(f"{name}.local_datetime: 「YYYY-MM-DD HH:MM:SS」でない行がある")
    jst = (pd.to_datetime(df["timestamp"], utc=True, errors="coerce") + JST_OFFSET).dt.strftime("%Y-%m-%d %H:%M:%S")
    if not (local == jst).all():
        errors.append(f"{name}.local_datetime: timestamp を日本時間にした値と一致しない行がある")
    for col, allowed in CODES.items():
        if col in df.columns:
            bad = set(df[col]) - allowed
            if bad:
                errors.append(f"{name}.{col}: 不正なコード値 {bad}")
    return df


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    files = load(Path(sys.argv[1]))
    errors: list[str] = []
    missing = set(SCHEMAS) - set(files)
    if missing:
        errors.append(f"ファイルがない: {sorted(missing)}")
    frames = {name: check(name, raw, errors) for name, raw in files.items()}

    lines = frames.get("sales_lines.csv")
    txs = frames.get("transactions.csv")
    vrs = frames.get("vr_visits.csv")
    if lines is not None and txs is not None and len(txs) > 0:
        if not (lines["amount"] == lines["unit_price"] * lines["quantity"]).all():
            errors.append("sales_lines.csv: amount ≠ unit_price × quantity の行がある")
        line_totals = lines.groupby("transaction_id")["amount"].sum()
        merged = txs.set_index("transaction_id")["total"].to_frame().join(line_totals)
        if not (merged["total"] == merged["amount"]).all():
            errors.append("transactions.csv の total と明細の合計が一致しない会計がある")
        # total_sheets = 3絵柄の枚数の合計、set_qty = 明細のセット個数の合計（D-14。取消・テストも含めて検査）
        sheets = txs["design_1_qty"] + txs["design_2_qty"] + txs["design_3_qty"]
        if not (txs["total_sheets"] == sheets).all():
            errors.append("transactions.csv の total_sheets が design_1_qty〜design_3_qty の合計と一致しない会計がある")
        set_lines = lines[lines["item"] == "set"].groupby("transaction_id")["quantity"].sum()
        expected_sets = txs["transaction_id"].map(set_lines).fillna(0).astype(int)
        if not (txs["set_qty"] == expected_sets).all():
            errors.append("transactions.csv の set_qty が sales_lines.csv のセットの個数の合計と一致しない会計がある")

        valid = txs[~txs["is_void"] & ~txs["is_test"]]
        valid_lines = lines[~lines["is_void"] & ~lines["is_test"]]
        print(f"会計 {len(txs)}件（集計対象 {len(valid)}件）")
        print(f"売上 {valid['total'].sum():,}円")
        sold = {d: int(valid[f"{d}_qty"].sum()) for d in ("design_1", "design_2", "design_3")}
        print(f"絵柄別販売枚数 {sold}")
        print("商品別:", valid_lines.groupby("item")["quantity"].sum().to_dict())
        print("客層別売上:", valid.groupby("group_type")["total"].sum().to_dict())
        if vrs is not None:
            vr_n = int((~vrs["is_void"] & ~vrs["is_test"]).sum())
            rate = f"{len(valid) / vr_n:.1%}" if vr_n else "—"
            print(f"VR体験者 {vr_n}人 / 購入率 {rate}")

    logs = frames.get("action_logs.csv")
    if logs is not None and len(logs) > 0:
        # 自動記録（テストモード切替 D-24・CSVエクスポート D-25）は常に is_test=false
        auto = logs[logs["log_type"] != "manual"]
        if auto["is_test"].any():
            errors.append("action_logs.csv: 自動記録（test_mode_on/off・csv_export）に is_test=true の行がある")
        print("施策ログ:", logs["log_type"].value_counts().sort_index().to_dict())

    if errors:
        print("\nNG:")
        for e in errors:
            print(" -", e)
        return 1
    print("\nOK：すべてのCSVを前処理なしで読み込めました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
