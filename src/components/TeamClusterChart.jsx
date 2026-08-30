import React, { useMemo, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import clusterData from '../team_clusters.json';
import { canonicalTeamName } from '../dataNormalization';

const COLORS = ['#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#c084fc', '#2dd4bf', '#f472b6', '#a3e635'];
const FEATURE_DEFINITIONS = [
  { key: 'avg_shots', label: '平均シュート数', high: 'シュートが多い', low: 'シュートが少ない', format: value => `${value.toFixed(1)}本` },
  { key: 'avg_corner_kicks', label: '平均CK数', high: 'CKが多い', low: 'CKが少ない', format: value => `${value.toFixed(1)}本` },
  { key: 'avg_free_kicks', label: '平均FK数', high: 'FKが多い', low: 'FKが少ない', format: value => `${value.toFixed(1)}本` },
  { key: 'avg_possession', label: '平均支配率', high: '支配率が高い', low: '支配率が低い', format: value => `${value.toFixed(1)}%` },
  { key: 'avg_pass_accuracy', label: '平均パス成功率', high: 'パス精度が高い', low: 'パス精度が低い', format: value => `${value.toFixed(1)}%` },
  { key: 'avg_shot_accuracy', label: '平均枠内シュート率', high: 'シュート精度が高い', low: 'シュート精度が低い', format: value => `${value.toFixed(1)}%` },
  { key: 'avg_high_xg_shots', label: '平均決定機数', high: '決定機が多い', low: '決定機が少ない', format: value => `${value.toFixed(1)}本` },
  { key: 'avg_opponent_passes', label: '相手パス許容数', high: '相手にパスを許す', low: '相手のパスを制限する', format: value => `${value.toFixed(0)}本` },
  { key: 'first_goal_rate', label: '先制率', high: '先制が多い', low: '先制が少ない', format: value => `${(value * 100).toFixed(1)}%` },
  { key: 'avg_first_goal_minute', label: '平均先制時刻', high: '先制が遅い', low: '早い時間に先制する', format: value => `${value.toFixed(1)}分` },
];

function globalStats(teams, definitions) {
  return Object.fromEntries(definitions.map(feature => {
    const values = teams.map(team => Number(team.features?.[feature.key])).filter(Number.isFinite);
    const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length || 1);
    return [feature.key, { mean, std: Math.sqrt(variance) || 1 }];
  }));
}

const zScore = (team, key, stats) => (Number(team.features[key]) - stats[key].mean) / stats[key].std;

function clusterHighlights(clusterTeams, stats, definitions) {
  return definitions.map(feature => {
    const mean = clusterTeams.reduce((sum, team) => sum + Number(team.features[feature.key]), 0) / clusterTeams.length;
    const score = (mean - stats[feature.key].mean) / stats[feature.key].std;
    return { ...feature, mean, score, phrase: score >= 0 ? feature.high : feature.low };
  }).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3);
}

function similarTeams(selected, teams, stats, definitions) {
  return teams.filter(team => team.team_name !== selected.team_name).map(team => {
    const distance = Math.sqrt(definitions.reduce((sum, feature) => {
      const difference = zScore(selected, feature.key, stats) - zScore(team, feature.key, stats);
      return sum + difference ** 2;
    }, 0));
    const shared = definitions.map(feature => ({
      label: feature.label,
      difference: Math.abs(zScore(selected, feature.key, stats) - zScore(team, feature.key, stats))
    })).sort((a, b) => a.difference - b.difference).slice(0, 2).map(item => item.label);
    return { ...team, distance, shared };
  }).sort((a, b) => a.distance - b.distance).slice(0, 5);
}

function ClusterTooltip({ active, payload, definitions }) {
  if (!active || !payload?.[0]?.payload) return null;
  const team = payload[0].payload;
  return (
    <div style={{ padding: '9px 11px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', fontSize: '11px' }}>
      <strong>{canonicalTeamName(team.team_name)}</strong><br />
      {team.league}・{team.matches}試合<br />
      {definitions.slice(0, 3).map(feature => <React.Fragment key={feature.key}>{feature.label} {feature.format(team.features[feature.key])}<br /></React.Fragment>)}
    </div>
  );
}

