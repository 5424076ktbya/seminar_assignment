import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import clusterData from '../team_clusters.json';
import upcomingData from '../upcoming_matches.json';
import jleagueMatches from '../jleague_matches.json';
import { canonicalTeamName } from '../dataNormalization';
import { isMatchLocked } from '../matchAvailability';

// J1 uses Tableau colors; the eight-cluster European model uses D3 schemeAccent.
const J1_COLORS = ['#38bdf8', '#4ade80', '#fbbf24', '#f87171', '#c084fc', '#2dd4bf', '#f472b6', '#a3e635'];
const EUROPE_COLORS = ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'];
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

function clusterIdentity(clusterTeams, stats, definitions) {
  const highlights = clusterHighlights(clusterTeams, stats, definitions);
  const scores = Object.fromEntries(highlights.map(item => [item.key, item.score]));
  let name;
  if ((scores.avg_possession || 0) > 0 && (scores.avg_pass_accuracy || 0) > 0) name = 'ポゼッション循環型';
  else if ((scores.avg_shots || 0) > 0 && (scores.avg_high_xg_shots || 0) > 0) name = '攻撃量・決定機型';
  else if ((scores.avg_opponent_passes || 0) < 0 && (scores.first_goal_rate || 0) > 0) name = '前線圧力・先制型';
  else if ((scores.avg_shots || 0) > 0 && (scores.avg_corner_kicks || 0) > 0) name = 'サイド圧力型';
  else if ((scores.avg_free_kicks || 0) > 0 && (scores.first_goal_rate || 0) > 0) name = 'セットプレー先制型';
  else {
    const shortLabels = {
      avg_shots: ['シュート積極', '少数シュート'], avg_corner_kicks: ['CK獲得', 'CK少数'],
      avg_free_kicks: ['FK獲得', 'FK少数'], avg_possession: ['高支配', '低支配'],
      avg_pass_accuracy: ['高精度パス', '縦に速い'], avg_shot_accuracy: ['高精度シュート', '攻撃量重視'],
      avg_high_xg_shots: ['決定機創出', '少数決定機'], avg_opponent_passes: ['守備待機', 'パス制限'],
      first_goal_rate: ['先制主導', '追走展開'], avg_first_goal_minute: ['後半先制', '早期先制']
    };
    name = `${highlights.slice(0, 2).map(item => shortLabels[item.key]?.[item.score >= 0 ? 0 : 1] || item.label).join('・')}型`;
  }
  const description = `全体平均と比べて、${highlights.map(item => item.phrase).join('、')}傾向があります。${highlights.slice(0, 2).map(item => item.label).join('と')}を見ると、このタイプらしいプレーが出ているか判断できます。`;
  return { name, description, highlights };
}

function heatmapColor(score) {
  const strength = Math.min(Math.abs(score) / 2, 1);
  if (score >= 0) return `rgba(244, 114, 182, ${0.16 + strength * 0.7})`;
  return `rgba(14, 165, 233, ${0.16 + strength * 0.7})`;
}

