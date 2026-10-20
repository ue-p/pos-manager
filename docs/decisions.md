# 実装上の決定事項（Decisions）

要件定義書（`docs/requirements.md`）に書かれていない／解釈が分かれる点について、実装方針をここで決める。
**要件定義書と矛盾したら要件定義書が優先**。ここを変更するときは、変更理由と日付を追記する。
「状態：提案」の項目は、実装前にユーザー（運営担当）に確認してから「確定」にする。

---

## D-01 技術スタック（状態：確定）

要件では「フレームワークは実装時に決める」とされているため、以下に決める。

| 用途 | 採用 | 理由 |
| --- | --- | --- |
| ビルド | Vite | 設定が少なく Firebase Hosting にそのまま載る |
| UI | React + TypeScript | 状態の多い会計画面を型で守る |
| ルーティング | react-router | 4画面を独立URLにするため |
| Firebase | Firebase JS SDK（modular API） | Auth / Firestore / Hosting |
| CSVまとめ | JSZip | 複数CSVを1回のダウンロードにする（D-13） |
| 単体テスト | Vitest | ドメインロジック（計算・CSV）を検証 |
| ルールのテスト | Firebase Emulator Suite + `@firebase/rules-unit-testing` | セキュリティルールの検証 |
| E2E（任意） | Playwright | オフライン（`context.setOffline(true)`）での会計を検証 |
| スタイル | 素のCSS（CSS Modules） | 依存を増やさない。ボタン48px以上を守りやすい |

## D-02 URL（状態：確定）

| パス | 画面 | ログイン |
| --- | --- | --- |
| `/` | スタッフ入力画面 | 必要 |
| `/display?reg=reg_1` | お客さん用画面 | 不要 |
| `/dashboard` | ダッシュボード | 必要 |
| `/settings` | 設定・エクスポート画面 | 必要 |
| `/login` | ログイン | — |

Firebase Hosting は SPA 用に全パスを `index.html` へ rewrite する。

## D-03 ID の発行（状態：確定）

- `transaction_id`：`crypto.randomUUID()`。「会計確定」を押した瞬間に1回だけ発行し、確定ボタンは直後に無効化する（連打で2件できないように）。
- `device_id`：初回起動時に `dev_` + 英数4桁を生成し、`localStorage` に保存。以後固定。
- `register_id`：端末ごとに設定画面で選ぶ（`reg_1`〜`reg_9`）。`localStorage` に保存。既定は `reg_1`。
- `vr_visits` / `action_logs` / `register_closings` のIDも端末側で UUID を発行し、ドキュメントIDにする。

## D-04 Firestore のドキュメント形（状態：確定）

フィールド名は CSV の列名と同じ snake_case にそろえ、エクスポート時の変換を最小にする。

```ts
// transactions/{transaction_id}
{
  schema_version: 1,
  transaction_id: string,
  timestamp: string,          // 端末時刻の ISO 8601（例 2026-11-03T14:05:22+09:00）
  created_at: Timestamp,      // serverTimestamp()。監査用。CSVには出さない
  group_type: 'family' | 'student' | 'adult' | 'other' | 'unknown',
  group_size: 1 | 2 | 3 | 4 | 5,   // 5 = 5人以上
  lines: Array<{
    line_no: number, item: 'design_1' | 'design_2' | 'design_3' | 'set',
    quantity: number, unit_price: number, amount: number,
    design_1_qty: number, design_2_qty: number, design_3_qty: number,
  }>,
  total: number, received: number, change: number,
  design_1_qty: number, design_2_qty: number, design_3_qty: number,  // 明細の合計
  register_id: string, device_id: string,
  is_void: boolean, voided_at: string | null,
  is_test: boolean,
}
```

- 明細は「商品ごとに1行」。案1を2枚なら `quantity: 2` の1行。
- セット1個は `design_1_qty = design_2_qty = design_3_qty = 1`（個数分）。

## D-05 取消（状態：確定）

- 取消は `is_void: true` と `voided_at` の2フィールドだけを更新する。他のフィールドは変更不可（ルールで強制）。取消の取り消し（復活）はしない。間違えたら入れ直す。
- 「直前の取消」＝この端末で確定した、まだ取り消していない最新の会計。ワンタップで実行し、何を取り消したかをトーストで表示する。
- 過去の会計は一覧から選んで取り消す（こちらは確認ダイアログあり）。

## D-06 テストモード（状態：確定）

