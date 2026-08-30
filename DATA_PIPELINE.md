# 過去試合データ取得

## セットアップ

```powershell
python -m pip install -r requirements-data.txt
```

ローカルにPythonがない場合は、GitHub Actionsの `Update Historical Analysis Data` を
手動実行する。`dataset`、開始シーズン、終了シーズンを指定できる。

## 欧州5大リーグ

```powershell
python generate_data.py --start-season 2014 --end-season 2025
```

- 出力: `src/shots_data.json`
- 既存の `match_id` は再取得せず、不足分だけ追加する。
- 各シーズン終了時に一時ファイルから安全に置き換える。
- 得点、勝敗、xG、取得できた先制時間は取得値。
- シュート数、支配率、パス成功率などは現在の計算式による推定値。
- 各レコードの `data_quality` に取得値・推定値の区分を保存する。

`--replace` を指定すると既存データを使わず再生成するため、通常は指定しない。

大量の年度を追加するときは、先制点時刻の試合別アクセスを省略する高速モードを使う。

```powershell
python generate_data.py --start-season 2014 --end-season 2025 --skip-first-goal
```

高速モードでも得点、勝敗、xGは取得される。省略した先制点時刻は `data_quality.missing`
に記録され、画面ではその試合を先制時間分析の対象外にする。GitHub Actionsでは
`Fetch first-goal minute` をオフにすると高速モードになる。

## J1過去結果

```powershell
python fetch_jleague_history.py --start-season 2014 --end-season 2025
```

- 出力: `src/jleague_history.json`
- 取得元: Jリーグ公式データサイトの日程・結果検索。
- 得点、勝敗、ホーム／アウェイを共通試合形式へ変換する。
- 公式検索結果の短縮チーム名を保存する。
- 詳細スタッツがない項目は `null` で捏造せず、`data_quality.missing` に記録する。
- シーズンごとに1回だけアクセスし、既定でリクエスト間隔を1秒空ける。

現段階ではJ1結果を欧州の分析JSONへ混在させない。支配率などがないJ1試合を同じ条件で
集計すると誤解を招くため、次段階でリーグ選択と利用可能指標の制御を追加してからUIへ接続する。

## チームクラスタリング（似たチームを見つける）

### セットアップ

```powershell
python -m pip install -r requirements-data.txt
```

### コマンド

```powershell
python cluster_teams.py
```

- 出力: `src/team_clusters.json`
- 欧州5大リーグとJ1を、得点・失点・勝敗・ホーム／アウェイから算出した欠損のない指標で比較する。
- K-meansは標準化した元特徴量に対して実行する。
- UMAPは散布図上の配置だけに使用し、UMAP座標ではクラスタリングしない。
- GitHub Actionsでは`dataset: clusters`を明示的に選んだ場合だけ再計算する。
- 通常の欧州・J1データ更新には含めないため、データ更新でクラスタ番号が意図せず変わることを防げる。

J1結果は通常の条件分析では欧州分析JSONへ混在させないが、クラスタリングでは両リーグに共通する得点・勝敗由来の指標だけを利用するため、リーグ横断比較の対象に含める。
