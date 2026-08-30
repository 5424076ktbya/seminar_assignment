"""欧州5大リーグの分析データをUnderstatから差分取得する。"""

import argparse
import json
import os
import tempfile
import time
from pathlib import Path

from understatapi import UnderstatClient

LEAGUES = ["EPL", "La_liga", "Bundesliga", "Serie_A", "Ligue_1"]
DEFAULT_OUTPUT = Path("src/shots_data.json")


def parse_args():
    parser = argparse.ArgumentParser(description="欧州5大リーグの過去分析データを取得")
    parser.add_argument("--start-season", type=int, default=2014)
    parser.add_argument("--end-season", type=int, default=2025)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--request-delay", type=float, default=0.15)
    parser.add_argument("--replace", action="store_true", help="既存データを再利用せず再生成")
    return parser.parse_args()


def load_existing(path, replace):
    if replace or not path.exists():
        return [], {}
    with path.open(encoding="utf-8") as file:
        matches = json.load(file)
    return matches, {str(match["match_id"]): match for match in matches if match.get("match_id")}


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


def get_first_goal(understat, match_id, home_team, away_team, delay):
    try:
        shots_data = understat.match(match_id).get_shot_data()
        shots = [*shots_data.get("h", []), *shots_data.get("a", [])]
        shots.sort(key=lambda shot: int(shot.get("minute", 999)))
        for shot in shots:
            if shot.get("result") == "Goal":
                return home_team if shot.get("h_a") == "h" else away_team, int(shot["minute"])
    except Exception as error:
        print(f"    先制点取得失敗 match_id={match_id}: {error}")
    finally:
        if delay:
            time.sleep(delay)
    return None, None


def estimated_stats(goals, xg, possession, is_home):
    shots = int(xg * 8) + goals + (3 if is_home else 2)
    shot_accuracy = min(90.0, round((goals + 2) / max(1, shots) * 100, 1))
    return {
        "is_home": is_home,
        "goals": goals,
        "shots": shots,
        "on_target_shots": int(shots * (shot_accuracy / 100)),
        "total_xg": xg,
        "possession": possession,
        "pass_accuracy": min(92.0, max(70.0, round(75 + possession * 0.15, 1))),
        "high_xg_shots": max(0, int(xg * 1.5)),
        "opponent_passes": int((100 - possession) * 8),
        "shot_accuracy": shot_accuracy,
    }


def format_match(understat, raw, league, season, delay):
    match_id = str(raw["id"])
    home_team = raw["h"]["title"]
    away_team = raw["a"]["title"]
    home_goals = int(raw["goals"]["h"])
    away_goals = int(raw["goals"]["a"])
    home_xg = float(raw.get("xG", {}).get("h") or 0)
    away_xg = float(raw.get("xG", {}).get("a") or 0)
    total_xg = home_xg + away_xg
    home_possession = round((home_xg / total_xg * 40) + 30, 1) if total_xg else 50.0
    away_possession = round(100 - home_possession, 1)
    first_goal_team, first_goal_minute = get_first_goal(understat, match_id, home_team, away_team, delay)
    winner = home_team if home_goals > away_goals else away_team if away_goals > home_goals else None
    return {
        "match_id": match_id,
        "league": league,
        "season": season,
        "datetime": raw.get("datetime"),
        "home_team": home_team,
        "away_team": away_team,
        "teamA": home_team,
        "teamB": away_team,
        "goalsA": home_goals,
        "goalsB": away_goals,
        "winner": winner,
        "first_goal_team": first_goal_team,
        "first_goal_minute": first_goal_minute,
        "stats": {
            home_team: estimated_stats(home_goals, home_xg, home_possession, True),
            away_team: estimated_stats(away_goals, away_xg, away_possession, False),
        },
        "source": "understat",
        "data_quality": {
            "actual": ["goals", "winner", "total_xg", "first_goal_team", "first_goal_minute"],
            "estimated": ["shots", "on_target_shots", "possession", "pass_accuracy", "high_xg_shots", "opponent_passes", "shot_accuracy"],
        },
    }


def main():
    args = parse_args()
    if args.start_season > args.end_season:
        raise SystemExit("start-season は end-season 以下にしてください")
    all_matches, existing_by_id = load_existing(args.output, args.replace)
    understat = UnderstatClient()
    added = 0

    for league in LEAGUES:
        for season in range(args.start_season, args.end_season + 1):
            print(f"[{league} {season}] 取得中")
            try:
                league_matches = understat.league(league).get_match_data(season)
            except Exception as error:
                print(f"  シーズン取得失敗: {error}")
                continue
            season_added = 0
            for raw in league_matches:
                match_id = str(raw.get("id") or "")
                if not match_id or not raw.get("goals") or raw["goals"].get("h") is None:
                    continue
                if match_id in existing_by_id:
                    existing = existing_by_id[match_id]
                    existing.setdefault("league", league)
                    existing.setdefault("season", season)
                    existing.setdefault("datetime", raw.get("datetime"))
                    existing.setdefault("source", "understat")
                    existing.setdefault("data_quality", {
                        "actual": ["goals", "winner", "total_xg", "first_goal_team", "first_goal_minute"],
                        "estimated": ["shots", "on_target_shots", "possession", "pass_accuracy", "high_xg_shots", "opponent_passes", "shot_accuracy"],
                    })
                    continue
                try:
                    formatted = format_match(understat, raw, league, season, args.request_delay)
                except Exception as error:
                    print(f"  試合変換失敗 match_id={match_id}: {error}")
                    continue
                all_matches.append(formatted)
                existing_by_id[match_id] = formatted
                season_added += 1
                added += 1
            all_matches.sort(key=lambda match: (str(match.get("datetime") or ""), str(match.get("match_id") or "")))
            atomic_write_json(args.output, all_matches)
            print(f"  {season_added}試合追加（合計 {len(all_matches)}試合）")
    print(f"完了: {added}試合を追加し、{args.output} に {len(all_matches)}試合を保存しました")


if __name__ == "__main__":
    main()
