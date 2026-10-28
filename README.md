# windowsCLIroom

v0.1.2 — 日本語環境での円記号を使ったパス入力に対応。[変更内容](REVIEW.md)と[確認記録](VALIDATION.md)を同梱しています。

Windows の一般的な IT トラブルシューティングを、ブラウザーで練習する教材です。Windows 11 のコマンドプロンプト（CMD）を想定し、「説明を読む → コマンドを打つ → 結果を読み取る」を短い課題で学びます。日本語と英語を切り替えられます。

## 開き方

[windowsCLIroom.html](windowsCLIroom.html) を保存し、ブラウザーで開いてください。HTML 1 ファイルに教材・画面・シミュレーターをまとめているため、インストール、ログイン、サーバーの起動は不要です。教材の利用中に外部通信は行いません。参照資料のリンクを開く場合はインターネット接続が必要です。

`src/ui.html` はビルド用の画面テンプレートです。利用・レビューには、リポジトリ直下の `windowsCLIroom.html` を開いてください。

[linuxroom](https://github.com/retiacole/linuxroom) などの room シリーズと同じく、単一 HTML、短い説明、コマンド演習、段階的なヒント、学習マップ、コマンド帳、進捗の保存を軸にしています。初版は 5 コース・56 レッスン（解釈問題 34 問、総合演習 4 本）です。

コースから好きなレッスンを選び、「やってみよう」に沿ってコマンドを実行します。必要に応じて 3 段階のヒントや解答例を表示できます。結果を解釈する問題では、コマンドの実行と選択肢への回答の両方で完了を判定します。

「自由練習」では課題なしで操作できます。Wi-Fi の切断、DNS 設定、DNS キャッシュ、WinHTTP プロキシ、HTTP 503、VPN の経路、ポリシー、印刷サービス、ファイルの権限、システムファイルの異常を切り替えて、結果の違いを確認できます。各レッスンと自由練習は独立した仮想環境です。

入力欄では Enter で実行、上下キーで履歴、Tab でコマンド名・パスの補完ができます。「コマンド帳」または `help` で、この教材が対応する書式を確認できます。

Windows のパスの区切りはバックスラッシュ（`\`）です。日本語環境では円記号のように表示される場合があります。この教材では入力補助として、パス中の `¥`（U+00A5）・`￥`（U+FFE5）も区切りとして扱います。`C:\Lab`、`C:¥Lab`、`C:￥Lab`、`C:/Lab` で同じフォルダーを指定でき、採点と Tab 補完にも対応します。`echo` の本文・検索文字列・URL の円記号は変換しません。これは教材の入力補助であり、実機の Windows が別の Unicode 文字を常に同じように扱うという意味ではありません。

完了後、入力欄が空なら右矢印キーで次に進めます。「処理の流れ」では、パイプの各段が受け取ったテキストと出力を確認できます。復旧の課題では、操作前後の確認順序と最終状態も採点します。やり直しても過去の完了記録は残り、現在の環境の合否とは区別して表示します。

選択問題は、選んだ答えごとの解説と、その環境での誤答回数を表示します。34 問・102 選択肢の本文と解説は日英対応です。`help` も画面で選択中の言語で表示します。既に出力した履歴の言語は変わりません。

## 学ぶこと

| コース | 内容 |
| --- | --- |
| コマンドの入口 | 現在地、ドライブ、空白を含むパス、ファイルの読み書き、コピー、パイプ、検索、結果の保存 |
| PC とアプリを調べる | OS・ユーザー情報、プロセスと PID、サービス、イベントログ、アクセス許可、空き容量 |
| ネットワークを切り分ける | Wi-Fi、IP、DNS、経路、接続状態、プロキシ、`curl.exe` による HTTP 応答の観察 |
| 職場の Windows | AD DS ドメイン参加 PC、共有フォルダー、グループポリシー、ドメインコントローラー、時刻同期 |
| 復旧と総合演習 | 状態確認、限定した変更、再確認を組み合わせた問い合わせ対応 |

題材は日常の IT サポートです。攻撃手法やセキュリティ製品の操作は前提にしません。PowerShell のオブジェクト処理やスクリプトは別教材の範囲です。

`netsh` は無線 LAN・IPv4・WinHTTP・ファイアウォールの状態を確認する用途で扱います。AD の情報は `gpresult`、`nltest`、`w32tm` などで調べます。コマンドの成功だけで原因を断定せず、次に確認する対象を考える構成です。

Windows 11 には `curl.exe` が同梱されています。Windows PowerShell 5.1 の `curl` エイリアスとの混同を避けるため、教材の例では主に `curl.exe` と表記します。同梱版の機能・バージョンは環境によって異なります。[Microsoft の説明](https://learn.microsoft.com/en-us/windows/curl/) と [curl プロジェクトの Windows 同梱版の説明](https://curl.se/windows/microsoft.html) を参照してください。

## 対応コマンド

以下は実装済みのコマンド群です。各コマンドの全オプションには対応していません。正確な対応書式は教材内の一覧・`help command` と、`src/shell.js` / `src/network.js` の `reference` にあります。

| 用途 | 対応コマンド |
| --- | --- |
| 操作の入口 | `help`、`cls`、`echo`、`cd` / `chdir`、`C:` / `D:`、`dir` |
| ファイル・テキスト | `type`、`more`、`findstr`、`find`、`mkdir` / `md`、`copy`、`move`、`ren` / `rename` |
| 環境・端末情報 | `set`（表示）、`where`、`ver`、`systeminfo`、`hostname`、`whoami` |
| アプリ・サービス | `tasklist`、`taskkill`（演習用アプリ）、`sc query`、`sc qc`、`net start`、`net stop` |
| ログ・権限・ディスク | `wevtutil qe System`、`icacls`（表示）、`attrib`（表示）、`fsutil volume diskfree` |
| IP・名前解決 | `ipconfig`、`ping`、`nslookup` |
| 経路・接続 | `tracert`、`route print`、`arp -a`、`pathping`、`netstat` |
| 設定の観察 | `netsh wlan show`、`netsh interface ipv4 show config`、`netsh winhttp show`、`netsh advfirewall show` |
| Web | `curl.exe` / `curl`（バージョン、GET、HEAD、ヘッダー、詳細表示、HTTP エラーの終了コード） |
| 職場の環境 | `net use`（既存接続の表示）、`gpresult`、`nltest /dsgetdc`、`w32tm /query`、`gpupdate` |
| システムの検証・修復 | `sfc /verifyonly`、`sfc /scannow`、`DISM /Online /Cleanup-Image` の健康状態確認・修復 |

二重引用符による引数のグループ化、`%USERPROFILE%` などの既知の環境変数、パイプ `|`、出力の上書き `>` と追記 `>>` を扱えます。例えば、次の操作でエラー行を仮想ファイルに保存できます。

```bat
type C:\Lab\Logs\app.log | findstr "ERROR" > C:\Lab\Reports\errors.txt
type C:\Lab\Reports\errors.txt
```

## 仮想環境と制限

PC-014、CORP ドメイン、IP アドレス、ログ、サービスの状態などは、すべて教材内の架空データです。コマンドは JavaScript の決められた処理として実装しています。実際の Windows コマンドの起動、OS の変更、ホスト側ファイルの読み書き、DNS・TCP・HTTP の通信は行いません。進捗の保存・読み込みだけはブラウザーの保存機能と、ユーザーが選んだ JSON ファイルを利用します。

実装上の主な制限は次のとおりです。

- CMD 全体の再現ではありません。バッチファイル、`for` / `if`、変数代入、`&` / `&&` / `||` による連結、入力・標準エラー出力のリダイレクトは未対応です。
- `findstr` はリテラル検索の範囲です。正規表現は再現せず、`/l` や `/c:` を使った検索に対応します。
- ファイル操作は仮想 C・D ドライブ内のテキストが対象です。ワイルドカード、UNC パスのファイル操作、ディレクトリのコピー・移動は未対応です。`more` は対話的なページ分割を行いません。
- ネットワークは登録済みの宛先と故障シナリオだけを再現します。未登録の宛先には未対応と表示します。IPv6、実際の待ち時間、認証、TLS 証明書の検証などは再現しません。
- WinHTTP のプロキシ設定を `curl.exe` やブラウザーが自動的に使うとは扱いません。DNS サーバーへの問い合わせとローカル DNS キャッシュも区別します。
- 1 行の入力は 4,096 文字、パイプは最大 16 段階、仮想ファイルは最大 256 件、1 ファイルは最大 65,536 文字です。履歴は最新 80 件を上限とし、保存量の制限でも古い履歴を削減します。

採点用の達成条件は、表示用の履歴とは別に小さな記録として保持します。80 件を超えても、確認済みの条件は失われません。現在地、ファイルの内容、サービスの現在状態は引き続きその時点の状態で判定します。復旧操作を再実行した場合は、その後の再確認が必要です。「この環境をやり直す」で採点記録と誤答回数も初期化します。

`fsutil` の出力は、Windows 11 を想定した容量表示の抜粋です。すべての欄の完全再現ではありません。`echo` の末尾空白は簡略化しており、実機との差と余分な空白を避ける書き方を L09 で説明します。

未対応の構文を、成功した操作として扱わない設計です。端末のエラーメッセージや出力の配置は学習向けに簡略化しています。実際の環境では Windows の版、権限、ドメイン参加状況、設定によって利用可否・出力が変わります。

## 進捗の保存・移動

進捗、実行履歴、仮想ファイルはブラウザー内に自動保存します。配布 HTML 自体は変更しません。ブラウザーや保存先を変更する場合は、「設定と学習データ」から「進捗を書き出す」で JSON を保存し、移動先で「進捗を読み込む」を使います。

ファイルを直接開いた場合の自動保存の扱いはブラウザーによって異なります。保存できない場合は画面に案内を表示します。プライベートブラウズやブラウザーのデータ削除では保存内容を失う場合があるため、残したい進捗は JSON に書き出してください。取り込み時は形式・サイズ・仮想パス・シナリオ状態を検証し、不正なデータは適用しません。

v0.1.0 の進捗ファイルも読み込めます。完了記録と仮想ファイルを保ち、VPN の設定などの旧形式を更新します。変更された課題の新しい判定条件は、残っている実行履歴から再評価します。過去の完了記録を取り消すことはありません。

保存済みデータを読み込めない場合は、元データを上書きしないよう自動保存を停止します。設定から元のデータを書き出せます。有効な進捗を読み込むか、確認のうえで学習データを消すと自動保存を再開します。

## 開発と検証

Node.js 22 以降を使います。HTML のビルドと単体・教材テストは、Node.js 標準機能だけで実行できます。

```sh
node build.js
node --test tests/*.test.js
```

または `npm run build` と `npm test` を使えます。ビルドは次の 3 ファイルを同じ内容で更新します。

- `windowsCLIroom.html` — 配布用の単一 HTML
- `docs/index.html` — GitHub Pages 向けの入口
- `docs/windowsCLIroom.html` — 同じ教材のファイル名付き URL 向け

ブラウザーテストは Playwright と Chromium を利用します。開発用依存関係とブラウザーの初回導入にはネットワーク接続が必要です。教材本体はこれらに依存しません。

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Chromium の代わりにインストール済みの Chrome を使う場合は、macOS / Linux では `WCR_BROWSER_CHANNEL=chrome npm run test:browser` を実行できます。

テストは仮想ファイル・コマンドの処理、故障シナリオ間の整合性、教材の解答例、誤答・失敗の判定、進捗の復元を確認します。ブラウザーテストでは配布 HTML の操作、言語切り替え、保存・読み込み、入力操作、モバイル表示、外部通信の有無を確認します。現在のテスト結果は実行時の出力を参照してください。

実機の Windows 11 / CMD との手動比較、実際の AD DS 環境・権限による出力差のレビューは未実施です。公開前に、IT サポート経験者による教材内容の確認と、代表的なコマンドの実機確認を行う想定です。

`docs/` は GitHub Pages に配置しやすい構成です。Pages の公開元に `main` ブランチの `docs/` を指定できます。

## 主なファイル

| ファイル | 役割 |
| --- | --- |
| `src/ui.html` / `src/style.css` / `src/app.js` | 画面、見た目、ブラウザー操作 |
| `src/shell.js` | CMD の限定実装、仮想ファイル、PC・アプリの状態 |
| `src/network.js` | ネットワーク・AD・HTTP の架空モデル |
| `src/data.js` | 日本語・英語の教材、課題、ヒント、解答例 |
| `src/engine.js` | 判定、進捗、読み込みの検証 |
| `build.js` | 単一 HTML への結合 |
| `tests/` | コマンド・教材・ブラウザーのテスト |

## 参考資料

- [Microsoft Learn — Windows commands](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/windows-commands)
- [Microsoft Learn — curl on Windows](https://learn.microsoft.com/en-us/windows/curl/)
- [curl — curl shipped by Microsoft](https://curl.se/windows/microsoft.html)
- [Microsoft Learn — Netsh commands for WinHTTP](https://learn.microsoft.com/en-us/windows/win32/winhttp/netsh-exe-commands)
- [Microsoft Learn — Windows Time service tools and settings](https://learn.microsoft.com/en-us/windows-server/networking/windows-time-service/windows-time-service-tools-and-settings)

## English

**windowsCLIroom** is a Japanese/English learning simulator for everyday Windows IT troubleshooting. Open `windowsCLIroom.html` directly in a browser. The single HTML file works offline and requires no account, installation, or server.

Five independent tracks cover CMD basics, PC and application inspection, networking and `curl.exe`, workplace AD diagnostics, and recovery exercises. Commands operate only on a fictional in-browser PC. They never execute Windows processes, access your real files, or make network requests. Only a documented subset of CMD syntax and options is implemented; use `help` or the command reference inside the app.

As a simulator input aid, typed yen signs `¥` (U+00A5) and `￥` (U+FFE5) are accepted as path separators, including grading and Tab completion. Echo text, search strings, URLs and stored file contents are preserved. This does not imply that real Windows treats these Unicode characters as backslashes in every environment.

Progress is saved in browser storage. Use **Settings & progress → Export progress / Import progress** to back it up or move it between browsers. Local-file storage behavior varies by browser.

Development requires Node.js 22+. Run `node build.js` and `npm test`. For browser checks, install the development dependencies and Chromium, then run `npm run test:browser`. Manual comparison against a real Windows 11 / AD DS environment is still pending. `docs/index.html` is prepared for GitHub Pages. Select the `main` branch and `/docs` as the Pages source when publishing.

MIT License. See [LICENSE](LICENSE).
