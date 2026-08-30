"""試合スタッツからプレースタイルが似たチームを分類する。"""

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

MODEL_FEATURES = {
    "j1_style": ["avg_shots", "avg_corner_kicks", "avg_free_kicks", "first_goal_rate", "avg_first_goal_minute"],
    "europe_style": ["avg_shots", "avg_possession", "avg_pass_accuracy", "avg_shot_accuracy", "avg_high_xg_shots", "avg_opponent_passes", "first_goal_rate", "avg_first_goal_minute"],
}


def parse_args():
    parser = argparse.ArgumentParser(description="スタッツから似たチームをクラスタリングします")
    parser.add_argument("--shots-data", type=Path, default=DEFAULT_SHOTS_DATA)
    parser.add_argument("--jleague-history", type=Path, default=DEFAULT_JLEAGUE_HISTORY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--k", type=int)
    parser.add_argument("--k-min", type=int, default=4)
    parser.add_argument("--k-max", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--umap-neighbors", type=int, default=12)
    parser.add_argument("--umap-min-dist", type=float, default=1.4)
    parser.add_argument("--umap-spread", type=float, default=3.5)
    parser.add_argument("--umap-repulsion-strength", type=float, default=2.0)
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


def model_for_match(match):
    return "j1_style" if match.get("league") == "J1" else "europe_style"


def collect_team_records(matches):
    records = defaultdict(list)
    leagues = defaultdict(Counter)
    models = {}
    for match in matches:
        team_a, team_b = match.get("teamA"), match.get("teamB")
        if not team_a or not team_b:
            continue
        model_id = model_for_match(match)
        for team in (team_a, team_b):
            stats = match.get("stats", {}).get(team)
            if not isinstance(stats, dict):
                continue
            records[team].append({"match": match, "stats": stats})
            models[team] = model_id
            if match.get("league"):
                leagues[team][match["league"]] += 1
    return records, leagues, models


def mean_available(entries, field):
    values = [float(entry["stats"][field]) for entry in entries if entry["stats"].get(field) is not None]
    return (sum(values) / len(values), len(values) / len(entries)) if values else (None, 0.0)


def compute_style_features(entries, team_name, model_id):
    field_map = {
        "avg_shots": "shots", "avg_corner_kicks": "corner_kicks", "avg_free_kicks": "free_kicks",
        "avg_possession": "possession", "avg_pass_accuracy": "pass_accuracy",
        "avg_shot_accuracy": "shot_accuracy", "avg_high_xg_shots": "high_xg_shots",
        "avg_opponent_passes": "opponent_passes",
    }
    features, coverage = {}, {}
    for feature_key in MODEL_FEATURES[model_id]:
        if feature_key in field_map:
            features[feature_key], coverage[feature_key] = mean_available(entries, field_map[feature_key])

    known_first_goals = [entry for entry in entries if entry["match"].get("first_goal_minute") is not None]
    team_first_goals = [entry for entry in known_first_goals if entry["match"].get("first_goal_team") == team_name]
    features["first_goal_rate"] = len(team_first_goals) / len(known_first_goals) if known_first_goals else None
    coverage["first_goal_rate"] = len(known_first_goals) / len(entries)
    features["avg_first_goal_minute"] = (
        sum(float(entry["match"]["first_goal_minute"]) for entry in team_first_goals) / len(team_first_goals)
        if team_first_goals else None
    )
    coverage["avg_first_goal_minute"] = len(team_first_goals) / len(entries)
    return features, coverage


def impute_feature_rows(team_rows, feature_keys):
    medians = {}
    for key in feature_keys:
        values = [row["features"].get(key) for row in team_rows if row["features"].get(key) is not None]
        medians[key] = float(np.median(values)) if values else 0.0
    matrix = []
    for row in team_rows:
        for key in feature_keys:
            if row["features"].get(key) is None:
                row["features"][key] = medians[key]
                row.setdefault("imputed_features", []).append(key)
        matrix.append([row["features"][key] for key in feature_keys])
    return np.asarray(matrix, dtype=float)


def cluster_model(team_rows, feature_keys, args):
    matrix = impute_feature_rows(team_rows, feature_keys)
    scaled = StandardScaler().fit_transform(matrix)
    maximum_k = min(args.k_max, len(team_rows) - 1)
    minimum_k = min(args.k_min, maximum_k)
    scores = {}
    if args.k is None:
        for cluster_count in range(minimum_k, maximum_k + 1):
            labels = KMeans(n_clusters=cluster_count, random_state=args.seed, n_init=20).fit_predict(scaled)
            scores[str(cluster_count)] = float(silhouette_score(scaled, labels))
        selected_k = int(max(scores, key=scores.get))
    else:
        selected_k = min(args.k, len(team_rows) - 1)
    labels = KMeans(n_clusters=selected_k, random_state=args.seed, n_init=20).fit_predict(scaled)
    neighbors = min(max(2, args.umap_neighbors), len(team_rows) - 1)
    coordinates = UMAP(
        n_neighbors=neighbors,
        min_dist=args.umap_min_dist,
        spread=args.umap_spread,
        repulsion_strength=args.umap_repulsion_strength,
        n_components=2,
        random_state=args.seed,
        n_jobs=1,
    ).fit_transform(scaled)
    for row, label, coordinate in zip(team_rows, labels, coordinates):
        row["cluster_id"] = int(label)
        row["umap_x"] = round(float(coordinate[0]), 5)
        row["umap_y"] = round(float(coordinate[1]), 5)
    return {"k": selected_k, "silhouette_scores": scores, "n_neighbors": neighbors}


def main():
    args = parse_args()
    matches = read_matches(args.shots_data) + read_matches(args.jleague_history)
    records, leagues, team_models = collect_team_records(matches)
    teams_by_model = defaultdict(list)
    for team_name in sorted(records):
        model_id = team_models[team_name]
        features, coverage = compute_style_features(records[team_name], team_name, model_id)
        teams_by_model[model_id].append({
            "team_name": team_name, "league": leagues[team_name].most_common(1)[0][0],
            "model_id": model_id, "matches": len(records[team_name]),
            "features": features, "coverage": coverage,
        })

    model_metadata = {}
    all_teams = []
    for model_id, feature_keys in MODEL_FEATURES.items():
        rows = teams_by_model.get(model_id, [])
        if len(rows) < 4:
            continue
        result = cluster_model(rows, feature_keys, args)
        model_metadata[model_id] = {
            "features": feature_keys, "team_count": len(rows), "k": result["k"],
            "silhouette_scores": result["silhouette_scores"], "n_neighbors": result["n_neighbors"],
        }
        all_teams.extend(rows)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "team_count": len(all_teams),
        "clustering": {"algorithm": "kmeans", "random_state": args.seed},
        "projection": {
            "algorithm": "umap", "n_neighbors": args.umap_neighbors,
            "min_dist": args.umap_min_dist, "spread": args.umap_spread,
            "repulsion_strength": args.umap_repulsion_strength,
            "random_state": args.seed,
        },
        "models": model_metadata, "teams": all_teams,
    }
    atomic_write_json(args.output, output)
    print(f"完了: {len(all_teams)}チームをプレースタイルで分類しました")


if __name__ == "__main__":
    main()
