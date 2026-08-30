"""Jリーグ公式データサイトからJ1の過去試合結果を取得する基盤。"""

import argparse
import json
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://data.j-league.or.jp"
SEARCH_URL = f"{BASE_URL}/SFMS01/search"
DEFAULT_OUTPUT = Path("src/jleague_history.json")


def parse_args():
    parser = argparse.ArgumentParser(description="Jリーグ公式からJ1の過去結果を取得")
    parser.add_argument("--start-season", type=int, default=2014)
    parser.add_argument("--end-season", type=int, default=2025)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--request-delay", type=float, default=1.0)
    parser.add_argument("--fetch-details", action="store_true")
    parser.add_argument("--detail-workers", type=int, default=4)
    return parser.parse_args()


def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")
        os.replace(temp_name, path)
    except Exception:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
        raise


def parse_date(season, text):
    match = re.search(r"(\d{2})/(\d{2})/(\d{2})", text)
    if not match:
        return None
    short_year, month, day = map(int, match.groups())
    return datetime((season // 100) * 100 + short_year, month, day).strftime("%Y-%m-%d")


def team_cell(cell):
    link = cell.find("a")
    return {
        "name": cell.get_text(" ", strip=True),
        "profile_url": urljoin(BASE_URL, link.get("href")) if link else None,
    }


def parse_results(html, season):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.search-table")
    if table is None:
        raise ValueError(f"{season}年の検索結果テーブルが見つかりません")
    matches = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 8:
            continue
        score_link = row.select_one('a[href*="match_card_id="]')
        if score_link is None:
            continue
        id_match = re.search(r"match_card_id=(\d+)", score_link.get("href", ""))
        score_match = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", score_link.get_text())
        if not id_match or not score_match:
            continue
        match_card_id = id_match.group(1)
        home = team_cell(cells[5])
        away = team_cell(cells[7])
        home_goals, away_goals = map(int, score_match.groups())
        winner = home["name"] if home_goals > away_goals else away["name"] if away_goals > home_goals else None
        date = parse_date(season, cells[3].get_text(" ", strip=True))
        kickoff = cells[4].get_text(" ", strip=True)
        datetime_value = f"{date}T{kickoff}:00+09:00" if date and re.fullmatch(r"\d{1,2}:\d{2}", kickoff) else date
        matches.append({
            "match_id": f"jleague-{match_card_id}",
            "source_match_id": match_card_id,
            "league": "J1",
            "season": season,
            "datetime": datetime_value,
            "home_team": home["name"],
            "away_team": away["name"],
            "teamA": home["name"],
            "teamB": away["name"],
            "goalsA": home_goals,
            "goalsB": away_goals,
            "winner": winner,
            "first_goal_team": None,
            "first_goal_minute": None,
            "stats": {
                home["name"]: {"is_home": True, "goals": home_goals},
                away["name"]: {"is_home": False, "goals": away_goals},
            },
            "source": "jleague_official_data_site",
            "source_url": urljoin(BASE_URL, score_link.get("href")),
            "team_profile_urls": {home["name"]: home["profile_url"], away["name"]: away["profile_url"]},
            "data_quality": {
                "actual": ["goals", "winner", "home_away"],
                "missing": ["total_xg", "possession", "pass_accuracy", "high_xg_shots", "opponent_passes", "shot_accuracy", "first_goal_team", "first_goal_minute"],
            },
        })
    return matches


def fetch_season(session, season):
    response = session.get(
        SEARCH_URL,
        params={"competition_years": season, "competition_frame_ids": 1},
        timeout=30,
    )
    response.raise_for_status()
    return parse_results(response.text, season)


def parse_goal_minute(text):
    """Convert strings such as 07', 31' and 90'+4 to elapsed minutes."""
    match = re.search(r"(\d+)\s*['’](?:\s*\+\s*(\d+))?", text)
    if not match:
        return None
    return int(match.group(1)) + int(match.group(2) or 0)


def parse_match_details(html, home_team, away_team):
    soup = BeautifulSoup(html, "html.parser")
    kick_counts = {}
    for row in soup.select(".score-board-other dl.score-board-base"):
        label = row.select_one("dt")
        left = row.select_one(".left-score")
        right = row.select_one(".right-score")
        if not label or not left or not right:
            continue
        try:
            kick_counts[label.get_text(strip=True).upper()] = (
                int(left.get_text(strip=True)), int(right.get_text(strip=True))
            )
        except ValueError:
            continue

    goal_events = []
    goal_board = soup.select_one(".score-board-pk")
    if goal_board:
        for area, team, time_index in (
            (goal_board.select_one("td.left-area"), home_team, 1),
            (goal_board.select_one("td.right-area"), away_team, 0),
        ):
            if not area:
                continue
            for row in area.select("table tr"):
                cells = row.find_all("td", recursive=False)
                if len(cells) <= time_index:
                    continue
                minute = parse_goal_minute(cells[time_index].get_text(" ", strip=True))
                if minute is not None:
                    goal_events.append((minute, team))
    goal_events.sort(key=lambda event: event[0])
    first_goal = goal_events[0] if goal_events else None
    return {
        "shots": kick_counts.get("SH"),
        "corner_kicks": kick_counts.get("CK"),
        "free_kicks": kick_counts.get("FK"),
        "first_goal_minute": first_goal[0] if first_goal else None,
        "first_goal_team": first_goal[1] if first_goal else None,
    }


def fetch_match_details(match):
    response = requests.get(
        match["source_url"],
        headers={
            "User-Agent": "seminar-assignment-data-collector/1.0 (educational project)",
            "Accept-Language": "ja,en;q=0.8",
        },
        timeout=30,
    )
    response.raise_for_status()
    return parse_match_details(response.text, match["home_team"], match["away_team"])


def apply_match_details(match, details):
    home_team, away_team = match["home_team"], match["away_team"]
    for field in ("shots", "corner_kicks", "free_kicks"):
        values = details.get(field)
        if values:
            match["stats"][home_team][field] = values[0]
            match["stats"][away_team][field] = values[1]
    match["first_goal_minute"] = details.get("first_goal_minute")
    match["first_goal_team"] = details.get("first_goal_team")
    quality = match.setdefault("data_quality", {})
    actual = set(quality.get("actual", []))
    missing = set(quality.get("missing", []))
    for field in ("shots", "corner_kicks", "free_kicks"):
        if details.get(field):
            actual.add(field)
            missing.discard(field)
    if details.get("first_goal_minute") is not None:
        actual.update(("first_goal_team", "first_goal_minute"))
        missing.difference_update(("first_goal_team", "first_goal_minute"))
    quality["actual"] = sorted(actual)
    quality["missing"] = sorted(missing)
    quality["details_fetched"] = True


def enrich_matches(matches, output, workers, start_season, end_season):
    targets = [
        m for m in matches
        if start_season <= int(m.get("season", 0)) <= end_season
        and not m.get("data_quality", {}).get("details_fetched")
    ]
    if not targets:
        print("J1 detail data is already up to date")
        return
    completed = failures = 0
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 6))) as executor:
        future_map = {executor.submit(fetch_match_details, match): match for match in targets}
        for future in as_completed(future_map):
            match = future_map[future]
            try:
                apply_match_details(match, future.result())
                completed += 1
            except Exception as error:
                failures += 1
                print(f"[{match['match_id']}] detail fetch failed: {error}")
            if (completed + failures) % 50 == 0:
                atomic_write_json(output, matches)
                print(f"J1 details: {completed}/{len(targets)} complete, {failures} failed")
    atomic_write_json(output, matches)
    print(f"J1 details finished: {completed} complete, {failures} failed")


