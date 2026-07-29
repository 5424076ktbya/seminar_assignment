import json
from datetime import datetime, timedelta
from understatapi import UnderstatClient

understat = UnderstatClient()

# 5大リーグ
leagues = ['EPL', 'La_Liga', 'Bundesliga', 'Serie_A', 'Ligue_1']
current_season = 2025  # 現在のシーズン

upcoming_matches = []

print("直近の全試合日程を取得中...")

for league in leagues:
    try:
        matches = understat.league(league).get_match_data(current_season)
        for m in matches:
            # 未消化の試合（isResultがFalse）をすべて取得
            if not m.get('isResult') and m.get('datetime'):
                upcoming_matches.append({
                    "id": str(m['id']), # IDを文字列にして扱う
                    "league": league,
                    "datetime": m['datetime'],
                    "home_team": m['h']['title'],
                    "away_team": m['a']['title']
                })
    except Exception as e:
        print(f"エラー ({league}): {e}")

# 日時順にソート
upcoming_matches.sort(key=lambda x: x['datetime'])

# 今週〜直近の全試合（先頭50試合分など十分な件数を確保）
display_matches = upcoming_matches[:50]

with open('src/upcoming_matches.json', 'w', encoding='utf-8') as f:
    json.dump(display_matches, f, ensure_ascii=False, indent=2)

print(f"完了！ 直近の全 {len(display_matches)} 試合を src/upcoming_matches.json に保存しました！")