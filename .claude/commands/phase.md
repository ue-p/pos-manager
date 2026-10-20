---
description: 実装計画のフェーズを1つ進める（例：/phase 1）
argument-hint: <フェーズ番号>
---

`docs/implementation-plan.md` のフェーズ $ARGUMENTS を実装してください。

手順：

1. `docs/implementation-plan.md` のフェーズ $ARGUMENTS と、それより前のフェーズの完了状況を確認する。
   前のフェーズに未完了の項目があれば、先にそれを報告して指示を待つ。
2. このフェーズに関係する要件（`docs/requirements.md` の F-xx、6章、7章）と決定（`docs/decisions.md` の D-xx）を読み、
   関係するIDを列挙する。「状態：提案」「未決」の決定に依存する場合は、進め方を質問してから実装する。
3. 作業計画（作る／変更するファイル、テスト項目）を短く提示する。
4. `src/domain/` のロジックはテストを先に書き、実装して通す。
5. `npm run lint && npm run typecheck && npm run test`（ルールを触ったら `npm run test:rules` も）を通す。
6. 完了条件を1つずつ確認し、`docs/implementation-plan.md` のチェックボックスを更新する。
7. 最後に次を報告する：
   - 実装した内容（要件IDごと）
   - ユーザーがブラウザで確認すべき操作手順
   - 新たに `docs/decisions.md` に追記した決定
   - 残った課題・次のフェーズへの申し送り
8. 区切りの良いところで git commit する。
