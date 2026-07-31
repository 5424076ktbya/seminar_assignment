import json
import os
from datetime import datetime, timezone, timedelta
from understatapi import UnderstatClient

understat = UnderstatClient()
leagues = ['EPL', 'La_Liga', 'Bundesliga', 'Serie_A', 'Ligue_1']

print("🌐 欧州5大リーグの直近1週間（今週）の試合日程を取得中...")
upcoming_matches = []
now_utc = datetime.now(timezone.utc)
one_week_later = now_utc + timedelta(days=7)
current_season = 2026

for league in leagues:
    try:
        matches = understat.league(league).get_match_data(current_season)
        for m in matches:
            if not m.get('isResult') and m.get('datetime'):
                match_time = datetime.fromisoformat(m['datetime'].replace('Z', '+00:00'))
                
                # 直近1週間以内の試合のみ
                if now_utc <= match_time <= one_week_later:
                    jst_time = match_time.astimezone(timezone(timedelta(hours=9)))
                    weekdays = ['（月）', '（火）', '（水）', '（木）', '（金）', '（土）', '（日）']
                    w_str = weekdays[jst_time.weekday()]
                    dt_display = f"{jst_time.strftime('%Y年 %m/%d')}{w_str} {jst_time.strftime('%H:%M')}"

                    upcoming_matches.append({
                        "id": str(m['id']),
                        "league": league, # 'EPL', 'La_Liga' などの識別子
                        "datetime": dt_display,
                        "home_team": m['h']['title'],
                        "away_team": m['a']['title']
                    })
    except Exception as e:
        print(f"⚠️ [{league}] 取得スキップ: {e}")

# 日時順にソート
upcoming_matches.sort(key=lambda x: x['datetime'])

os.makedirs("src", exist_ok=True)
with open('src/upcoming_matches.json', 'w', encoding='utf-8') as f:
    json.dump(upcoming_matches, f, ensure_ascii=False, indent=2)

print(f"✅ 直近1週間の欧州試合: {len(upcoming_matches)} 件を src/upcoming_matches.json に保存しました！")