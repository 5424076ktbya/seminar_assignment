import React, { useEffect, useMemo, useState } from 'react';

const METRIC_DEFINITIONS = [
  { key: 'possession', label: 'ボール支配率', unit: '%', goodDirection: 'high', thresholds: [45, 50, 55, 60, 65] },
  { key: 'shots', label: 'シュート数', unit: '本', goodDirection: 'high', thresholds: [8, 10, 12, 15, 18, 20] },
  { key: 'corner_kicks', label: 'コーナーキック数', unit: '本', goodDirection: 'high', thresholds: [2, 4, 6, 8, 10] },
  { key: 'free_kicks', label: 'フリーキック数', unit: '本', goodDirection: 'high', thresholds: [8, 12, 16, 20, 24] },
  { key: 'shot_accuracy', label: '枠内シュート率', unit: '%', goodDirection: 'high', thresholds: [25, 30, 35, 40, 45, 50] },
  { key: 'pass_accuracy', label: 'パス成功率', unit: '%', goodDirection: 'high', thresholds: [75, 80, 85, 90] },
  { key: 'high_xg_shots', label: '決定機数', unit: '本', goodDirection: 'high', thresholds: [1, 2, 3, 4] },
  { key: 'opponent_passes', label: '相手パス許容数', unit: '本', goodDirection: 'low', thresholds: [250, 300, 350, 400, 450] }
];

const pct = (value, total) => total ? (value / total) * 100 : 0;
const fixed = value => Number.isFinite(value) ? value.toFixed(1) : '—';
const getResult = (match, teamName) => match.winner === teamName ? 'win' : match.winner == null ? 'draw' : 'loss';
const getConfidence = count => count >= 30 ? '高' : count >= 15 ? '中' : '低';
const confidenceColor = confidence => confidence === '高' ? '#22c55e' : confidence === '中' ? '#eab308' : '#f97316';

function getTeamEntries(matches, teamName) {
  return matches
    .filter(match => match?.stats?.[teamName] && (match.teamA === teamName || match.teamB === teamName))
    .map(match => ({ match, stats: match.stats[teamName], result: getResult(match, teamName) }));
}