- `settings/current.test_mode` に持ち、全端末で共有する（開店前の確認を1か所で済ませるため）。
- 会計確定時点の値を各ドキュメントの `is_test` に焼き込む。
- テストモード中は全画面（お客さん用画面を除く）の上部に、色付きの帯を常時表示する。
- 懸念：オフライン中の端末には切替が届かない。開店前チェックで全端末の帯が消えたことを目視確認する運用にする。
- 切替の記録・確認ダイアログ・お客さん用画面の表示は D-24 を参照。

## D-07 設定のドキュメント形（状態：確定）

```ts
// settings/current
{
  prices: { design_1: 200, design_2: 200, design_3: 200, set: 500 },
  initial_stock: { design_1: 100, design_2: 100, design_3: 100 },
  target_amount: 40750,
  test_mode: false,
  low_stock_threshold: 10,   // これ以下で強調表示
  float_amount: 0,           // 釣銭準備金（未決事項。決まったら入れる）
  updated_at: Timestamp,
}
```

価格は会計確定時に明細の `unit_price` に焼き込むので、後から変えても過去の会計は変わらない（F-11）。

## D-08 預かり金とお釣り（状態：確定）

- 金額ボタン（500／1000／5000／10000）は押すたびに加算。「ちょうど」は預かり金を合計額に置き換える。「預かりクリア」で0に戻す。
- 「会計確定」が押せる条件：カートが空でない／客層を選択済み／人数を選択済み／預かり金 ≥ 合計。
- 押せないときは、何が足りないかをボタンの近くに表示する。

## D-09 確定後の画面（状態：確定）

- 確定後はお釣りを画面中央に大きく表示し、次に商品ボタンを押した時点で新しい会計を始める。
- お客さん用画面は確定内容（お釣り）を約10秒表示してから、待機表示（商品と価格の案内）に戻る。

## D-10 お客さん用画面の同期（状態：確定）

- 同じブラウザ：`BroadcastChannel('pos-display:' + register_id)` で即時送信（オフラインでも動く）。
- 別端末：`display_state/{register_id}` を上書き保存（これは表示用の状態であり会計データではないので上書き可）。送信は300ms程度に間引く。
- お客さん用画面は両方を購読し、`updated_at_ms`（送信元端末の時刻）が新しい方を表示する。
- 表示データの形：`{ register_id, mode: 'idle' | 'cart' | 'done', lines, total, received, change, updated_at_ms }`。
- お客さん用画面が落ちてもスタッフ入力画面は影響を受けないこと（送信失敗は握りつぶしてログだけ出す）。

## D-11 通信状態と未送信件数（状態：確定）

- 通信状態：`navigator.onLine` と、Firestore スナップショットの `metadata.fromCache` を合わせて「オンライン／オフライン」を表示。
- 未送信件数：`onSnapshot(..., { includeMetadataChanges: true })` で、`metadata.hasPendingWrites` が true のドキュメント数を数える。
- **注意**：オフライン中は `setDoc()` の Promise がサーバー到達まで解決しない。会計確定で `await` して画面を止めないこと（書き込みは投げっぱなしにし、エラーだけ拾う）。
- データ量は最大でも会計数百件なので、コレクション全体を購読してよい（Sparkプランの読み取り枠に十分収まる）。

## D-12 時刻（状態：確定）

- `timestamp` は端末のローカル時刻を、端末のタイムゾーンオフセット付き ISO 8601 で出す（`+09:00`）。`toISOString()`（UTC・`Z`表記）は使わない。
- 端末時計がずれていると分析が狂うので、開店前チェックに「端末の時刻確認」を入れる。

## D-13 CSV の細かい書式（状態：確定）

- **BOMなしUTF-8**（BOMがあると pandas の既定読み込みで先頭列名に `\ufeff` が付き、「前処理なし」が崩れる）。
- 改行は `\n`。真偽値は `true` / `false`（小文字）。数値は整数のまま。
- 値にカンマ・改行・ダブルクォートを含む場合だけ `"` で囲み、`"` は `""` にする（主に施策ログのメモ）。
- 並び順：`timestamp` 昇順、同時刻は `transaction_id`、明細は `line_no` 昇順。
- ダウンロードは ZIP 1つにまとめる：`pos_export_YYYYMMDD_HHmm.zip`（中身のファイル名は要件どおり `sales_lines.csv` などで固定。分析スクリプトを変えずに済む）。
- Excel で開いたときの文字化けは許容する（分析の主対象は pandas / Tableau のため）。

## D-14 要件で列が定義されていないCSV（状態：確定）

