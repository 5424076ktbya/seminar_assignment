import requests
from bs4 import BeautifulSoup
import json
import os

def fetch_jleague_matches():
    # Sportsnavi J1日程ページ
    url = "https://soccer.yahoo.co.jp/jleague/category/j1/schedule"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"❌ データの取得に失敗しました (Status Code: {response.status_code})")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    matches = []

    # 試合テーブルの各行（trタグ）を広く探索
    rows = soup.find_all('tr')
    
    match_index = 1
    for row in rows:
        # チーム名やスコアが含まれるリンク要素を探す
        team_links = row.find_all('a')
        # チーム名テキストを取得
        teams = [a.text.strip() for a in team_links if "/jleague/teams/" in a.get('href', '')]

        # 1つの行に2つのチームがあれば試合とみなす
        if len(teams) >= 2:
            home_team = teams[0]
            away_team = teams[1]

            # 日時やスコアテキストを取得
            row_text = row.text.strip()
            
            # スコアの判定 (例: "1 - 2" や "1-2")
            result = None
            score_elem = row.find(class_=lambda c: c and 'score' in c.lower()) if row else None
            
            if score_elem:
                score_text = score_elem.text.strip()
                if '-' in score_text:
                    parts = score_text.split('-')
                    if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                        h_score = int(parts[0].strip())
                        a_score = int(parts[1].strip())
                        if h_score > a_score:
                            result = "home"
                        elif a_score > h_score:
                            result = "away"
                        else:
                            result = "draw"

            # 日時表記の簡易取得
            date_elem = row.find(class_=lambda c: c and 'date' in c.lower())
            date_str = date_elem.text.strip() if date_elem else "2026 Season"

            matches.append({
                "id": f"j1_match_{match_index}",
                "league": "J1 League",
                "datetime": date_str,
                "home_team": home_team,
                "away_team": away_team,
                "result": result
            })
            match_index += 1

    return matches

if __name__ == "__main__":
    print("🇯🇵 Jリーグ(J1)の最新日程・結果を取得中...")
    matches = fetch_jleague_matches()

    # もし上記で0件の場合はダミー/サンプルのJ1データを自動生成して画面表示を確認できるようにするフォールバック処理
    if len(matches) == 0:
        print("⚠️ ライブスクレイピングで0件だったため、J1の標準データを読み込みます...")
        matches = [
            {"id": "j1_sample_1", "league": "J1 League", "datetime": "2026-08-01 19:00", "home_team": "鹿島アントラーズ", "away_team": "横浜F・マリノス", "result": None},
            {"id": "j1_sample_2", "league": "J1 League", "datetime": "2026-08-01 19:00", "home_team": "川崎フロンターレ", "away_team": "FC東京", "result": None},
            {"id": "j1_sample_3", "league": "J1 League", "datetime": "2026-08-02 18:00", "home_team": "ヴィッセル神戸", "away_team": "ガンバ大阪", "result": None},
            {"id": "j1_sample_4", "league": "J1 League", "datetime": "2026-07-25 19:00", "home_team": "サンフレッチェ広島", "away_team": "名古屋グランパス", "result": "home"},
            {"id": "j1_sample_5", "league": "J1 League", "datetime": "2026-07-25 19:00", "home_team": "浦和レッズ", "away_team": "セレッソ大阪", "result": "draw"}
        ]

    output_path = "src/jleague_matches.json"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(matches, f, ensure_ascii=False, indent=2)

    print(f"✅ {output_path} に {len(matches)} 件のJリーグ試合データを保存しました！")