def main():
    args = parse_args()
    if args.start_season > args.end_season:
        raise SystemExit("start-season は end-season 以下にしてください")
    session = requests.Session()
    session.headers.update({
        "User-Agent": "seminar-assignment-data-collector/1.0 (educational project)",
        "Accept-Language": "ja,en;q=0.8",
    })
    if args.output.exists():
        with args.output.open(encoding="utf-8") as file:
            all_matches = json.load(file)
    else:
        all_matches = []
    existing_by_id = {match["match_id"]: match for match in all_matches}
    successful_seasons = 0
    for season in range(args.start_season, args.end_season + 1):
        try:
            season_matches = fetch_season(session, season)
        except Exception as error:
            print(f"[{season}] 取得失敗: {error}")
            continue
        successful_seasons += 1
        for match in season_matches:
            old_match = existing_by_id.get(match["match_id"])
            if old_match and old_match.get("data_quality", {}).get("details_fetched"):
                match = old_match
            existing_by_id[match["match_id"]] = match
        all_matches = list(existing_by_id.values())
        all_matches.sort(key=lambda match: (match.get("datetime") or "", match["match_id"]))
        atomic_write_json(args.output, all_matches)
        print(f"[{season}] {len(season_matches)}試合取得（合計 {len(all_matches)}試合）")
        if args.request_delay:
            time.sleep(args.request_delay)
    if successful_seasons == 0:
        raise SystemExit("指定シーズンを1件も取得できませんでした。既存ファイルは変更していません。")
    if args.fetch_details:
        enrich_matches(
            all_matches, args.output, args.detail_workers,
            args.start_season, args.end_season,
        )
    print(f"完了: {args.output} に {len(all_matches)}試合を保存しました")


if __name__ == "__main__":
    main()
