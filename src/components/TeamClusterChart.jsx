import React, { useMemo, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import clusterData from '../team_clusters.json';
import { canonicalTeamName } from '../dataNormalization';

const COLORS = ['#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#c084fc', '#2dd4bf', '#f472b6', '#a3e635'];
const FEATURE_DEFINITIONS = [
  { key: 'avg_goals_for', label: '平均得点', high: '得点力が高い', low: '得点数が少ない', format: value => value.toFixed(2) },
  { key: 'avg_goals_against', label: '平均失点', high: '失点が多い', low: '失点が少ない', format: value => value.toFixed(2) },
  { key: 'win_rate', label: '勝率', high: '勝率が高い', low: '勝率が低い', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'draw_rate', label: '引分率', high: '引き分けが多い', low: '引き分けが少ない', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'home_win_rate', label: 'ホーム勝率', high: 'ホームに強い', low: 'ホーム勝率が低い', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'away_win_rate', label: 'アウェイ勝率', high: 'アウェイに強い', low: 'アウェイ勝率が低い', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'home_advantage', label: 'ホーム優位度', high: 'ホーム依存が強い', low: 'アウェイでも成績が落ちにくい', format: value => `${(value * 100).toFixed(1)}pt` },
  { key: 'clean_sheet_rate', label: '無失点率', high: '無失点が多い', low: '無失点が少ない', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'scoreless_rate', label: '無得点率', high: '無得点が多い', low: '無得点が少ない', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'close_game_rate', label: '接戦率', high: '接戦が多い', low: '点差が開きやすい', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'blowout_rate', label: '大差試合率', high: '大差の試合が多い', low: '大差の試合が少ない', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'big_win_rate', label: '複数点差勝利率', high: '複数点差の勝利が多い', low: '大勝が少ない', format: value => `${(value * 100).toFixed(1)}%` },
];

function globalStats(teams) {
  return Object.fromEntries(FEATURE_DEFINITIONS.map(feature => {
    const values = teams.map(team => Number(team.features?.[feature.key])).filter(Number.isFinite);
    const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length || 1);
    return [feature.key, { mean, std: Math.sqrt(variance) || 1 }];
  }));
}

const zScore = (team, key, stats) => (Number(team.features[key]) - stats[key].mean) / stats[key].std;

function clusterHighlights(clusterTeams, stats) {
  return FEATURE_DEFINITIONS.map(feature => {
    const mean = clusterTeams.reduce((sum, team) => sum + Number(team.features[feature.key]), 0) / clusterTeams.length;
    const score = (mean - stats[feature.key].mean) / stats[feature.key].std;
    return { ...feature, mean, score, phrase: score >= 0 ? feature.high : feature.low };
  }).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3);
}

function similarTeams(selected, teams, stats) {
  return teams.filter(team => team.team_name !== selected.team_name).map(team => {
    const distance = Math.sqrt(FEATURE_DEFINITIONS.reduce((sum, feature) => {
      const difference = zScore(selected, feature.key, stats) - zScore(team, feature.key, stats);
      return sum + difference ** 2;
    }, 0));
    const shared = FEATURE_DEFINITIONS.map(feature => ({
      label: feature.label,
      difference: Math.abs(zScore(selected, feature.key, stats) - zScore(team, feature.key, stats))
    })).sort((a, b) => a.difference - b.difference).slice(0, 2).map(item => item.label);
    return { ...team, distance, shared };
  }).sort((a, b) => a.distance - b.distance).slice(0, 5);
}

function ClusterTooltip({ active, payload }) {
  if (!active || !payload?.[0]?.payload) return null;
  const team = payload[0].payload;
  return (
    <div style={{ padding: '9px 11px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', fontSize: '11px' }}>
      <strong>{canonicalTeamName(team.team_name)}</strong><br />
      {team.league}・{team.matches}試合<br />
      勝率 {(team.features.win_rate * 100).toFixed(1)}%<br />
      平均得点 {team.features.avg_goals_for.toFixed(2)} / 失点 {team.features.avg_goals_against.toFixed(2)}
    </div>
  );
}

