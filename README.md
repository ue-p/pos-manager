# 学祭シールPOS

DA研の学祭出店（シール販売）用の Web POS。仕様は [docs/requirements.md](docs/requirements.md)、
実装上の決定は [docs/decisions.md](docs/decisions.md)、当日の手順は [docs/operations.md](docs/operations.md)。

| URL | 画面 | ログイン |
| --- | --- | --- |
| `/` | スタッフ入力画面（レジ） | 必要 |
| `/display?reg=reg_1` | お客さん用画面 | 不要 |
| `/dashboard` | ダッシュボード | 必要 |
| `/settings` | 設定・エクスポート | 必要 |

## 手元で動かす（Firebase のプロジェクトは不要）

必要なもの：Node.js 20 以上、Java 11 以上（Firebase Emulator 用）

```bash
npm install
npm run emulators      # ターミナル1：Auth / Firestore の Emulator（管理画面 http://127.0.0.1:4000）
npm run dev            # ターミナル2：http://localhost:5173
```

ログイン画面でパスワード（6文字以上）を入れ、「開発用アカウントを作成」を押すとログインできます。
Emulator のデータは停止すると消えます。

## テスト

```bash
npm run lint && npm run typecheck && npm run test   # ドメインロジック
npm run test:rules                                  # セキュリティルール（Emulator を自動起動）
npm run test:e2e                                    # ブラウザで当日の一連の操作（Emulator を自動起動）
```

初回の `test:e2e` の前に `npx playwright install chromium` が必要です。

## 本番に出す（運営担当が行う）

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作成（Spark プランのまま）
   - Authentication：メール/パスワードを有効化 → 部員共通アカウントを1つ作成 → **ユーザーによる新規登録を無効化**
   - Firestore Database：作成（ロケーションは `asia-northeast1` など）
   - プロジェクトの設定 → マイアプリ → ウェブアプリを追加し、設定値を控える
2. `.env.example` を `.env.local` にコピーして設定値と共通アカウントのメールアドレスを書く（コミットしない）
3. `firestore.rules` の `sharedEmail()` を共通アカウントのメールアドレスに書き換える
4. `npx firebase login`。本番プロジェクトは `.firebaserc` に `dakken2026pos` として設定済み（別のプロジェクトにするときは `npx firebase use --add`）
5. `npm run build` → `npx firebase deploy --only firestore:rules,firestore:indexes,hosting`

デプロイ後、Hosting の URL を部員にだけ共有してください（部外に公開しない）。
