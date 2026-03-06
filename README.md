# Delete All Workflow Runs

GitHub Actions のワークフロー実行履歴をワンクリックで一括削除する Chrome 拡張機能。

## 機能

- ワークフローページに「Delete All Runs」ボタンを追加
- 全ページのワークフロー実行を自動収集して一括削除
- 進捗バー表示、レート制限の自動リトライ対応
- GitHub の SPA ナビゲーション（Turbo）に対応

## インストール

1. このリポジトリをクローン or ダウンロード
2. Chrome で `chrome://extensions` を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」からこのディレクトリを選択

## 使い方

1. GitHub の任意のリポジトリで **Actions** → 対象の **ワークフロー** を開く
2. 検索バーの左に表示される **Delete All Runs** ボタンをクリック
3. 確認ダイアログで OK を押すと削除が開始される

## 開発

```bash
npm install
npm test
```

テストは [Vitest](https://vitest.dev/) + jsdom で実行されます。PR 作成時に GitHub Actions で自動実行されます。
