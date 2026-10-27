# 学祭シール販売POS

DA研の学祭出店（シール販売）で使う Web POS。会計を速く正確に回すことと、
Python / Tableau で前処理なしに分析できるデータを残すことが目的。

## 必ず読むドキュメント

- `docs/requirements.md` — 要件定義書（仕様の正。**勝手に書き換えない**）
- `docs/decisions.md` — 要件の隙間を埋める実装上の決定（D-01〜）
- `docs/implementation-plan.md` — フェーズ別の作業計画と完了条件（進捗チェックはここを更新する）
- `docs/handoff.md` — 引き継ぎメモ（現在の状態・次にやること・作業上の注意）

作業を始める前に、該当フェーズと関係する要件ID（F-xx）・決定（D-xx）を確認すること。
要件と決定が食い違う場合は要件が優先。どちらにも書かれていない判断が必要なら、実装前にユーザーに質問する。

## 技術スタック

Vite + React + TypeScript / react-router / Firebase（Hosting, Authentication, Cloud Firestore）/
Vitest / Firebase Emulator Suite / JSZip。詳細は D-01。

## コマンド

（`package.json` の scripts。名前を変えたらここも直す。開発時は既定で Emulator に接続する：D-21）

- `npm run dev` — 開発サーバー
- `npm run emulators` — Firebase Emulator（Auth, Firestore）
- `npm run test` — Vitest（ドメインロジック）
- `npm run test:rules` — セキュリティルールのテスト（Emulator 上）
- `npm run test:e2e` — Playwright で当日の一連の操作と、Service Worker（オフラインで開ける・新しい版の［更新］）の確認（Emulator 上。初回は `npx playwright install chromium`）
- `npm run lint` / `npm run typecheck` / `npm run build`
- `npm run build:no-sw` — 緊急時用：端末の Service Worker を外す版をビルドする（D-28、`docs/operations.md`）

作業の区切りごとに `npm run lint && npm run typecheck && npm run test` を通すこと。

## ディレクトリ方針

```
src/
  domain/     純粋関数と型。UIもFirebaseもimportしない。ロジックはすべてここに置きテストする
  data/       Firestore・BroadcastChannel・localStorage とのやりとり。UIから直接Firestoreを呼ばない
  pages/      画面（Register, Display, Dashboard, Settings, Login）
  components/ 画面部品
  lib/        firebase初期化、device_id など
firestore.rules
tests/rules/  ルールのテスト
scripts/      check_csv.py（エクスポートCSVの検査）
```

## 絶対に守るルール（仕様の要点）

**データの整合性**
- 会計は追記のみ。`transactions` の更新は `is_void` と `voided_at` だけ。削除は一切しない。
- `transaction_id` は端末側で `crypto.randomUUID()` を1回だけ発行し、ドキュメントIDにする（二重送信でも1件）。
- 在庫数・売上は保存しない。毎回、`is_void=false` かつ `is_test=false` の会計から計算する。
- 単価は会計確定時に明細へ焼き込む。設定変更で過去の会計が変わってはいけない。
- セット1個＝案1・案2・案3を各1枚。`design_n_qty` に反映する。

**オフライン**
- オフラインでも会計入力を止めない。Firestore の書き込みを `await` して画面を待たせない（オフライン中は解決しない）。
- 通信状態と未送信件数（`hasPendingWrites`）を常に表示する。
- お客さん用画面の不具合がスタッフ入力画面に波及しないこと。

**CSV（分析が最優先）**
- 列名・列順・コード値は要件 6.2 と D-14 のとおり。**勝手に列を増やしたり名前を変えたりしない**（分析スクリプトが壊れる）。変更が必要ならユーザーに確認する。
- BOMなしUTF-8、カンマ区切り、真偽値は `true`/`false`、金額は記号なしの整数、空欄なし（不明は `unknown`）。
- 取消・テストの行も削除せず出力する。
- `timestamp` は端末ローカル時刻のオフセット付き ISO 8601（`+09:00`）。`toISOString()` を使わない。

**画面と操作**
- スタッフ入力画面の1会計は、文字入力なし・タップのみで完了する。
- ボタンは縦横48px以上。PC・タブレット・スマホでレイアウトを切り替える。
- 画面の表示は日本語、データのコード値は英語（例：表示「子連れ」／値 `family`）。
- テストモード中は全スタッフ画面に帯を常時表示する。

**セキュリティ**
- 共通アカウント以外は読み書き不可（D-16）。`display_state` だけは未ログインで読み取り可。
- 個人情報は扱わない。Firebase の設定値は `.env.local` に置きコミットしない。

## 作業の進め方

1. フェーズ単位で進める。始める前に、やることと変更するファイルの計画を短く示す。
2. `src/domain/` のロジックはテストを先に書く（テスト→実装→通過）。
3. フェーズの完了条件を満たしたら、`docs/implementation-plan.md` のチェックを更新し、
   ユーザーが手で確認すべき操作（ブラウザでの確認手順）を箇条書きで伝える。
4. 新しく決めたことがあれば `docs/decisions.md` に D-xx として追記する。
5. 区切りごとに git commit する（メッセージは日本語可、`feat(F-01): ...` のように要件IDを入れる）。

## やってはいけないこと

- `firebase deploy` をユーザーの明示的な指示なしに実行する（本番データに影響する）
- 本番の Firestore に対してテストデータを書き込むスクリプトを実行する（開発は Emulator を使う）
- 要件にない大きなライブラリ（UIキット、状態管理ライブラリ等）を相談なく追加する
- 要件定義書（`docs/requirements.md`）を書き換える