function clusterFeatureAverages(clusterTeams, stats, definitions) {
  return definitions.map(feature => {
    const values = clusterTeams
      .map(team => Number(team.features?.[feature.key]))
      .filter(Number.isFinite);
    const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    return {
      ...feature,
      mean,
      score: (mean - stats[feature.key].mean) / stats[feature.key].std,
    };
  });
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

function ClusterNode({ cx, cy, fill, payload, selectedName, isActiveCluster, showSelectedTeam }) {
  const isSelected = showSelectedTeam && payload?.team_name === selectedName;
  const opacity = isActiveCluster ? 1 : 0.12;
  return (
    <g data-cluster-node="true" style={{ cursor: 'pointer', opacity }}>
      {isSelected && <circle cx={cx} cy={cy} r={12} fill="none" stroke={fill} strokeWidth={3} />}
      {isSelected && <circle cx={cx} cy={cy} r={9} fill="none" stroke="#ffffff" strokeWidth={2} />}
      <circle cx={cx} cy={cy} r={isSelected ? 6.5 : 4.5} fill={fill} stroke={isSelected ? '#ffffff' : 'rgba(15, 23, 42, 0.42)'} strokeWidth={isSelected ? 1.5 : 0.75} />
    </g>
  );
}

export default function TeamClusterChart({ onTeamSelect }) {
  const chartRef = useRef(null);
  const panStateRef = useRef(null);
  const teams = clusterData.teams || [];
  const modelIds = Object.keys(clusterData.models || {});
  const [selectedModel, setSelectedModel] = useState(modelIds.includes('j1_style') ? 'j1_style' : modelIds[0] || '');
  const modelTeams = teams.filter(team => team.model_id === selectedModel);
  const colors = selectedModel === 'j1_style' ? J1_COLORS : EUROPE_COLORS;
  const [selectedName, setSelectedName] = useState('');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [teamScope, setTeamScope] = useState('all');
  const [chartZoom, setChartZoom] = useState(1);
  const [viewCenter, setViewCenter] = useState(null);
  const openMatchTeamNames = useMemo(() => new Set(
    [...(upcomingData || []), ...(jleagueMatches || [])]
      .filter(match => !isMatchLocked(match))
      .flatMap(match => [match.home_team, match.away_team])
      .filter(Boolean)
      .map(canonicalTeamName)
  ), []);
  const openMatchTeams = teams.filter(team => openMatchTeamNames.has(canonicalTeamName(team.team_name)));
  const modelFeatureKeys = clusterData.models?.[selectedModel]?.features || [];
  const definitions = FEATURE_DEFINITIONS.filter(feature => modelFeatureKeys.includes(feature.key));
  const stats = useMemo(() => globalStats(modelTeams, definitions), [selectedModel, teams]);
  const visibleTeams = teamScope === 'open' ? modelTeams.filter(team => openMatchTeamNames.has(canonicalTeamName(team.team_name))) : modelTeams;
  const selected = visibleTeams.find(team => team.team_name === selectedName) || null;
  const clusterIds = [...new Set(visibleTeams.map(team => team.cluster_id))].sort((a, b) => a - b);
  const activeCluster = selectedCluster ?? selected?.cluster_id;
  const similar = selected ? similarTeams(selected, visibleTeams.filter(team => team.cluster_id === selected.cluster_id), stats, definitions) : [];
  const clusterIdentities = Object.fromEntries(clusterIds.map(clusterId => {
    const clusterTeams = modelTeams.filter(team => team.cluster_id === clusterId);
    return [clusterId, clusterIdentity(clusterTeams, stats, definitions)];
  }));
  const clusterHeatmap = Object.fromEntries(clusterIds.map(clusterId => {
    const clusterTeams = modelTeams.filter(team => team.cluster_id === clusterId);
    return [clusterId, clusterFeatureAverages(clusterTeams, stats, definitions)];
  }));
  useEffect(() => {
    if (!selected) {
      onTeamSelect?.(null);
      return;
    }
    onTeamSelect?.({
      teamName: selected.team_name,
      displayName: canonicalTeamName(selected.team_name),
      league: selected.league,
      modelId: selected.model_id,
      clusterName: clusterIdentities[selected.cluster_id]?.name || '',
    });
  }, [selected?.team_name, selected?.model_id]);
  const searchResults = searchQuery.trim()
    ? (teamScope === 'open' ? openMatchTeams : teams).filter(team => canonicalTeamName(team.team_name).toLocaleLowerCase('ja').includes(searchQuery.trim().toLocaleLowerCase('ja'))).slice(0, 8)
    : [];
  const selectTeamAndFocusChart = teamName => {
    setSelectedName(teamName);
    setSelectedCluster(null);
    requestAnimationFrame(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const changeTeamScope = nextScope => {
    setTeamScope(nextScope);
    setSelectedCluster(null);
    setSearchQuery('');
    setSelectedName('');
  };
  const changeZoom = nextZoom => setChartZoom(Math.max(0.6, Math.min(4, nextZoom)));
  const coordinateDomain = (key) => {
    const values = visibleTeams.map(team => Number(team[key])).filter(Number.isFinite);
    if (!values.length) return ['auto', 'auto'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const baseSpan = Math.max(max - min, 1);
    const centerKey = key === 'umap_x' ? 'x' : 'y';
    const center = Number.isFinite(viewCenter?.[centerKey]) ? viewCenter[centerKey] : (min + max) / 2;
    const halfSpan = (baseSpan * 1.12) / (2 * chartZoom);
    return [center - halfSpan, center + halfSpan];
  };
  const xDomain = coordinateDomain('umap_x');
  const yDomain = coordinateDomain('umap_y');

  const startPan = (event) => {
    if (event.button !== 0 || event.target.closest('button') || event.target.closest('[data-cluster-node="true"]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      centerX: (xDomain[0] + xDomain[1]) / 2,
      centerY: (yDomain[0] + yDomain[1]) / 2,
      spanX: xDomain[1] - xDomain[0],
      spanY: yDomain[1] - yDomain[0],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    setViewCenter({
      x: pan.centerX - (dx / pan.width) * pan.spanX,
      y: pan.centerY + (dy / pan.height) * pan.spanY,
    });
  };

  const endPan = (event) => {
    if (panStateRef.current?.pointerId !== event.pointerId) return;
    panStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    setChartZoom(1);
    setViewCenter(null);
  }, [selectedModel, teamScope]);

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
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
        <span style={{ marginRight: '3px', color: '#64748b', fontSize: '11px', fontWeight: 'bold' }}>表示するチーム</span>
        <button type="button" onClick={() => changeTeamScope('all')} style={{ padding: '6px 11px', borderRadius: '6px', border: `1px solid ${teamScope === 'all' ? '#2563eb' : '#cbd5e1'}`, background: teamScope === 'all' ? '#2563eb' : '#fff', color: teamScope === 'all' ? '#fff' : '#475569', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>すべてのチーム</button>
        <button type="button" disabled={!openMatchTeams.length} onClick={() => changeTeamScope('open')} style={{ padding: '6px 11px', borderRadius: '6px', border: `1px solid ${teamScope === 'open' ? '#2563eb' : '#cbd5e1'}`, background: teamScope === 'open' ? '#2563eb' : '#fff', color: teamScope === 'open' ? '#fff' : '#475569', cursor: openMatchTeams.length ? 'pointer' : 'not-allowed', opacity: openMatchTeams.length ? 1 : 0.5, fontSize: '11px', fontWeight: 'bold' }}>予想受付中の試合（{openMatchTeams.length}チーム）</button>
      </div>
      <div style={{ position: 'relative', maxWidth: '520px', marginBottom: '14px' }}>
        <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px' }}>
          チームを検索
          <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="チーム名を入力…" style={{ display: 'block', width: '100%', marginTop: '6px', padding: '9px 11px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }} />
        </label>
        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: '#0f172a', border: '1px solid #475569', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
            {searchResults.map(team => <button key={`${team.model_id}-${team.team_name}`} onClick={() => { setSelectedModel(team.model_id); setSelectedName(team.team_name); setSelectedCluster(null); setSearchQuery(''); }} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 10px', border: 0, borderTop: '1px solid #1e293b', background: 'transparent', color: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}><span>{canonicalTeamName(team.team_name)}</span><span style={{ color: '#94a3b8', fontSize: '11px' }}>{team.league}</span></button>)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {modelIds.map(modelId => {
          const candidates = (teamScope === 'open' ? openMatchTeams : teams).filter(team => team.model_id === modelId);
          return <button key={modelId} disabled={!candidates.length} onClick={() => { setSelectedModel(modelId); setSelectedName(''); setSelectedCluster(null); }} style={{ padding: '7px 12px', borderRadius: '5px', border: 0, cursor: candidates.length ? 'pointer' : 'not-allowed', opacity: candidates.length ? 1 : 0.45, color: '#fff', background: selectedModel === modelId ? '#0284c7' : '#334155' }}>{modelId === 'j1_style' ? 'J1の特徴分類' : '欧州5大リーグの特徴分類'}</button>;
        })}
      </div>
      <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', marginBottom: '14px' }}>
        よく見るチーム
        <select value={selected?.team_name || ''} onChange={event => { setSelectedName(event.target.value); setSelectedCluster(null); }} style={{ display: 'block', width: '100%', maxWidth: '420px', marginTop: '6px', padding: '9px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>
          <option value="">チームを選択してください</option>
          {visibleTeams.map(team => <option key={team.team_name} value={team.team_name}>{canonicalTeamName(team.team_name)}（{team.league}）</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {clusterIds.map(clusterId => (
          <button key={clusterId} onClick={() => setSelectedCluster(current => current === clusterId ? null : clusterId)} style={{ padding: '5px 10px', borderRadius: '999px', border: `1px solid ${colors[clusterId % colors.length]}`, background: selectedCluster === clusterId ? colors[clusterId % colors.length] : 'transparent', color: selectedCluster === clusterId ? '#0f172a' : '#cbd5e1', cursor: 'pointer', fontSize: '11px' }}>{clusterIdentities[clusterId]?.name}</button>
        ))}
      </div>
      <div
        ref={chartRef}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{ position: 'relative', height: '470px', background: '#0f172a', border: 'none', borderRadius: '8px', padding: '8px', scrollMarginTop: '24px', cursor: 'grab', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', zIndex: 10, top: '12px', right: '14px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '7px', background: 'rgba(255,255,255,.94)', boxShadow: '0 3px 10px rgba(15,23,42,.1)' }}>
          <button type="button" aria-label="縮小" onClick={() => changeZoom(Math.round((chartZoom - 0.1) * 10) / 10)} style={{ width: '30px', height: '28px', border: 0, borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>−</button>
          <span style={{ minWidth: '48px', color: '#475569', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>{Math.round(chartZoom * 100)}%</span>
          <button type="button" aria-label="拡大" onClick={() => changeZoom(Math.round((chartZoom + 0.1) * 10) / 10)} style={{ width: '30px', height: '28px', border: 0, borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>＋</button>
          <button type="button" onClick={() => { setChartZoom(1); setViewCenter(null); }} style={{ height: '28px', padding: '0 8px', border: 0, borderRadius: '4px', background: '#f1f5f9', color: '#475569', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>リセット</button>
        </div>
        <span style={{ position: 'absolute', zIndex: 9, top: '52px', right: '14px', padding: '3px 7px', borderRadius: '4px', background: 'rgba(255,255,255,.9)', color: '#64748b', fontSize: '9px' }}>＋－で拡大縮小・ドラッグで移動</span>
        <ResponsiveContainer>
          <ScatterChart accessibilityLayer={false} margin={{ top: 12, right: 18, bottom: 12, left: 0 }}>
            <XAxis type="number" dataKey="umap_x" domain={xDomain} allowDataOverflow hide />
            <YAxis type="number" dataKey="umap_y" domain={yDomain} allowDataOverflow hide />
            <ZAxis range={[55, 100]} />
            <Tooltip cursor={false} content={<ClusterTooltip definitions={definitions} />} />
            {clusterIds.map(clusterId => (
              <Scatter
                key={clusterId}
                name={clusterIdentities[clusterId]?.name}
                data={visibleTeams.filter(team => team.cluster_id === clusterId)}
                fill={colors[clusterId % colors.length]}
                fillOpacity={1}
                isAnimationActive={false}
                shape={props => (
                  <ClusterNode
                    {...props}
                    selectedName={selected?.team_name}
                    isActiveCluster={selectedCluster === null || clusterId === activeCluster}
                    showSelectedTeam={selectedCluster === null}
                  />
                )}
                onClick={point => { const team = point?.payload || point; if (team?.team_name) { setSelectedName(team.team_name); setSelectedCluster(null); } }}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <button
        type="button"
        className="cluster-heatmap-toggle"
        aria-expanded={showHeatmap}
        onClick={() => setShowHeatmap(current => !current)}
        style={{ marginTop: '12px', padding: '9px 13px', border: '1px solid #475569', borderRadius: '6px', background: showHeatmap ? '#1e3a5f' : '#0f172a', color: '#7dd3fc', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
      >
        {showHeatmap ? 'クラスタ特徴ヒートマップを閉じる' : 'クラスタ特徴ヒートマップを表示'}
      </button>
      {showHeatmap && <section style={{ marginTop: '8px', padding: '13px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px' }}>
        <h3 style={{ margin: '0 0 5px', fontSize: '15px' }}>クラスタ特徴ヒートマップ</h3>
        <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '11px', lineHeight: 1.6 }}>
          全チームの平均と比較した各クラスタの特徴です。色が濃いほど、そのプレー傾向が平均から大きく離れています。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `minmax(170px, 1.5fr) repeat(${definitions.length}, minmax(82px, 1fr))`, minWidth: `${170 + definitions.length * 82}px`, gap: '3px' }}>
            <div />
            {definitions.map(feature => (
              <div key={feature.key} style={{ padding: '5px 3px', color: '#cbd5e1', fontSize: '10px', lineHeight: 1.35, textAlign: 'center' }}>
                {feature.label}
              </div>
            ))}
            {clusterIds.map(clusterId => (
              <React.Fragment key={clusterId}>
                <button
                  type="button"
                  className="cluster-heatmap-label"
                  onClick={() => setSelectedCluster(current => current === clusterId ? null : clusterId)}
                  style={{ padding: '8px', border: selectedCluster === clusterId ? `1px solid ${colors[clusterId % colors.length]}` : '1px solid #334155', borderRadius: '4px', background: '#111827', color: '#f8fafc', textAlign: 'left', cursor: 'pointer', fontSize: '11px' }}
                >
                  {clusterIdentities[clusterId]?.name}
                </button>
                {clusterHeatmap[clusterId].map(feature => (
                  <div
                    key={`${clusterId}-${feature.key}`}
                    title={`${clusterIdentities[clusterId]?.name} / ${feature.label}: ${feature.format(feature.mean)}（平均との差 ${feature.score >= 0 ? '+' : ''}${feature.score.toFixed(2)}）`}
                    style={{ display: 'grid', placeItems: 'center', minHeight: '38px', borderRadius: '4px', background: heatmapColor(feature.score), color: '#f8fafc', fontSize: '11px', fontWeight: 700 }}
                  >
                    {feature.score >= 0 ? '+' : ''}{feature.score.toFixed(1)}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', marginTop: '10px', color: '#94a3b8', fontSize: '10px', flexWrap: 'wrap' }}>
          <span>少ない・低い傾向</span>
          <span style={{ width: '120px', height: '8px', borderRadius: '999px', background: 'linear-gradient(90deg, rgba(14,165,233,.85), rgba(148,163,184,.18), rgba(244,114,182,.85))' }} />
          <span>多い・高い傾向</span>
          <span style={{ width: '100%', textAlign: 'center' }}>中央付近は全チームの平均と同程度です</span>
        </div>
      </section>}
      {selected ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginTop: '12px' }}>
        <div style={{ padding: '13px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>{clusterIdentities[activeCluster]?.name}のプレー傾向</h3>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: '12px', lineHeight: 1.7 }}>{clusterIdentities[activeCluster]?.description}</p>
        </div>
        <div style={{ padding: '13px', background: '#0f172a', border: '1px solid #334155', borderRadius: '7px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>{canonicalTeamName(selected.team_name)}に似ているチーム</h3>
          {similar.map((team, index) => (
            <button
              key={team.team_name}
              type="button"
              onClick={() => selectTeamAndFocusChart(team.team_name)}
              style={{ display: 'block', width: '100%', padding: '8px 4px', border: 0, borderTop: index ? '1px solid #1e293b' : 0, background: 'transparent', color: '#f8fafc', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
            >
              <strong>{index + 1}. {canonicalTeamName(team.team_name)}</strong> <span style={{ color: '#94a3b8' }}>（{team.league}）</span>
              <div style={{ color: '#94a3b8', marginTop: '2px' }}>似ている点：{team.shared.join('・')}</div>
            </button>
          ))}
        </div>
      </div> : <div style={{ marginTop: '12px', padding: '13px', border: '1px solid #cbd5e1', borderRadius: '7px', background: '#f8fafc', color: '#475569', fontSize: '12px' }}>
        地図上の点、検索結果、または選択欄から気になるチームを選んでください。
      </div>}
    </div>
  );
}
