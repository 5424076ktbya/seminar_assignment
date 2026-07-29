import json
from datetime import datetime, timezone, timedelta
from understatapi import UnderstatClient

understat = UnderstatClient()

leagues = ['EPL', 'La_Liga', 'Bundesliga', 'Serie_A', 'Ligue_1']
current_season = 2026  # 新シーズン

upcoming_matches = []
now_utc = datetime.now(timezone.utc)
one_month_later = now_utc + timedelta(days=30)

print("直近1か月以内の試合日程を取得中...")

for league in leagues:
    try:
        matches = understat.league(league).get_match_data(current_season)
        for m in matches:
            if not m.get('isResult') and m.get('datetime'):
                match_time = datetime.fromisoformat(m['datetime'].replace('Z', '+00:00'))
                
                # 現在から1か月以内の試合を抽出
                if now_utc < match_time <= one_month_later:
                    upcoming_matches.append({
                        "id": str(m['id']),
                        "league": league,
                        "datetime": m['datetime'],
                        "home_team": m['h']['title'],
                        "away_team": m['a']['title']
                    })
    except Exception as e:
        print(f"[{league}] 情報: まだ日程データが未登録か取得できませんでした ({e})")

# 日時順（近い順）にソート
upcoming_matches.sort(key=lambda x: x['datetime'])

with open('src/upcoming_matches.json', 'w', encoding='utf-8') as f:
    json.dump(upcoming_matches, f, ensure_ascii=False, indent=2)

print(f"完了！ 直近1か月以内の {len(upcoming_matches)} 試合を保存しました。")