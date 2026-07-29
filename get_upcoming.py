import json
from datetime import datetime, timezone, timedelta
from understatapi import UnderstatClient

understat = UnderstatClient()
leagues = ['EPL', 'La_Liga', 'Bundesliga', 'Serie_A', 'Ligue_1']

# --- 1. 直近1か月以内の試合（本番用データ） ---
print("1. 直近1か月以内の試合日程を取得中...")
upcoming_matches = []
now_utc = datetime.now(timezone.utc)
one_month_later = now_utc + timedelta(days=30)

for league in leagues:
    try:
        # 正しい呼び出し順: league(リーグ名).get_match_data(シーズン)
        matches = understat.league(league).get_match_data(2026)
        for m in matches:
            if not m.get('isResult') and m.get('datetime'):
                match_time = datetime.fromisoformat(m['datetime'].replace('Z', '+00:00'))
                if now_utc < match_time <= one_month_later:
                    upcoming_matches.append({
                        "id": str(m['id']),
                        "league": league,
                        "datetime": m['datetime'],
                        "home_team": m['h']['title'],
                        "away_team": m['a']['title']
                    })
    except Exception as e:
        pass

upcoming_matches.sort(key=lambda x: x['datetime'])
with open('src/upcoming_matches.json', 'w', encoding='utf-8') as f:
    json.dump(upcoming_matches, f, ensure_ascii=False, indent=2)

print(f"-> 本番用(直近1か月): {len(upcoming_matches)} 試合を保存")


# --- 2. 前シーズンの試合（デモ・テスト用データ） ---
print("2. デモ用(前シーズン)の試合日程を取得中...")
demo_matches = []

for league in leagues:
    try:
        # 正しい呼び出し順: league(リーグ名).get_match_data(シーズン)
        matches = understat.league(league).get_match_data(2025)
        for m in matches[:10]: # 各リーグ10試合ずつピックアップ
            demo_matches.append({
                "id": f"demo_{m['id']}", # IDが被らないようprefix付与
                "league": league,
                "datetime": m['datetime'],
                "home_team": m['h']['title'],
                "away_team": m['a']['title']
            })
    except Exception as e:
        print(f"[{league}] エラー: {e}")

demo_matches.sort(key=lambda x: x['datetime'])
with open('src/demo_matches.json', 'w', encoding='utf-8') as f:
    json.dump(demo_matches, f, ensure_ascii=False, indent=2)

print(f"-> デモ用(前シーズン): {len(demo_matches)} 試合を保存")