export default function TeamClusterChart() {
  const teams = clusterData.teams || [];
  const [selectedName, setSelectedName] = useState(teams[0]?.team_name || '');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const stats = useMemo(() => globalStats(teams), [teams]);
  const selected = teams.find(team => team.team_name === selectedName) || teams[0];
  const clusterIds = [...new Set(teams.map(team => team.cluster_id))].sort((a, b) => a - b);
  const activeCluster = selectedCluster ?? selected?.cluster_id;
  const activeTeams = teams.filter(team => team.cluster_id === activeCluster);
  const highlights = activeTeams.length ? clusterHighlights(activeTeams, stats) : [];
  const similar = selected ? similarTeams(selected, teams.filter(team => team.cluster_id === selected.cluster_id), stats) : [];

  if (!teams.length) {
    return (
      <div>
        <h2 style={{ margin: '0 0 6px', color: '#38bdf8', fontSize: '19px' }}>似たチームを見つける</h2>
        <p style={{ color: '#94a3b8', fontSize: '12px' }}>クラスタデータはまだ生成されていません。GitHub ActionsでDatasetを「clusters」にして実行すると表示されます。</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', color: '#38bdf8', fontSize: '19px' }}>似たチームを見つける</h2>
      <p style={{ margin: '0 0 14px', color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>得点・失点・勝敗・ホーム／アウェイ成績が似ているチームを分類しています。点が近いほど試合結果の傾向が似ています。</p>
      <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', marginBottom: '14px' }}>
        よく見るチーム
        <select value={selected?.team_name || ''} onChange={event => { setSelectedName(event.target.value); setSelectedCluster(null); }} style={{ display: 'block', width: '100%', maxWidth: '420px', marginTop: '6px', padding: '9px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>
          {teams.map(team => <option key={team.team_name} value={team.team_name}>{canonicalTeamName(team.team_name)}（{team.league}）</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {clusterIds.map(clusterId => (
          <button key={clusterId} onClick={() => setSelectedCluster(clusterId)} style={{ padding: '5px 10px', borderRadius: '999px', border: `1px solid ${COLORS[clusterId % COLORS.length]}`, background: activeCluster === clusterId ? COLORS[clusterId % COLORS.length] : 'transparent', color: activeCluster === clusterId ? '#0f172a' : '#cbd5e1', cursor: 'pointer', fontSize: '11px' }}>タイプ {clusterId + 1}</button>
        ))}
      </div>
      <div style={{ height: '470px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px' }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 18, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="umap_x" hide />
            <YAxis type="number" dataKey="umap_y" hide />
            <ZAxis range={[55, 100]} />
            <Tooltip content={<ClusterTooltip />} />
            {clusterIds.map(clusterId => (
              <Scatter key={clusterId} name={`タイプ ${clusterId + 1}`} data={teams.filter(team => team.cluster_id === clusterId)} fill={COLORS[clusterId % COLORS.length]} fillOpacity={clusterId === activeCluster ? 0.95 : 0.2} onClick={point => { const team = point?.payload || point; if (team?.team_name) { setSelectedName(team.team_name); setSelectedCluster(null); } }} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginTop: '12px' }}>
        <div style={{ padding: '13px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>タイプ {activeCluster + 1} の観戦ポイント</h3>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: '12px', lineHeight: 1.7 }}>{highlights.map(item => item.phrase).join('、')}チームが集まっています。試合では{highlights.slice(0, 2).map(item => item.label).join('と')}に注目すると、このタイプらしい展開か確認できます。</p>
        </div>
        <div style={{ padding: '13px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>{canonicalTeamName(selected.team_name)}に似ているチーム</h3>
          {similar.map((team, index) => <div key={team.team_name} style={{ padding: '6px 0', borderTop: index ? '1px solid #1e293b' : 0, fontSize: '12px' }}><strong>{index + 1}. {canonicalTeamName(team.team_name)}</strong> <span style={{ color: '#94a3b8' }}>（{team.league}）</span><div style={{ color: '#94a3b8', marginTop: '2px' }}>似ている点：{team.shared.join('・')}</div></div>)}
        </div>
      </div>
    </div>
  );
}
