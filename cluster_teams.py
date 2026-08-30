"""得点・勝敗由来の特徴量から似たチームを分類し、可視化用JSONを生成する。"""

import argparse
import json
import os
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler
from umap import UMAP

DEFAULT_SHOTS_DATA = Path("src/shots_data.json")
DEFAULT_JLEAGUE_HISTORY = Path("src/jleague_history.json")
DEFAULT_OUTPUT = Path("src/team_clusters.json")

FEATURE_KEYS = [
    "avg_goals_for", "avg_goals_against", "win_rate", "draw_rate",
    "home_win_rate", "away_win_rate", "home_advantage", "clean_sheet_rate",
    "scoreless_rate", "close_game_rate", "blowout_rate", "big_win_rate",
]


def parse_args():
    parser = argparse.ArgumentParser(description="試合結果からチームをクラスタリングします")
    parser.add_argument("--shots-data", type=Path, default=DEFAULT_SHOTS_DATA)
    parser.add_argument("--jleague-history", type=Path, default=DEFAULT_JLEAGUE_HISTORY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--k", type=int)
    parser.add_argument("--k-min", type=int, default=4)
    parser.add_argument("--k-max", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--umap-neighbors", type=int, default=15)
    parser.add_argument("--umap-min-dist", type=float, default=0.3)
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


def read_matches(path):
    with path.open(encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError(f"{path} は試合配列ではありません")
    return data


def collect_team_records(matches):
    records = defaultdict(list)
    leagues = defaultdict(Counter)
    for match in matches:
        team_a, team_b = match.get("teamA"), match.get("teamB")
        goals_a, goals_b = match.get("goalsA"), match.get("goalsB")
        if not team_a or not team_b or goals_a is None or goals_b is None:
            continue
        winner, league = match.get("winner"), match.get("league")
        for team, goals_for, goals_against, is_home in (
            (team_a, goals_a, goals_b, True), (team_b, goals_b, goals_a, False)
        ):
            records[team].append({
                "goals_for": int(goals_for), "goals_against": int(goals_against),
                "is_home": is_home,
                "result": "win" if winner == team else ("draw" if winner is None else "loss"),
            })
            if league:
                leagues[team][league] += 1
    return records, leagues


def rate(count, total):
    return count / total if total else 0.0


def compute_features(entries):
    total = len(entries)
    goals_for = [entry["goals_for"] for entry in entries]
    goals_against = [entry["goals_against"] for entry in entries]
    differences = [gf - ga for gf, ga in zip(goals_for, goals_against)]
    home_entries = [entry for entry in entries if entry["is_home"]]
    away_entries = [entry for entry in entries if not entry["is_home"]]
    home_win_rate = rate(sum(entry["result"] == "win" for entry in home_entries), len(home_entries))
    away_win_rate = rate(sum(entry["result"] == "win" for entry in away_entries), len(away_entries))
    features = {
        "avg_goals_for": sum(goals_for) / total,
        "avg_goals_against": sum(goals_against) / total,
        "win_rate": rate(sum(entry["result"] == "win" for entry in entries), total),
        "draw_rate": rate(sum(entry["result"] == "draw" for entry in entries), total),
        "home_win_rate": home_win_rate,
        "away_win_rate": away_win_rate,
        "home_advantage": home_win_rate - away_win_rate,
        "clean_sheet_rate": rate(sum(value == 0 for value in goals_against), total),
        "scoreless_rate": rate(sum(value == 0 for value in goals_for), total),
        "close_game_rate": rate(sum(abs(value) <= 1 for value in differences), total),
        "blowout_rate": rate(sum(abs(value) >= 3 for value in differences), total),
        "big_win_rate": rate(sum(entry["result"] == "win" and difference >= 2 for entry, difference in zip(entries, differences)), total),
    }
    return features, len(home_entries), len(away_entries)


def main():
    args = parse_args()
    matches = read_matches(args.shots_data) + read_matches(args.jleague_history)
    records, leagues = collect_team_records(matches)
    team_names = sorted(records)
    if len(team_names) < 4:
        raise SystemExit("クラスタリングに必要なチーム数がありません")

    feature_rows = []
    team_metadata = []
    for team_name in team_names:
        features, home_matches, away_matches = compute_features(records[team_name])
        feature_rows.append([features[key] for key in FEATURE_KEYS])
        team_metadata.append({
            "team_name": team_name,
            "league": leagues[team_name].most_common(1)[0][0] if leagues[team_name] else None,
            "matches": len(records[team_name]),
            "home_matches": home_matches,
            "away_matches": away_matches,
            "features": features,
        })

    scaled = StandardScaler().fit_transform(np.asarray(feature_rows, dtype=float))
    maximum_k = min(args.k_max, len(team_names) - 1)
    minimum_k = min(args.k_min, maximum_k)
    scores = {}
    if args.k is None:
        for cluster_count in range(minimum_k, maximum_k + 1):
            labels = KMeans(n_clusters=cluster_count, random_state=args.seed, n_init=20).fit_predict(scaled)
            scores[str(cluster_count)] = float(silhouette_score(scaled, labels))
        selected_k = int(max(scores, key=scores.get))
    else:
        if not 2 <= args.k < len(team_names):
            raise SystemExit("--k は2以上かつチーム数未満にしてください")
        selected_k = args.k

    labels = KMeans(n_clusters=selected_k, random_state=args.seed, n_init=20).fit_predict(scaled)
    neighbors = min(max(2, args.umap_neighbors), len(team_names) - 1)
    coordinates = UMAP(
        n_neighbors=neighbors, min_dist=args.umap_min_dist, n_components=2,
        random_state=args.seed, n_jobs=1,
    ).fit_transform(scaled)

    teams = []
    for metadata, cluster_id, coordinate in zip(team_metadata, labels, coordinates):
        teams.append({
            **metadata, "cluster_id": int(cluster_id),
            "umap_x": round(float(coordinate[0]), 5),
            "umap_y": round(float(coordinate[1]), 5),
        })

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "team_count": len(teams),
        "features": FEATURE_KEYS,
        "clustering": {
            "algorithm": "kmeans", "k": selected_k,
            "k_search_range": [minimum_k, maximum_k],
            "silhouette_scores": scores, "random_state": args.seed,
        },
        "projection": {
            "algorithm": "umap", "n_neighbors": neighbors,
            "min_dist": args.umap_min_dist, "random_state": args.seed,
        },
        "teams": teams,
    }
    atomic_write_json(args.output, output)
    print(f"完了: {len(teams)}チームを{selected_k}クラスタに分類し、{args.output}へ保存しました")


if __name__ == "__main__":
    main()