| ファイル | 列 |
| --- | --- |
| transactions.csv | transaction_id, timestamp, group_type, group_size, total, received, change, design_1_qty, design_2_qty, design_3_qty, total_sheets, set_qty, register_id, device_id, is_void, is_test（total_sheets・set_qty は 2026-10-20 に追加） |
| vr_visits.csv | visit_id, timestamp, register_id, device_id, is_void, is_test |
| action_logs.csv | log_id, timestamp, log_type, note, register_id, device_id, is_test（log_type は 2026-10-20 に追加。D-24） |
| register_closings.csv | closing_id, timestamp, business_date, register_id, device_id, system_cash_sales, counted_cash, float_amount, difference, is_test |

- transactions.csv の列順は要件 6.2 末尾の記述どおり（`total_sheets`・`set_qty` は「絵柄別枚数の合計」の直後に追加）。
- transactions.csv の追加列（2026-10-20 確定）：
  - `total_sheets`（整数）：その会計で出ていった合計枚数＝`design_1_qty + design_2_qty + design_3_qty`。
  - `set_qty`（整数）：その会計のセットの個数＝明細のうち `item = set` の `quantity` の合計（セットが無ければ 0）。
  - どちらも Firestore には保存せず、CSV 出力時に会計ドキュメントから計算する。取消・テストの会計にも同じように値を入れる。
  - `scripts/check_csv.py` で、`total_sheets` が3列の合計と、`set_qty` が `sales_lines.csv` のセット明細の会計ごとの合計と一致することを検査する。
- レジ締め（F-13）の保存先は要件 6.4 に無いため、コレクション `register_closings` を追加する。
- `counted_cash` は「数えた現金の総額」、`difference = (counted_cash − float_amount) − system_cash_sales`。

## D-15 在庫計算（状態：確定）

- `残数[案n] = initial_stock[案n] − Σ design_n_qty`（`is_void = false` かつ `is_test = false` の会計のみ）。
- 商品ボタンの無効化は「カートに入っている分」も差し引いて判定する。セットは3絵柄すべてに1枚以上の余りが必要。
- 残数 ≤ `low_stock_threshold` の絵柄は強調表示（色＋「残りわずか」）。

## D-16 ログインとセキュリティルール（状態：確定）

- 部員共通アカウントは Firebase コンソールで1つだけ作る。アプリに新規登録画面は作らない。
- **Firebase Authentication はクライアントから誰でもアカウント作成できてしまう**ため、次の二重の対策をとる：
  1. コンソールで新規登録（sign-up）を無効化する（Authentication → 設定 → ユーザーアクション）。
  2. ルール側でも共通アカウントのメールアドレスと一致することを確認する。
- ルールの要点：
  - `transactions` / `vr_visits`：作成は共通アカウントのみ。更新は `is_void` と `voided_at` だけ。削除禁止。
  - `action_logs` / `register_closings`：作成のみ。更新・削除禁止。
  - `settings`：共通アカウントのみ読み書き。
  - `display_state`：**読み取りは誰でも可**（お客さん用画面はログイン不要）。書き込みは共通アカウントのみ。
- ログイン状態はブラウザに保存されるので（既定の永続化）、一度ログインすればオフライン中も使える。

## D-17 日別の区切り（状態：未決 → 要件 8.2 待ち）

日程と営業時間が決まるまでは、`timestamp` のローカル日付で区切る。ダッシュボードには日付の切替を付ける。CSVに日付列は追加しない（`timestamp` から導出できるため）。

## D-18 割引（状態：未決 → 要件 8.2 待ち）

当面は「設定画面で価格を変える」ことで対応する（販売時点の単価が明細に残るので分析は崩れない）。割引ボタンなどが必要になったら、`item` の種類を増やす前に要件を相談する。

---

以下は 2026-10-20 の実装時に追加した決定。

## D-19 お客さん用画面に送る表示データ（状態：確定）

D-10 の表示データに次の項目を追加する。お客さん用画面は未ログインで `settings` を読めないため、待機表示に必要なものを一緒に送る。
会計データではなく CSV にも出ないので、分析には影響しない。

- `prices`：待機表示の価格案内
- `sold_out`：在庫切れの商品コード（待機表示で「売り切れ」にする）
- `is_test`：テストモード中は画面の隅に小さく「TEST」と出す

また、後から開いたお客さん用画面が現在の状態をすぐ受け取れるよう、BroadcastChannel で `hello` を送ると入力画面が最新状態を返す。

## D-20 セキュリティルールの「再送」の扱い（状態：確定）

オフライン復帰時に SDK が同じ書き込みを再送すると、2回目はルール上「更新」として評価される。
このとき `created_at`（serverTimestamp）だけが変わるため、更新で `created_at` が変わることは許可する。
会計・VR体験の内容（金額・明細など）の変更、取消の取り消し、削除は引き続き禁止。

