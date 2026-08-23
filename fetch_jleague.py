import requests
from bs4 import BeautifulSoup
import json
import os
import re
from datetime import datetime, timedelta


def fetch_j1_matches():

    # 今日の日付
    today = datetime.now().date()

    # 今日から7日後まで
    end_date = today + timedelta(days=7)

    print(f"🌐 Jリーグ公式サイトから試合日程を取得中...")
    print(f"📅 取得期間：{today} ～ {end_date}")

    url = "https://www.jleague.jp/j1/match/"

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/151.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.jleague.jp/"
    }

    matches = []

    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=15
        )

        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # 公式サイト内のリンクを確認
        for link in soup.find_all("a", href=True):

            href = link["href"]
            text = link.get_text(" ", strip=True)

            # 試合ページ以外を除外
            if not re.match(r"^/match/j1/\d{4}/\d{6}/$", href):
                continue

            # --------------------------------
            # URLから試合日を取得
            # 例：
            # /match/j1/2026/082301/
            #             ↓
            #       2026年08月23日
            # --------------------------------

            match = re.search(
                r"/match/j1/(\d{4})/(\d{2})(\d{2})\d{2}/",
                href
            )

            if not match:
                continue

            year = int(match.group(1))
            month = int(match.group(2))
            day = int(match.group(3))

            try:
                match_date = datetime(
                    year,
                    month,
                    day
                ).date()

            except ValueError:
                continue

            # 今日～7日後以外を除外
            if not (today <= match_date <= end_date):
                continue

            # --------------------------------
            # textから試合情報を取得
            # --------------------------------

            # 試合前
            # 例：
            # ＦＣ町田ゼルビア 町田 19:30 浦和レッズ 浦和 ...
            #
            # 試合後
            # 例：
            # 鹿島アントラーズ 鹿島 3 試合終了 2 アビスパ福岡 福岡 ...

            # 「試合終了」が含まれている場合
            finished_pattern = re.search(
                r"^(.+?)\s+\S+\s+(\d+)\s+試合終了\s+(\d+)\s+(.+?)\s+\S+\s+",
                text
            )

            # 試合前の場合
            upcoming_pattern = re.search(
                r"^(.+?)\s+\S+\s+(\d{1,2}:\d{2})\s+(.+?)\s+\S+\s+",
                text
            )

            home_team = None
            away_team = None
            kick_off = None
            home_score = None
            away_score = None
            result = None

            if finished_pattern:

                home_team = finished_pattern.group(1).strip()
                home_score = int(finished_pattern.group(2))
                away_score = int(finished_pattern.group(3))
                away_team = finished_pattern.group(4).strip()

                kick_off_match = re.search(
                    r"(\d{1,2}:\d{2})\s+KO",
                    text
                )

                if kick_off_match:
                    kick_off = kick_off_match.group(1)

                if home_score > away_score:
                    result = "home_win"
                elif home_score < away_score:
                    result = "away_win"
                else:
                    result = "draw"

            elif upcoming_pattern:

                home_team = upcoming_pattern.group(1).strip()
                kick_off = upcoming_pattern.group(2)
                away_team = upcoming_pattern.group(3).strip()

            else:
                continue

            # --------------------------------
            # 重複チェック
            # --------------------------------

            if any(m["id"] == href for m in matches):
                continue

            # --------------------------------
            # JSONに保存
            # --------------------------------

            matches.append({
                "id": href,
                "league": "J1 League",
                "date": match_date.strftime("%Y-%m-%d"),
                "datetime": (
                    f"{match_date.strftime('%Y-%m-%d')} "
                    f"{kick_off}"
                    if kick_off
                    else match_date.strftime("%Y-%m-%d")
                ),
                "home_team": home_team,
                "away_team": away_team,
                "home_score": home_score,
                "away_score": away_score,
                "result": result,
                "url": "https://www.jleague.jp" + href
            })

        # 日付順に並べる
        matches.sort(
            key=lambda x: x["datetime"]
        )

        return matches

    except Exception as e:

        print(f"❌ エラーが発生しました：{e}")

        return []


if __name__ == "__main__":

    matches = fetch_j1_matches()

    if len(matches) == 0:

        print("⚠️ 試合データが取得できませんでした")
        exit()

    output_path = "src/jleague_matches.json"

    os.makedirs(
        "src",
        exist_ok=True
    )

    with open(
        output_path,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            matches,
            f,
            ensure_ascii=False,
            indent=2
        )

    print()
    print("====================================")
    print(f"✅ {len(matches)}試合を取得しました")
    print(f"📁 保存先：{output_path}")
    print("====================================")

    for match in matches:

        print(
            f"{match['datetime']}  "
            f"{match['home_team']} vs "
            f"{match['away_team']}"
        )