export default function TeamClusterChart() {
  const teams = clusterData.teams || [];
  const modelIds = Object.keys(clusterData.models || {});
  const [selectedModel, setSelectedModel] = useState(modelIds.includes('j1_style') ? 'j1_style' : modelIds[0] || '');
  const modelTeams = teams.filter(team => team.model_id === selectedModel);
  const [selectedName, setSelectedName] = useState(modelTeams[0]?.team_name || '');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const modelFeatureKeys = clusterData.models?.[selectedModel]?.features || [];
  const definitions = FEATURE_DEFINITIONS.filter(feature => modelFeatureKeys.includes(feature.key));
  const stats = useMemo(() => globalStats(modelTeams, definitions), [selectedModel, teams]);
  const selected = modelTeams.find(team => team.team_name === selectedName) || modelTeams[0];
  const clusterIds = [...new Set(modelTeams.map(team => team.cluster_id))].sort((a, b) => a - b);
  const activeCluster = selectedCluster ?? selected?.cluster_id;
  const activeTeams = modelTeams.filter(team => team.cluster_id === activeCluster);
  const highlights = activeTeams.length ? clusterHighlights(activeTeams, stats, definitions) : [];
  const similar = selected ? similarTeams(selected, modelTeams.filter(team => team.cluster_id === selected.cluster_id), stats, definitions) : [];

  if (!teams.length || !modelIds.length) {
    return (
      <div>
        <h2 style={{ margin: '0 0 6px', color: '#38bdf8', fontSize: '19px' }}>似たチームを見つける</h2>
        <p style={{ color: '#94a3b8', fontSize: '12px' }}>プレースタイル用のクラスタデータはまだ生成されていません。変更をプッシュ後、GitHub ActionsでDatasetを「clusters」にして再実行すると表示されます。</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 6px', color: '#38bdf8', fontSize: '19px' }}>似たチームを見つける</h2>
      <p style={{ margin: '0 0 14px', color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>シュート、支配率、パス精度、CK、FK、先制傾向など、試合で現れる特徴が似ているチームを分類しています。点が近いほどプレースタイルの数値傾向が似ています。</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {modelIds.map(modelId => (
          <button key={modelId} onClick={() => { setSelectedModel(modelId); const first = teams.find(team => team.model_id === modelId); setSelectedName(first?.team_name || ''); setSelectedCluster(null); }} style={{ padding: '7px 12px', borderRadius: '5px', border: 0, cursor: 'pointer', color: '#fff', background: selectedModel === modelId ? '#0284c7' : '#334155' }}>{modelId === 'j1_style' ? 'J1の特徴分類' : '欧州5大リーグの特徴分類'}</button>
        ))}
      </div>
      <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', marginBottom: '14px' }}>
        よく見るチーム
        <select value={selected?.team_name || ''} onChange={event => { setSelectedName(event.target.value); setSelectedCluster(null); }} style={{ display: 'block', width: '100%', maxWidth: '420px', marginTop: '6px', padding: '9px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>
          {modelTeams.map(team => <option key={team.team_name} value={team.team_name}>{canonicalTeamName(team.team_name)}（{team.league}）</option>)}
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
            <Tooltip content={<ClusterTooltip definitions={definitions} />} />
            {clusterIds.map(clusterId => (
              <Scatter key={clusterId} name={`タイプ ${clusterId + 1}`} data={modelTeams.filter(team => team.cluster_id === clusterId)} fill={COLORS[clusterId % COLORS.length]} fillOpacity={clusterId === activeCluster ? 0.95 : 0.2} onClick={point => { const team = point?.payload || point; if (team?.team_name) { setSelectedName(team.team_name); setSelectedCluster(null); } }} />
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