## D-21 開発環境（状態：確定）

- `npm run dev` は既定で Emulator（プロジェクトID `demo-gakusai-pos`）に接続する。本番ビルド（`npm run build`）は常に本番プロジェクトに接続する。
- Emulator 接続中だけ、ログイン画面に「開発用アカウントを作成」ボタンを出す（本番には出ない）。
- 部員共通アカウントのメールアドレスは `firestore.rules` の `sharedEmail()` と `.env.local` の `VITE_SHARED_ACCOUNT_EMAIL` の2か所で一致させる（既定は `staff@gakusai-pos.example`）。
- `transaction_id` などの UUID は `crypto.randomUUID()` を使い、http（LAN の IP 直打ち）などで使えない場合だけ `crypto.getRandomValues()` による UUID v4 で代替する。

## D-22 画面の細かい挙動（状態：確定）

- 「直前の取消」ボタンには対象の会計の時刻と金額を小さく表示する（押す前に何が消えるか分かるように）。
- VR体験カウンターの「本日の人数」は、テストモード中はテストの記録だけ、通常時は本番の記録だけを数える。取消は「この端末の最新の記録」を取り消す。
- 黒字進捗（F-12）は日付の切替に関係なく常に累計で表示する（制作費の回収が目的のため）。
- 施策ログは設定画面に置き、プリセットボタン（POPを変更 など）と自由入力の両方を用意する。自由入力は会計の流れには含まれない。
- バックアップ通知（F-08）の経過時間は端末ごと（`localStorage`）。一度もエクスポートしていない端末は最初から警告色にする。

## D-23 エクスポートしたCSVの保存先（状態：確定 ← 要件 8.2）

要件定義書の原本で「それぞれのアクセスしている端末で決定」とされたため、アプリはブラウザの通常のダウンロードとして ZIP を保存するだけにする。
保存先フォルダや共有ドライブへのアップロードは各端末の運用で決める（`docs/operations.md`）。

## D-24 テストモード切替の記録（状態：確定 2026-10-20）

D-06 の補足。いつからいつまでがテスト（練習）だったかを後から確かめられるようにする。

**記録の内容**
- テストモードを切り替えると、施策ログ（`action_logs`）に自動で1件記録する。`note` は「テストモードをオンにした」／「テストモードをオフにした」。
- 時刻・端末ID・レジ番号は手入力の施策ログと同じように入れる。
- この自動記録は、テストモード中かどうかにかかわらず**常に `is_test=false`**（本番とテストの境目を示す記録なので、分析時に除外されないようにする）。
- 施策ログに種類の列 `log_type` を追加する。値は `manual`（手入力）／`test_mode_on`／`test_mode_off`。`action_logs.csv` にも `timestamp` の次の列として出力する（D-14 を更新）。
- `log_type` が無い追加前の記録は、読み込み時に `manual` として扱う。

**片方だけ成功しないようにする**
- 切替（`settings/current.test_mode`）と記録（`action_logs/{log_id}`）は、Firestore の `writeBatch` で1回の書き込みにまとめる。バッチは端末内でもサーバーでも「全部反映」か「全部失敗」のどちらかになる。
- オフライン中に切り替えても、切替と記録は一緒に端末に保存され、復帰後に1回の送信で一緒に届く。
- `settings/current.test_mode_log_id` に、その切替の記録の ID を入れる。
- セキュリティルールでも次を強制する（`getAfter` で同じ書き込みの中身を確認する）：
  - `test_mode` を変える書き込みは、同じ書き込みで**新しく作られる**、向きの合った記録（`test_mode_on`／`test_mode_off`）を指している場合だけ通す。既存の記録の使い回しは不可。
  - `test_mode_on`／`test_mode_off` の記録は、同じ書き込みで settings がその記録を指し、向きが合っている場合だけ作れる。`is_test=true` にはできない。
  - `log_type` が無い・不明な値の施策ログは作れない。
  - `settings` の削除は不可。
- 切替の前には、オン・オフとも確認ダイアログを出す（実装済み）。

**お客さん用画面の「TEST」表示は現状のままとする**
- スタッフ画面（レジ・ダッシュボード・設定）には、目立つ帯を常時表示する。
- お客さん用画面は来場者向けなので大きなバナーは出さず、左上に小さく「TEST」と出す現状のままとする（D-06 の「お客さん用画面を除く」に沿う）。
- 既知の制約：この「TEST」はレジ画面が送る表示データで切り替わるため、そのレジ番号のレジ画面が開いていないと、開くまで反映されない。オフラインの別端末にも届かない。開店前チェック（`docs/operations.md`）の目視確認で補う。
