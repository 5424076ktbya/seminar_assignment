import json
import os
from datetime import datetime, timezone, timedelta
from understatapi import UnderstatClient

understat = UnderstatClient()
leagues = ['EPL', 'La_Liga', 'Bundesliga', 'Serie_A', 'Ligue_1']

print("🌐 欧州5大リーグの直近の試合日程を取得中...")
upcoming_matches = []
now_utc = datetime.now(timezone.utc)
current_season = 2026

for league in leagues:
    try:
        matches = understat.league(league).get_match_data(current_season)
        print(f"[{league}] 全取得件数: {len(matches)}件")
        
        for m in matches:
            # 未消化（未終了）かつ日時データが存在する場合
            if not m.get('isResult') and m.get('datetime'):
                dt_str = m['datetime'].replace('Z', '+00:00')
                
                # タイムゾーン付きで確実にパース
                match_time = datetime.fromisoformat(dt_str)
                if match_time.tzinfo is None:
                    match_time = match_time.replace(tzinfo=timezone.utc)

                # 過去6時間前以降〜未来の試合を対象（取りこぼし防止）
                if match_time >= (now_utc - timedelta(hours=6)):
                    # 日本時間（JST）に変換
                    jst_time = match_time.astimezone(timezone(timedelta(hours=9)))
                    weekdays = ['（月）', '（火）', '（水）', '（木）', '（金）', '（土）', '（日）']
                    w_str = weekdays[jst_time.weekday()]
                    dt_display = f"{jst_time.strftime('%Y年 %m/%d')}{w_str} {jst_time.strftime('%H:%M')}"

                    upcoming_matches.append({
                        "id": str(m['id']),
                        "league": league,
                        "datetime": dt_display,
                        "home_team": m['h']['title'],
                        "away_team": m['a']['title'],
                        "raw_time": match_time.isoformat()
                    })
    except Exception as e:
        print(f"⚠️ [{league}] 取得エラー: {e}")

# 日時が近い順にソート
upcoming_matches.sort(key=lambda x: x['raw_time'])

# ソート用一時キーの削除
for m in upcoming_matches:
    del m['raw_time']

# 直近20試合に制限
upcoming_matches = upcoming_matches[:20]

os.makedirs("src", exist_ok=True)
with open('src/upcoming_matches.json', 'w', encoding='utf-8') as f:
    json.dump(upcoming_matches, f, ensure_ascii=False, indent=2)

print(f"✅ 直近の欧州試合: {len(upcoming_matches)} 件を保存しました！")