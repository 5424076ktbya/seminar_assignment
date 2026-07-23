import os
import json

def analyze_match_laws(folder_path):
    matches_summary = []
    
    if not os.path.exists(folder_path):
        print(f"エラー: {folder_path} フォルダが見つかりません。")
        return
        
    files = [f for f in os.listdir(folder_path) if f.endswith('.json')]
    print(f"{len(files)}件の試合データから「7つの観戦法則（ホーム/アウェイ対応）」データを抽出中...")

    for file_name in files:
        with open(os.path.join(folder_path, file_name), 'r', encoding='utf-8') as f:
            try:
                events = json.load(f)
            except:
                continue

            if not events:
                continue

            # イベントデータ内のチーム一覧を取得
            teams = list(set([ev.get('team', {}).get('name') for ev in events if ev.get('team', {}).get('name')]))
            if len(teams) < 2:
                continue

            # 1番目をHome、2番目をAwayとして定義
            home_team, away_team = teams[0], teams[1]
            
            stats = {
                home_team: {'is_home': True, 'goals': 0, 'shots': 0, 'on_target_shots': 0, 'passes': 0, 'successful_passes': 0, 'high_xg_shots': 0, 'total_xg': 0.0},
                away_team: {'is_home': False, 'goals': 0, 'shots': 0, 'on_target_shots': 0, 'passes': 0, 'successful_passes': 0, 'high_xg_shots': 0, 'total_xg': 0.0}
            }

            first_goal_team = None
            first_goal_minute = None

            for ev in events:
                t = ev.get('team', {}).get('name')
                if t not in stats:
                    continue

                ev_type = ev.get('type', {}).get('name')

                # パス関連の集計
                if ev_type == 'Pass':
                    stats[t]['passes'] += 1
                    pass_outcome = ev.get('pass', {}).get('outcome', {}).get('name')
                    if not pass_outcome:  # None＝成功
                        stats[t]['successful_passes'] += 1

                # シュート関連の集計
                elif ev_type == 'Shot':
                    shot = ev.get('shot', {})
                    xg = shot.get('statsbomb_xg', 0.0)
                    outcome = shot.get('outcome', {}).get('name', '')
                    minute = ev.get('minute', 0)

                    stats[t]['shots'] += 1
                    stats[t]['total_xg'] += xg

                    if outcome in ['Goal', 'Saved', 'Saved to Post', 'Post']:
                        stats[t]['on_target_shots'] += 1

                    if xg >= 0.15:
                        stats[t]['high_xg_shots'] += 1

                    if outcome == 'Goal':
                        stats[t]['goals'] += 1
                        if first_goal_team is None:
                            first_goal_team = t
                            first_goal_minute = minute

            # 支配率、成功率、相手パス数の計算
            total_passes = stats[home_team]['passes'] + stats[away_team]['passes']
            
            for t, opp in [(home_team, away_team), (away_team, home_team)]:
                stats[t]['possession'] = round((stats[t]['passes'] / total_passes * 100), 1) if total_passes > 0 else 50.0
                stats[t]['pass_accuracy'] = round((stats[t]['successful_passes'] / stats[t]['passes'] * 100), 1) if stats[t]['passes'] > 0 else 0.0
                stats[t]['shot_accuracy'] = round((stats[t]['on_target_shots'] / stats[t]['shots'] * 100), 1) if stats[t]['shots'] > 0 else 0.0
                stats[t]['opponent_passes'] = stats[opp]['passes']

            # 勝敗判定
            goalsA = stats[home_team]['goals']
            goalsB = stats[away_team]['goals']

            if goalsA > goalsB:
                winner = home_team
            elif goalsB > goalsA:
                winner = away_team
            else:
                winner = None

            matches_summary.append({
                'home_team': home_team,
                'away_team': away_team,
                'teamA': home_team,
                'teamB': away_team,
                'goalsA': goalsA,
                'goalsB': goalsB,
                'winner': winner,
                'first_goal_team': first_goal_team,
                'first_goal_minute': first_goal_minute,
                'stats': stats
            })

    os.makedirs('src', exist_ok=True)
    with open('src/shots_data.json', 'w', encoding='utf-8') as out_f:
        json.dump(matches_summary, out_f, ensure_ascii=False, indent=2)

    print(f"成功！ {len(matches_summary)} 試合の「7つの法則データ」を 'src/shots_data.json' に保存しました。")

if __name__ == "__main__":
    analyze_match_laws('./events')