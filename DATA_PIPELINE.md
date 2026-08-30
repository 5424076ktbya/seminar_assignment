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