function average(entries, key) {
  const values = entries.map(entry => Number(entry.stats?.[key])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

function summarizeEntries(entries) {
  const wins = entries.filter(entry => entry.result === 'win').length;
  const draws = entries.filter(entry => entry.result === 'draw').length;
  const losses = entries.length - wins - draws;
  return {
    total: entries.length,
    wins,
    draws,
    losses,
    winRate: pct(wins, entries.length),
    drawRate: pct(draws, entries.length),
    lossRate: pct(losses, entries.length)
  };
}

function conditionCandidates(entries, baseline) {
  const minimumSample = Math.max(5, Math.ceil(entries.length * 0.12));
  const candidates = [];

  METRIC_DEFINITIONS.forEach(metric => {
    metric.thresholds.forEach(threshold => {
      ['above', 'below'].forEach(direction => {
        const qualified = entries.filter(entry => {
          const value = Number(entry.stats?.[metric.key]);
          if (!Number.isFinite(value)) return false;
          return direction === 'above' ? value >= threshold : value <= threshold;
        });
        if (qualified.length < minimumSample || qualified.length === entries.length) return;
        const summary = summarizeEntries(qualified);
        candidates.push({
          id: `${metric.key}-${direction}-${threshold}`,
          label: `${metric.label}${threshold}${metric.unit}${direction === 'above' ? '以上' : '以下'}`,
          metric: metric.label,
          count: qualified.length,
          winRate: summary.winRate,
          lossRate: summary.lossRate,
          winDiff: summary.winRate - baseline.winRate,
          lossDiff: summary.lossRate - baseline.lossRate,
          confidence: getConfidence(qualified.length)
        });
      });
    });
  });

  return candidates;
}

function addFirstGoalCandidates(candidates, entries, teamName, baseline) {
  const minimumSample = Math.max(5, Math.ceil(entries.length * 0.12));
  [15, 30, 45].forEach(minute => {
    const qualified = entries.filter(({ match }) => match.first_goal_team === teamName && match.first_goal_minute != null && Number(match.first_goal_minute) <= minute);
    if (qualified.length < minimumSample) return;
    const summary = summarizeEntries(qualified);
    candidates.push({
      id: `first-goal-${minute}`,
      label: minute === 45 ? '前半に先制' : `${minute}分までに先制`,
      metric: '先制点',
      count: qualified.length,
      winRate: summary.winRate,
      lossRate: summary.lossRate,
      winDiff: summary.winRate - baseline.winRate,
      lossDiff: summary.lossRate - baseline.lossRate,
      confidence: getConfidence(qualified.length)
    });
  });
}

function buildTeamProfile(matches, teamName) {
  if (!teamName) return null;
  const entries = getTeamEntries(matches, teamName);
  if (!entries.length) return null;
  const baseline = summarizeEntries(entries);
  const home = summarizeEntries(entries.filter(entry => entry.stats.is_home === true));
  const away = summarizeEntries(entries.filter(entry => entry.stats.is_home === false));
  const wins = entries.filter(entry => entry.result === 'win');
  const losses = entries.filter(entry => entry.result === 'loss');
  const candidates = conditionCandidates(entries, baseline);
  addFirstGoalCandidates(candidates, entries, teamName, baseline);
  const positivePatterns = [...candidates].filter(item => item.winDiff > 0).sort((a, b) => b.winDiff - a.winDiff || b.count - a.count).slice(0, 3);
  const negativePatterns = [...candidates].filter(item => item.lossDiff > 0).sort((a, b) => b.lossDiff - a.lossDiff || b.count - a.count).slice(0, 3);
  const neutralPatterns = [...candidates].sort((a, b) => Math.abs(a.winDiff) - Math.abs(b.winDiff)).slice(0, 2);
  const recentEntries = [...entries].sort((a, b) => Number(b.match.match_id) - Number(a.match.match_id)).slice(0, 5);
  const recent = summarizeEntries(recentEntries);
  const strongestByMetric = (items, valueKey) => {
    const selected = new Map();
    [...items].sort((a, b) => b[valueKey] - a[valueKey] || b.count - a.count).forEach(item => {
      if (!selected.has(item.metric)) selected.set(item.metric, item);
    });
    return [...selected.values()];
  };
  const watchPoints = [
    ...strongestByMetric(candidates.filter(item => item.winDiff >= 5), 'winDiff').map(item => ({ ...item, type: 'positive', impact: item.winDiff })),
    ...strongestByMetric(candidates.filter(item => item.lossDiff >= 5), 'lossDiff').map(item => ({ ...item, type: 'negative', impact: -item.lossDiff }))
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || b.count - a.count).slice(0, 6);

  return {
    teamName,
    entries,
    baseline,
    home,
    away,
    recent,
    averages: Object.fromEntries(METRIC_DEFINITIONS.map(metric => [metric.key, average(entries, metric.key)])),
    winAverages: Object.fromEntries(METRIC_DEFINITIONS.map(metric => [metric.key, average(wins, metric.key)])),
    lossAverages: Object.fromEntries(METRIC_DEFINITIONS.map(metric => [metric.key, average(losses, metric.key)])),
    positivePatterns,
    negativePatterns,
    neutralPatterns,
    watchPoints
  };
}

function WatchPointChart({ profile }) {
  const points = profile.watchPoints || [];
  if (!points.length) return null;
  const maxImpact = Math.max(10, ...points.map(point => Math.abs(point.impact)));
  const primary = points[0];
  return (
    <div style={{ marginTop: '16px', padding: '15px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px' }}>観戦ポイント重要度マップ</h3>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '11px' }}>中央が通常成績。右は勝利サイン、左は敗北への注意サインです。</p>
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}><span style={{ color: '#f87171' }}>← 注意</span>　通常　<span style={{ color: '#4ade80' }}>勝利サイン →</span></div>
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {points.map(point => {
          const width = Math.max(4, Math.min(50, (Math.abs(point.impact) / maxImpact) * 48));
          const positive = point.impact > 0;
          return (
            <div key={`${point.type}-${point.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px', fontSize: '11px' }}>
                <strong>{point.label}</strong>
                <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{point.count}試合・信頼度{point.confidence}</span>
              </div>
              <div style={{ position: 'relative', height: '24px', background: '#1e293b', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: '#64748b', zIndex: 2 }} />
                <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: positive ? '50%' : `${50 - width}%`, width: `${width}%`, background: positive ? '#16a34a' : '#dc2626', borderRadius: positive ? '0 4px 4px 0' : '4px 0 0 4px' }} />
                <span style={{ position: 'absolute', zIndex: 3, top: '4px', left: positive ? `calc(50% + 7px)` : '7px', color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>
                  {positive ? '+' : '−'}{fixed(Math.abs(point.impact))}pt
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '13px', padding: '10px 12px', borderRadius: '6px', background: '#082f49', fontSize: '12px', lineHeight: 1.7 }}>
        <strong style={{ color: '#7dd3fc' }}>まず見るポイント：</strong>
        {primary.type === 'positive'
          ? `「${primary.label}」へ近づいているか確認してください。過去データでは通常より勝率が${fixed(primary.winDiff)}ポイント高い条件です。`
          : `「${primary.label}」の展開に注意してください。過去データでは通常より敗率が${fixed(primary.lossDiff)}ポイント高い条件です。`}
      </div>
    </div>
  );
}

function RateBox({ label, summary, color = '#38bdf8' }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', padding: '12px' }}>
      <div style={{ color: '#94a3b8', fontSize: '11px' }}>{label}</div>
      <div style={{ color, fontSize: '22px', fontWeight: 'bold', margin: '5px 0' }}>{fixed(summary.winRate)}%</div>
      <div style={{ color: '#94a3b8', fontSize: '11px' }}>{summary.total}試合 {summary.wins}勝 {summary.draws}分 {summary.losses}敗</div>
    </div>
  );
}

function PatternList({ title, items, type }) {
  const isPositive = type === 'positive';
  return (
    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '7px', padding: '13px' }}>
      <h4 style={{ margin: '0 0 9px', fontSize: '13px', color: isPositive ? '#4ade80' : type === 'negative' ? '#f87171' : '#cbd5e1' }}>{title}</h4>
      {items.length === 0 ? <div style={{ color: '#64748b', fontSize: '12px' }}>十分な件数のある特徴がありません。</div> : items.map(item => (
        <div key={item.id} style={{ padding: '7px 0', borderTop: '1px solid #1e293b', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <strong>{item.label}</strong>
            <span style={{ color: confidenceColor(item.confidence), whiteSpace: 'nowrap' }}>信頼度 {item.confidence}</span>
          </div>
          <div style={{ color: '#94a3b8', marginTop: '3px' }}>
            {type === 'negative' ? `敗率 ${fixed(item.lossRate)}%（通常比 +${fixed(item.lossDiff)}pt）` : `勝率 ${fixed(item.winRate)}%（通常比 ${item.winDiff >= 0 ? '+' : ''}${fixed(item.winDiff)}pt）`} / {item.count}件
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamProfile({ profile }) {
  if (!profile) return <div style={{ padding: '18px', color: '#fbbf24', background: '#422006', borderRadius: '7px' }}>このチームの過去試合データはありません。</div>;
  const top = profile.positivePatterns[0];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
        <RateBox label="全データの基本勝率" summary={profile.baseline} />
        <RateBox label="ホーム勝率" summary={profile.home} color="#4ade80" />
        <RateBox label="アウェイ勝率" summary={profile.away} color="#fbbf24" />
        <RateBox label="データ上の直近5試合" summary={profile.recent} color="#c084fc" />
      </div>

      <WatchPointChart profile={profile} />

      <div style={{ marginTop: '12px', padding: '12px', borderRadius: '7px', background: '#082f49', border: '1px solid #0369a1', fontSize: '13px', lineHeight: 1.7 }}>
        <strong style={{ color: '#7dd3fc' }}>観戦ポイント：</strong>
        {top ? `${top.label}の試合では通常より勝率が${fixed(top.winDiff)}ポイント高くなっています。試合中は「${top.metric}」に注目してください。` : '明確な勝利条件を判定できるだけのデータがありません。'}
      </div>

      <h3 style={{ fontSize: '15px', margin: '20px 0 10px' }}>勝った試合・負けた試合の違い</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead><tr style={{ color: '#94a3b8' }}><th style={{ textAlign: 'left', padding: '7px' }}>指標</th><th>全試合</th><th>勝利時</th><th>敗北時</th></tr></thead>
          <tbody>{METRIC_DEFINITIONS.map(metric => (
            <tr key={metric.key} style={{ borderTop: '1px solid #334155' }}>
              <td style={{ padding: '8px 7px' }}>{metric.label}</td>
              <td style={{ textAlign: 'center' }}>{fixed(profile.averages[metric.key])}{metric.unit}</td>
              <td style={{ textAlign: 'center', color: '#4ade80' }}>{fixed(profile.winAverages[metric.key])}{metric.unit}</td>
              <td style={{ textAlign: 'center', color: '#f87171' }}>{fixed(profile.lossAverages[metric.key])}{metric.unit}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px', marginTop: '16px' }}>
        <PatternList title="勝率が上がる条件" items={profile.positivePatterns} type="positive" />
        <PatternList title="敗率が上がる注意条件" items={profile.negativePatterns} type="negative" />
        <PatternList title="勝率への影響が小さい条件" items={profile.neutralPatterns} type="neutral" />
      </div>
    </div>
  );
}

function Comparison({ home, away }) {
  if (!home || !away) return <div style={{ color: '#fbbf24', fontSize: '13px' }}>両チームの過去データが揃うと比較できます。</div>;
  const homePoint = home.positivePatterns[0];
  const awayPoint = away.positivePatterns[0];
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead><tr><th style={{ padding: '8px' }}>注目項目</th><th style={{ color: '#7dd3fc' }}>{home.teamName}</th><th style={{ color: '#fbbf24' }}>{away.teamName}</th></tr></thead>
          <tbody>
            <tr style={{ borderTop: '1px solid #334155' }}><td style={{ padding: '8px' }}>基本勝率</td><td align="center">{fixed(home.baseline.winRate)}%</td><td align="center">{fixed(away.baseline.winRate)}%</td></tr>
            <tr style={{ borderTop: '1px solid #334155' }}><td style={{ padding: '8px' }}>会場別勝率</td><td align="center">{fixed(home.home.winRate)}%（ホーム）</td><td align="center">{fixed(away.away.winRate)}%（アウェイ）</td></tr>
            <tr style={{ borderTop: '1px solid #334155' }}><td style={{ padding: '8px' }}>平均支配率</td><td align="center">{fixed(home.averages.possession)}%</td><td align="center">{fixed(away.averages.possession)}%</td></tr>
            <tr style={{ borderTop: '1px solid #334155' }}><td style={{ padding: '8px' }}>平均シュート数</td><td align="center">{fixed(home.averages.shots)}本</td><td align="center">{fixed(away.averages.shots)}本</td></tr>
            <tr style={{ borderTop: '1px solid #334155' }}><td style={{ padding: '8px' }}>データ上の直近5試合</td><td align="center">{fixed(home.recent.winRate)}%</td><td align="center">{fixed(away.recent.winRate)}%</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '12px', padding: '12px', background: '#0f172a', borderRadius: '7px', fontSize: '13px', lineHeight: 1.7 }}>
        <strong style={{ color: '#38bdf8' }}>この試合の見どころ</strong><br />
        {homePoint ? `${home.teamName}は「${homePoint.label}」` : `${home.teamName}は基本成績`}
        、{awayPoint ? `${away.teamName}は「${awayPoint.label}」` : `${away.teamName}は基本成績`}に注目です。
        試合中にこれらの条件へ近づいているかを見ると、過去の勝利パターンと比較しながら観戦できます。
      </div>
    </div>
  );
}

export default function TeamInsights({ matches, requestedMatch }) {
  const teams = useMemo(() => [...new Set(matches.flatMap(match => [match.teamA, match.teamB]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')), [matches]);
  const [mode, setMode] = useState('team');
  const [team, setTeam] = useState(teams[0] || '');
  const [homeTeam, setHomeTeam] = useState(teams[0] || '');
  const [awayTeam, setAwayTeam] = useState(teams[1] || teams[0] || '');

  useEffect(() => {
    if (!requestedMatch) return;
    setHomeTeam(requestedMatch.homeTeam || '');
    setAwayTeam(requestedMatch.awayTeam || '');
    setMode('comparison');
  }, [requestedMatch]);

  const profile = useMemo(() => buildTeamProfile(matches, team), [matches, team]);
  const homeProfile = useMemo(() => buildTeamProfile(matches, homeTeam), [matches, homeTeam]);
  const awayProfile = useMemo(() => buildTeamProfile(matches, awayTeam), [matches, awayTeam]);
  const teamOptions = value => teams.includes(value) ? teams : [value, ...teams].filter(Boolean);

  return (
    <section id="team-insights" style={{ marginTop: '28px', padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '9px' }}>
      <h2 style={{ margin: '0 0 6px', color: '#38bdf8', fontSize: '19px' }}>チーム特徴・試合前観戦ガイド</h2>
      <p style={{ margin: '0 0 15px', color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>
        過去{matches.length}試合から、各チームの通常勝率との差が大きい条件を抽出します。条件は試合前の確定予想ではなく、試合中に注目するポイントとして利用してください。日付がない試合の直近判定にはmatch_id順を使用します。
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
        <button onClick={() => setMode('team')} style={{ padding: '7px 13px', border: 0, borderRadius: '5px', cursor: 'pointer', color: '#fff', background: mode === 'team' ? '#0284c7' : '#334155' }}>チーム別特徴</button>
        <button onClick={() => setMode('comparison')} style={{ padding: '7px 13px', border: 0, borderRadius: '5px', cursor: 'pointer', color: '#fff', background: mode === 'comparison' ? '#0284c7' : '#334155' }}>対戦カード比較</button>
      </div>

      {mode === 'team' ? (
        <>
          <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', marginBottom: '6px' }}>分析するチーム</label>
          <select value={team} onChange={event => setTeam(event.target.value)} style={{ width: '100%', maxWidth: '380px', padding: '9px', marginBottom: '16px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>
            {teams.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <TeamProfile profile={profile} />
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'end', marginBottom: '16px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '12px' }}>ホームチーム<select value={homeTeam} onChange={event => setHomeTeam(event.target.value)} style={{ display: 'block', width: '100%', padding: '9px', marginTop: '6px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>{teamOptions(homeTeam).map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <span style={{ paddingBottom: '9px', color: '#64748b' }}>VS</span>
            <label style={{ color: '#cbd5e1', fontSize: '12px' }}>アウェイチーム<select value={awayTeam} onChange={event => setAwayTeam(event.target.value)} style={{ display: 'block', width: '100%', padding: '9px', marginTop: '6px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>{teamOptions(awayTeam).map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          <Comparison home={homeProfile} away={awayProfile} />
        </>
      )}
    </section>
  );
}
