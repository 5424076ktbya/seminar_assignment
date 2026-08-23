from datetime import datetime, timezone, timedelta
import json
import os
from understatapi import UnderstatClient

understat = UnderstatClient()

leagues = [
    'EPL',
    'La_Liga',
    'Bundesliga',
    'Serie_A',
    'Ligue_1'
]

print("🌐 欧州5大リーグの直近7日間の試合日程を取得中...")

upcoming_matches = []

now_utc = datetime.now(timezone.utc)
end_utc = now_utc + timedelta(days=7)

current_season = 2026

for league in leagues:

    try:

        matches = understat.league(league).get_match_data(current_season)

        print(f"[{league}] 全取得件数: {len(matches)}件")

        for m in matches:

            # 日時がない試合は除外
            if not m.get('datetime'):
                continue

            dt_str = m['datetime'].replace('Z', '+00:00')

            match_time = datetime.fromisoformat(dt_str)

            if match_time.tzinfo is None:
                match_time = match_time.replace(
                    tzinfo=timezone.utc
                )

            # 今日～7日後だけ取得
            if not (
                now_utc <= match_time <= end_utc
            ):
                continue

            # 日本時間へ変換
            jst_time = match_time.astimezone(
                timezone(timedelta(hours=9))
            )

            weekdays = [
                '（月）',
                '（火）',
                '（水）',
                '（木）',
                '（金）',
                '（土）',
                '（日）'
            ]

            w_str = weekdays[jst_time.weekday()]

            dt_display = (
                f"{jst_time.strftime('%Y年 %m/%d')}"
                f"{w_str} "
                f"{jst_time.strftime('%H:%M')}"
            )

            upcoming_matches.append({

                "id": str(m['id']),

                "league": league,

                "datetime": dt_display,

                "home_team": m['h']['title'],

                "away_team": m['a']['title'],

                "raw_time": match_time.isoformat()

            })

    except Exception as e:

        print(
            f"⚠️ [{league}] 取得エラー: {e}"
        )


# 日時順に並べる
upcoming_matches.sort(
    key=lambda x: x['raw_time']
)


# ソート用データを削除
for m in upcoming_matches:
    del m['raw_time']


# JSON保存
os.makedirs(
    "src",
    exist_ok=True
)

with open(
    'src/upcoming_matches.json',
    'w',
    encoding='utf-8'
) as f:

    json.dump(
        upcoming_matches,
        f,
        ensure_ascii=False,
        indent=2
    )


print(
    f"✅ 直近7日間の欧州5大リーグ試合: "
    f"{len(upcoming_matches)}件を保存しました！"
)