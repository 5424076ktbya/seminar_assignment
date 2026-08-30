import React, { useState, useMemo, useEffect, Component } from 'react';
import matchesDataUrl from './shots_data.json?url';
import jleagueHistoryDataUrl from './jleague_history.json?url';
import UpcomingMatches from './components/UpcomingMatches'; // 今週の試合予想コンポーネントを追加
import LegalModal from './components/LegalModal';
import TeamInsights from './components/TeamInsights';
import TeamClusterChart from './components/TeamClusterChart';
import { canonicalizeRequestedMatch, normalizeMatch } from './dataNormalization';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// クラッシュ防止用のエラーバウンダリ
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary Caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ef4444', backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2>⚠️ 描画エラーが発生しました</h2>
          <p style={{ color: '#cbd5e1' }}>データまたは処理ロジックでエラーが検出されました。</p>
          <pre style={{ background: '#1e293b', padding: '15px', borderRadius: '6px', overflow: 'auto', color: '#f8fafc' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>
            ページを再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const [matchesData, setMatchesData] = useState([]);
  const [jleagueHistoryData, setJleagueHistoryData] = useState([]);
  const [dataLoadState, setDataLoadState] = useState({ loading: true, error: null });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(matchesDataUrl).then(response => {
        if (!response.ok) throw new Error(`欧州データの取得に失敗しました (${response.status})`);
        return response.json();
      }),
      fetch(jleagueHistoryDataUrl).then(response => {
        if (!response.ok) throw new Error(`J1データの取得に失敗しました (${response.status})`);
        return response.json();
      })
    ]).then(([europeData, jleagueData]) => {
      if (!active) return;
      setMatchesData(Array.isArray(europeData) ? europeData : []);
      setJleagueHistoryData(Array.isArray(jleagueData) ? jleagueData : []);
      setDataLoadState({ loading: false, error: null });
    }).catch(error => {
      if (active) setDataLoadState({ loading: false, error: error.message });
    });
    return () => { active = false; };
  }, []);

  const allMatches = useMemo(() => [
    ...(Array.isArray(matchesData) ? matchesData : []),
    ...(Array.isArray(jleagueHistoryData) ? jleagueHistoryData : [])
  ].map(normalizeMatch), [matchesData, jleagueHistoryData]);
  const [legalModal, setLegalModal] = useState(null);
  const [showTeamList, setShowTeamList] = useState(false);
  const [showSiteGuide, setShowSiteGuide] = useState(false);
  const [requestedMatchAnalysis, setRequestedMatchAnalysis] = useState(null);
  const [requestedUpcomingTeam, setRequestedUpcomingTeam] = useState(null);
  const [openTool, setOpenTool] = useState(null);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [selectedMapTeam, setSelectedMapTeam] = useState(null);
  const [journeyStep, setJourneyStep] = useState(0);
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [selectedSeason, setSelectedSeason] = useState('ALL');

  const [mode, setMode] = useState('single');
  const [activeTab, setActiveTab] = useState('homeAway');

  const [minShots, setMinShots] = useState(15);
  const [cornerKicks, setCornerKicks] = useState(5);
  const [freeKicks, setFreeKicks] = useState(12);
  const [minPossession, setMinPossession] = useState(60);
  const [firstGoalMinute, setFirstGoalMinute] = useState(30);
  const [minHighXg, setMinHighXg] = useState(3);
  const [maxOpponentPasses, setMaxOpponentPasses] = useState(350);
  const [minShotAcc, setMinShotAcc] = useState(45);
  const [minPassAcc, setMinPassAcc] = useState(85);
  const [homeAwayCondition, setHomeAwayCondition] = useState('home');

  const METRICS = [
    { id: 'homeAway', name: 'ホーム / アウェイ', unit: '戦', field: 'is_home', quality: 'actual', description: 'チームがホームまたはアウェイでプレーした試合に分けて成績を比較します。' },
    { id: 'shots', name: 'シュート本数', min: 5, max: 30, step: 1, default: 15, unit: '±1本', field: 'shots', quality: 'estimated', description: 'チームが1試合で放ったシュートの総数です。攻撃の積極性の目安になります。' },
    { id: 'corners', name: 'コーナーキック数', min: 0, max: 15, step: 1, default: 5, unit: '±1本', field: 'corner_kicks', quality: 'actual', description: 'チームが獲得したコーナーキック数です。相手陣内で攻め込んだ回数の目安になります。' },
    { id: 'freeKicks', name: 'フリーキック数', min: 0, max: 30, step: 1, default: 12, unit: '±1本', field: 'free_kicks', quality: 'actual', description: 'チームに与えられたフリーキック数です。試合の接触やセットプレー機会の目安になります。' },
    { id: 'possession', name: 'ボール支配率', min: 30, max: 80, step: 5, default: 60, unit: '±1%', field: 'possession', quality: 'estimated', description: '試合中にボールを保持していた割合です。試合をどの程度コントロールしたかの目安になります。' },
    { id: 'firstGoal', name: '先制点時間帯', min: 10, max: 45, step: 5, default: 30, unit: '±1分に先制', field: 'first_goal_minute', quality: 'actual', description: 'そのチームが先制した時刻です。早い時間帯の先制が結果に与える影響を確認できます。' },
    { id: 'highXg', name: '決定機数 (高xG)', min: 1, max: 8, step: 1, default: 3, unit: '±1本', field: 'high_xg_shots', quality: 'estimated', description: '得点につながる可能性が高いシュートの本数です。チャンスの質と量を表します。' },
    { id: 'defense', name: '相手パス許容数', min: 200, max: 600, step: 25, default: 350, unit: '±1本', field: 'opponent_passes', quality: 'estimated', description: '相手チームに許したパス数です。相手のボール保持や自チームの守備傾向を見る目安になります。' },
    { id: 'shotAcc', name: '枠内シュート率', min: 20, max: 70, step: 5, default: 45, unit: '±1%', field: 'shot_accuracy', quality: 'estimated', description: '全シュートのうち枠内へ飛んだ割合です。シュート精度の目安になります。' },
    { id: 'passAcc', name: 'パス成功率', min: 70, max: 92, step: 1, default: 85, unit: '±1%', field: 'pass_accuracy', quality: 'estimated', description: '試みたパスのうち成功した割合です。ボール運びの安定性を表します。' }
  ];

  const leagueOptions = useMemo(() => [...new Set(allMatches.map(match => match.league).filter(Boolean))].sort(), [allMatches]);
  const seasonOptions = useMemo(() => [...new Set(allMatches
    .filter(match => selectedLeague === 'ALL' || match.league === selectedLeague)
    .map(match => match.season).filter(season => season !== null && season !== undefined))]
    .sort((a, b) => Number(b) - Number(a)), [allMatches, selectedLeague]);
  const matches = useMemo(() => allMatches.filter(match =>
    (selectedLeague === 'ALL' || match.league === selectedLeague)
    && (selectedSeason === 'ALL' || String(match.season) === String(selectedSeason))
  ), [allMatches, selectedLeague, selectedSeason]);

  const metricAvailability = useMemo(() => Object.fromEntries(METRICS.map(metric => {
    let availableCount = 0;
    let teamRecordCount = 0;
    let actualCount = 0;
    let estimatedCount = 0;
    matches.forEach(match => {
      [match.teamA, match.teamB].forEach(teamName => {
        const stats = match.stats?.[teamName];
        if (!stats) return;
        teamRecordCount += 1;
        const value = metric.id === 'firstGoal' ? match.first_goal_minute : stats[metric.field];
        if (value !== null && value !== undefined && value !== '') {
          availableCount += 1;
          const qualityField = metric.id === 'firstGoal' ? 'first_goal_minute' : metric.field;
          if (match.data_quality?.actual?.includes(qualityField)) actualCount += 1;
          else if (match.data_quality?.estimated?.includes(qualityField)) estimatedCount += 1;
          else if (metric.quality === 'actual') actualCount += 1;
          else estimatedCount += 1;
        }
      });
    });
    const quality = actualCount > 0 && estimatedCount > 0
      ? 'mixed'
      : actualCount > 0 ? 'actual' : metric.quality;
    return [metric.id, {
      available: availableCount > 0,
      coverage: teamRecordCount ? Math.round((availableCount / teamRecordCount) * 100) : 0,
      quality
    }];
  })), [matches]);

  useEffect(() => {
    if (!metricAvailability[activeTab]?.available) setActiveTab('homeAway');
  }, [activeTab, metricAvailability]);

  const [conditions, setConditions] = useState([
    { id: Date.now(), metric: 'possession', value: 60, homeAway: 'home' },
    { id: Date.now() + 1, metric: 'shotAcc', value: 45, homeAway: 'home' }
  ]);

  const addCondition = () => {
    setConditions([
      ...conditions,
      { id: Date.now(), metric: 'shots', value: 15, homeAway: 'home' }
    ]);
  };

  const removeCondition = (id) => {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id, field, val) => {
    setConditions(conditions.map(c => {
      if (c.id === id) {
        const updated = { ...c, [field]: val };
        if (field === 'metric') {
          const info = METRICS.find(m => m.id === val);
          if (info && info.default !== undefined) {
            updated.value = info.default;
          }
        }
        return updated;
      }
      return c;
    }));
  };

  // 安全な判定ロジック
  const checkSingleCond = (stats, match, teamName, cond) => {
    if (!stats || !match) return false;
    const { metric, value, homeAway } = cond;
    const isWithinSelectedRange = actual => {
      if (actual === null || actual === undefined || actual === '') return false;
      const numericValue = Number(actual);
      return Number.isFinite(numericValue) && Math.abs(numericValue - Number(value)) <= 1;
    };
    if (metric === 'shots') return isWithinSelectedRange(stats.shots);
    if (metric === 'corners') return isWithinSelectedRange(stats.corner_kicks);
    if (metric === 'freeKicks') return isWithinSelectedRange(stats.free_kicks);
    if (metric === 'possession') return isWithinSelectedRange(stats.possession);
    if (metric === 'firstGoal') return match.first_goal_team === teamName && match.first_goal_minute !== null && match.first_goal_minute !== undefined && isWithinSelectedRange(match.first_goal_minute);
    if (metric === 'highXg') return isWithinSelectedRange(stats.high_xg_shots);
    if (metric === 'defense') return isWithinSelectedRange(stats.opponent_passes);
    if (metric === 'shotAcc') return isWithinSelectedRange(stats.shot_accuracy);
    if (metric === 'passAcc') return isWithinSelectedRange(stats.pass_accuracy);
    if (metric === 'homeAway') return homeAway === 'home' ? stats.is_home === true : stats.is_home === false;
    return true;
  };

  const analyzeLaw = (filterFn) => {
    let qualified = 0, win = 0, draw = 0, loss = 0;
    const outcomeTeams = { win: new Map(), draw: new Map(), loss: new Map() };
    const addOutcomeTeam = (outcome, teamName) => {
      const teamCounts = outcomeTeams[outcome];
      teamCounts.set(teamName, (teamCounts.get(teamName) || 0) + 1);
    };
    matches.forEach(m => {
      if (!m || !m.stats) return;
      ['teamA', 'teamB'].forEach(tKey => {
        const tName = m[tKey];
        if (!tName) return;
        const stats = m.stats[tName];
        if (stats && filterFn(stats, m, tName)) {
          qualified++;
          if (m.winner === tName) {
            win++;
            addOutcomeTeam('win', tName);
          } else if (m.winner === null || m.winner === undefined) {
            draw++;
            addOutcomeTeam('draw', tName);
          } else {
            loss++;
            addOutcomeTeam('loss', tName);
          }
        }
      });
    });
    const formatOutcomeTeams = teamCounts => [...teamCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
    const teamsByOutcome = {
      win: formatOutcomeTeams(outcomeTeams.win),
      draw: formatOutcomeTeams(outcomeTeams.draw),
      loss: formatOutcomeTeams(outcomeTeams.loss)
    };
    const total = qualified;
    if (total === 0) {
      return { total: 0, winRate: "0.0", drawRate: "0.0", lossRate: "0.0", teamsByOutcome };
    }
    return {
      total: qualified,
      winRate: ((win / total) * 100).toFixed(1),
      drawRate: ((draw / total) * 100).toFixed(1),
      lossRate: ((loss / total) * 100).toFixed(1),
      teamsByOutcome
    };
  };

  const teams = useMemo(() => {
    const teamMatches = new Map();
    matches.forEach(match => {
      [match?.teamA, match?.teamB].forEach(teamName => {
        if (teamName) teamMatches.set(teamName, (teamMatches.get(teamName) || 0) + 1);
      });
    });
    return [...teamMatches.entries()]
      .map(([name, matchCount]) => ({ name, matchCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [matches]);

  const homeAwayRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'homeAway', homeAway: homeAwayCondition })), [matches, homeAwayCondition]);
  const shotsRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'shots', value: minShots })), [matches, minShots]);
  const cornersRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'corners', value: cornerKicks })), [matches, cornerKicks]);
  const freeKicksRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'freeKicks', value: freeKicks })), [matches, freeKicks]);
  const possessionRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'possession', value: minPossession })), [matches, minPossession]);
  const shotQualityRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'highXg', value: minHighXg })), [matches, minHighXg]);
  const defenseRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'defense', value: maxOpponentPasses })), [matches, maxOpponentPasses]);
  const shotAccRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'shotAcc', value: minShotAcc })), [matches, minShotAcc]);
  const passAccRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'passAcc', value: minPassAcc })), [matches, minPassAcc]);
  const firstGoalRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'firstGoal', value: firstGoalMinute })), [matches, firstGoalMinute]);

  const selectedMetricValue = {
    shots: minShots,
    corners: cornerKicks,
    freeKicks,
    possession: minPossession,
    firstGoal: firstGoalMinute,
    highXg: minHighXg,
    defense: maxOpponentPasses,
    shotAcc: minShotAcc,
    passAcc: minPassAcc
  }[activeTab];

  const winRateTrend = useMemo(() => {
    const metric = METRICS.find(item => item.id === activeTab);
    if (!metric || metric.min === undefined || !metricAvailability[activeTab]?.available) return [];
    const points = [];
    for (let value = metric.min; value <= metric.max; value += metric.step) {
      const result = analyzeLaw((stats, match, teamName) => checkSingleCond(stats, match, teamName, { metric: activeTab, value }));
      if (result.total > 0) {
        points.push({
          value,
          勝率: Number(result.winRate),
          引分率: Number(result.drawRate),
          敗北率: Number(result.lossRate),
          該当件数: result.total
        });
      }
    }
    return points;
  }, [matches, activeTab, metricAvailability]);

  const multiResult = useMemo(() => {
    return analyzeLaw((stats, match, teamName) => {
      return conditions.every(c => !metricAvailability[c.metric]?.available || checkSingleCond(stats, match, teamName, c));
    });
  }, [matches, conditions, metricAvailability]);

  const getMetricInfo = (id) => METRICS.find(m => m.id === id);

  const moveToJourneyStep = (step) => {
    if (step > 0 && !selectedMapTeam) return;
    if (step === 0) {
      setRequestedMatchAnalysis(null);
      setOpenTool(null);
      setJourneyStep(0);
      window.setTimeout(() => document.getElementById('team-clusters')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    if (step === 1) {
      setRequestedMatchAnalysis(null);
      setOpenTool('team-insights');
      setJourneyStep(1);
      window.setTimeout(() => document.getElementById('team-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    if (step === 2) {
      setRequestedMatchAnalysis(null);
      setRequestedUpcomingTeam(selectedMapTeam?.displayName || null);
      setOpenTool('upcoming-matches');
      setJourneyStep(2);
      window.setTimeout(() => document.getElementById('upcoming-matches')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    if (step === 3 && requestedMatchAnalysis) {
      setOpenTool('team-insights');
      setJourneyStep(3);
      window.setTimeout(() => document.getElementById('team-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  };

  if (dataLoadState.loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '24px', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#38bdf8', fontSize: '20px', fontWeight: 'bold' }}>試合データを読み込んでいます</div>
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>初回は数秒かかる場合があります。</p>
        </div>
      </div>
    );
  }

  if (dataLoadState.error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '24px', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '560px', padding: '20px', border: '1px solid #ef4444', borderRadius: '8px', background: '#1e293b' }}>
          <h2 style={{ color: '#f87171', marginTop: 0 }}>試合データを読み込めませんでした</h2>
          <p>{dataLoadState.error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 14px', border: 0, borderRadius: '5px', background: '#0284c7', color: '#fff', cursor: 'pointer' }}>再読み込み</button>
        </div>
      </div>
    );
  }

  return (
    <div className="site-theme light-theme" style={{ padding: '30px', backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#38bdf8' }}>サッカー・プレースタイルマップ</h1>
          <button
            type="button"
            aria-label="このサイトの使い方"
            aria-expanded={showSiteGuide}
            title="このサイトの使い方"
            onClick={() => setShowSiteGuide(current => !current)}
            style={{ display: 'inline-grid', placeItems: 'center', width: '25px', height: '25px', padding: 0, borderRadius: '50%', border: '1px solid #38bdf8', background: showSiteGuide ? '#0284c7' : 'transparent', color: showSiteGuide ? '#fff' : '#38bdf8', fontWeight: 'bold', cursor: 'pointer' }}
          >
            ?
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
          対象データ数: 全 {matches.length} 試合 / {teams.length} チーム
        </p>
        <button
          type="button"
          onClick={() => setShowTeamList(current => !current)}
          aria-expanded={showTeamList}
          style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #475569', background: '#1e293b', color: '#7dd3fc', cursor: 'pointer', fontSize: '12px' }}
        >
          {showTeamList ? 'チーム一覧を閉じる' : '対象チーム一覧を表示'}
        </button>
        {showTeamList && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '7px', maxHeight: '300px', overflowY: 'auto', marginTop: '12px', padding: '12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '7px' }}>
            {teams.map(team => (
              <div key={team.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 8px', background: '#0f172a', borderRadius: '4px', fontSize: '12px' }}>
                <span>{team.name}</span>
                <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{team.matchCount}試合</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSiteGuide && <section style={{ marginBottom: '20px', padding: '22px', borderRadius: '10px', background: 'linear-gradient(135deg, #082f49 0%, #172554 100%)', border: '1px solid #0369a1' }}>
        <div style={{ maxWidth: '850px' }}>
          <div style={{ display: 'inline-block', marginBottom: '8px', padding: '3px 8px', borderRadius: '999px', background: 'rgba(56, 189, 248, 0.15)', color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold' }}>
            データから、チームの個性と次の見どころを発見する
          </div>
          <h2 style={{ margin: '0 0 9px', fontSize: '21px', color: '#f8fafc' }}>似たプレースタイルのチームを探し、試合の見方を深めるサイトです</h2>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: '13px', lineHeight: 1.8 }}>
            シュート、支配率、パス、先制傾向などからチームを分類し、プレースタイルの近さを地図のように可視化します。
            気になるチームを起点に、特徴の比較、条件別勝率、対戦カードの観戦ポイント、試合予想へ進めます。
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '18px' }}>
          {[
            { number: '1', title: 'スタイルマップから探す', text: '気になるチームを検索し、どのプレースタイルに属するか、どのチームと似ているかを確認します。' },
            { number: '2', title: '特徴と観戦ポイントを知る', text: 'チームの強みや傾向を比較し、試合中に注目したいプレーを見つけます。' },
            { number: '3', title: '今後の試合を選ぶ', text: '選択したチームが出場する試合を探し、対戦相手を確認します。' },
            { number: '4', title: '対戦を比較・予想する', text: '2チームの特徴と観戦ポイントを比べ、試合結果を予想します。' }
          ].map(item => (
            <div key={item.number} style={{ padding: '13px', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(125, 211, 252, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ display: 'inline-flex', width: '22px', height: '22px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#0284c7', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>{item.number}</span>
                <strong style={{ color: '#e0f2fe', fontSize: '13px' }}>{item.title}</strong>
              </div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: 1.6 }}>{item.text}</p>
            </div>
          ))}
        </div>

        <p style={{ margin: '14px 0 0', color: '#94a3b8', fontSize: '11px', lineHeight: 1.6 }}>
          ※ 分析結果は過去データの傾向であり、将来の試合結果を保証するものではありません。
        </p>
      </section>}

      <section id="team-clusters" style={{ marginTop: '20px', padding: '20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '9px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: '4px 0 5px', fontSize: '20px' }}>プレースタイルマップからチームを探す</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>まずチームを選び、似ているチームと特徴的なプレーを確認してください。</p>
        </div>
        <div className="cluster-main-flow" aria-label="現在のステップ" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '7px', marginBottom: '18px' }}>
          {[
            ['1', 'チームを選ぶ'],
            ['2', '特徴を知る'],
            ['3', '今後の試合を選ぶ'],
            ['4', '対戦を比較・予想する'],
          ].map(([number, title], index) => {
            const currentStep = journeyStep;
            const isCurrent = index === currentStep;
            const isDone = index < currentStep;
            const canNavigate = index <= currentStep
              || ((index === 1 || index === 2) && Boolean(selectedMapTeam))
              || (index === 3 && Boolean(requestedMatchAnalysis));
            return (
            <button type="button" key={number} disabled={!canNavigate} onClick={() => moveToJourneyStep(index)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px', border: `1px solid ${isCurrent ? '#2563eb' : '#dbe3ee'}`, borderRadius: '7px', background: isCurrent ? '#eff6ff' : '#f8fafc', opacity: canNavigate ? 1 : 0.58, cursor: canNavigate ? 'pointer' : 'not-allowed', textAlign: 'left' }}>
              <span style={{ display: 'inline-flex', flex: '0 0 auto', width: '22px', height: '22px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: isDone ? '#16a34a' : isCurrent ? '#2563eb' : '#94a3b8', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>{isDone ? '✓' : number}</span>
              <strong style={{ color: '#1e293b', fontSize: '11px' }}>{isCurrent ? `次にすること：${title}` : title}</strong>
            </button>
          )})}
        </div>
        <TeamClusterChart onTeamSelect={(team) => {
          setSelectedMapTeam(team);
          setJourneyStep(team ? 1 : 0);
          if (!team || team.teamName !== selectedMapTeam?.teamName) setRequestedMatchAnalysis(null);
        }} />
      </section>

      <section style={{ margin: '12px 0 24px', padding: '13px', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '7px', marginBottom: '10px' }}>
          <strong style={{ fontSize: '13px' }}>選択中：{selectedMapTeam?.displayName || 'チームを選択してください'}</strong>
          {selectedMapTeam && <span style={{ color: '#94a3b8', fontSize: '11px' }}>{selectedMapTeam.clusterName}・{selectedMapTeam.league}</span>}
        </div>
        <div style={{ marginBottom: '7px', color: '#64748b', fontSize: '11px', fontWeight: 'bold' }}>{selectedMapTeam ? '次のステップ' : 'まずチームを選択してください'}</div>
        <nav aria-label="選択したチームの詳細" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {[
          { target: 'team-insights', title: '次のステップへ：特徴・観戦ポイントを見る →' },
        ].map(item => (
          <button
            key={item.target}
            type="button"
            disabled={!selectedMapTeam}
            aria-expanded={openTool === item.target}
            onClick={() => {
              setOpenTool(item.target);
              setJourneyStep(1);
              window.setTimeout(() => document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
            }}
            style={{ padding: '8px 13px', border: '1px solid #2563eb', borderRadius: '6px', background: '#2563eb', color: '#fff', cursor: selectedMapTeam ? 'pointer' : 'not-allowed', opacity: selectedMapTeam ? 1 : 0.45, fontSize: '12px', fontWeight: 'bold' }}
          >
            {item.title}
          </button>
        ))}
        <button
          type="button"
          disabled={!selectedMapTeam}
          onClick={() => {
            if (!selectedMapTeam) return;
            setRequestedUpcomingTeam(selectedMapTeam.displayName);
            setOpenTool('upcoming-matches');
            setJourneyStep(2);
            window.setTimeout(() => document.getElementById('upcoming-matches')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
          }}
          style={{ padding: '7px 12px', border: '1px solid #334155', borderRadius: '6px', background: '#1e293b', color: '#f8fafc', cursor: selectedMapTeam ? 'pointer' : 'not-allowed', opacity: selectedMapTeam ? 1 : 0.45, fontSize: '12px', fontWeight: 'bold' }}
        >
          このチームの今後の試合を見る
        </button>
        </nav>
      </section>

      <section style={{ margin: '-12px 0 24px', padding: '13px', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '13px', marginBottom: '3px' }}>今後の試合を予想する</strong>
            <span style={{ color: '#94a3b8', fontSize: '11px' }}>受付中の試合を選び、勝敗を予想・投票します。</span>
          </div>
          <button
            type="button"
            aria-expanded={openTool === 'upcoming-matches'}
            onClick={() => {
              const nextTool = openTool === 'upcoming-matches' ? null : 'upcoming-matches';
              if (nextTool) setRequestedUpcomingTeam(null);
              setOpenTool(nextTool);
              if (nextTool && selectedMapTeam) setJourneyStep(2);
              if (nextTool) window.setTimeout(() => document.getElementById(nextTool)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
            }}
            style={{ padding: '7px 12px', border: `1px solid ${openTool === 'upcoming-matches' ? '#38bdf8' : '#334155'}`, borderRadius: '6px', background: openTool === 'upcoming-matches' ? '#0284c7' : '#1e293b', color: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            {openTool === 'upcoming-matches' ? '試合予想を閉じる' : '試合予想を開く'}
          </button>
        </div>
      </section>

      <section style={{ margin: '-12px 0 24px', padding: '13px', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a' }}>
        <button type="button" aria-expanded={showAdvancedTools} onClick={() => setShowAdvancedTools(current => !current)} style={{ width: '100%', padding: '7px 0', border: 0, background: 'transparent', color: '#f8fafc', cursor: 'pointer', textAlign: 'left', fontSize: '13px', fontWeight: 'bold' }}>
          {showAdvancedTools ? '− もっと詳しく調べる' : '＋ もっと詳しく調べる'}
        </button>
        {showAdvancedTools && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '9px', paddingTop: '10px', borderTop: '1px solid #334155' }}>
          <div>
            <span style={{ display: 'block', color: '#64748b', fontSize: '10px', fontWeight: 'bold', marginBottom: '2px' }}>補助データ分析</span>
            <strong style={{ display: 'block', fontSize: '13px', marginBottom: '3px' }}>全チームの条件別勝率</strong>
            <span style={{ color: '#94a3b8', fontSize: '11px' }}>選択中のチームとは連動せず、リーグ・シーズン全体の試合を集計します。</span>
          </div>
          <button
            type="button"
            aria-expanded={openTool === 'win-rate-analysis'}
            onClick={() => {
              const nextTool = openTool === 'win-rate-analysis' ? null : 'win-rate-analysis';
              setOpenTool(nextTool);
              if (nextTool) window.setTimeout(() => document.getElementById(nextTool)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
            }}
            style={{ padding: '7px 12px', border: `1px solid ${openTool === 'win-rate-analysis' ? '#38bdf8' : '#334155'}`, borderRadius: '6px', background: openTool === 'win-rate-analysis' ? '#0284c7' : '#1e293b', color: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            {openTool === 'win-rate-analysis' ? '勝率分析を閉じる' : '勝率分析を開く'}
          </button>
        </div>}
      </section>

      {openTool === 'win-rate-analysis' && <>
      <div id="win-rate-analysis" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', marginBottom: '20px', padding: '14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', scrollMarginTop: '20px' }}>
        <label style={{ minWidth: '220px', fontSize: '12px', color: '#cbd5e1' }}>
          リーグ
          <select value={selectedLeague} onChange={event => { setSelectedLeague(event.target.value); setSelectedSeason('ALL'); }} style={{ display: 'block', width: '100%', marginTop: '5px', padding: '8px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}>
            <option value="ALL">すべてのリーグ</option>
            {leagueOptions.map(league => <option key={league} value={league}>{league}</option>)}
          </select>
        </label>
        <label style={{ minWidth: '180px', fontSize: '12px', color: '#cbd5e1' }}>
          シーズン
          <select value={selectedSeason} onChange={event => setSelectedSeason(event.target.value)} disabled={seasonOptions.length === 0} style={{ display: 'block', width: '100%', marginTop: '5px', padding: '8px', borderRadius: '5px', background: '#0f172a', color: '#fff', border: '1px solid #475569', opacity: seasonOptions.length ? 1 : 0.55 }}>
            <option value="ALL">すべてのシーズン</option>
            {seasonOptions.map(season => <option key={season} value={season}>{season}</option>)}
          </select>
        </label>
        <div style={{ color: '#94a3b8', fontSize: '12px', paddingBottom: '8px' }}>
          選択中: <strong style={{ color: '#f8fafc' }}>{matches.length}試合</strong>
          {seasonOptions.length === 0 && '（既存データのリーグ・シーズン情報は更新処理後に利用できます）'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', background: '#0f172a', border: '1px solid #334155', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        <button
          className="winrate-mode-tab"
          data-active={mode === 'single'}
          onClick={() => setMode('single')}
          style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
            backgroundColor: mode === 'single' ? '#0284c7' : 'transparent', color: '#fff', transition: '0.2s'
          }}
        >
          単一条件
        </button>
        <button
          className="winrate-mode-tab"
          data-active={mode === 'multi'}
          onClick={() => setMode('multi')}
          style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
            backgroundColor: mode === 'multi' ? '#0284c7' : 'transparent', color: '#fff', transition: '0.2s'
          }}
        >
          複数条件
        </button>
      </div>

      {mode === 'single' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { id: 'homeAway', label: 'ホーム / アウェイ' },
              { id: 'shots', label: 'シュート本数' },
              { id: 'corners', label: 'コーナーキック数' },
              { id: 'freeKicks', label: 'フリーキック数' },
              { id: 'possession', label: 'ボール支配率' },
              { id: 'firstGoal', label: '先制点時間帯' },
              { id: 'highXg', label: '決定機数 (高xG)' },
              { id: 'defense', label: '相手パス許容数' },
              { id: 'shotAcc', label: '枠内シュート率' },
              { id: 'passAcc', label: 'パス成功率' }
            ].map(tab => (
              <button
                className="winrate-metric-tab"
                data-active={activeTab === tab.id}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={!metricAvailability[tab.id]?.available}
                title={!metricAvailability[tab.id]?.available ? '選択中のリーグ・シーズンでは利用できません' : undefined}
                style={{
                  padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: metricAvailability[tab.id]?.available ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '13px',
                  backgroundColor: activeTab === tab.id ? '#334155' : '#1e293b', color: activeTab === tab.id ? '#38bdf8' : '#94a3b8', transition: '0.2s', opacity: metricAvailability[tab.id]?.available ? 1 : 0.4
                }}
              >
                {tab.label} {!metricAvailability[tab.id]?.available && '（利用不可）'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
              {activeTab === 'homeAway' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>ホーム / アウェイ別の勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <select value={homeAwayCondition} onChange={e => setHomeAwayCondition(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#1e293b', color: '#38bdf8', border: '1px solid #475569', fontSize: '13px' }}>
                      <option value="home">ホームでプレーした試合</option>
                      <option value="away">アウェイでプレーした試合</option>
                    </select>
                  </div>
                  <ResultBar res={homeAwayRes} />
                </div>
              )}

              {activeTab === 'shots' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>シュート総数と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>シュート本数: <strong style={{ color: '#38bdf8' }}>{minShots - 1}〜{minShots + 1} 本</strong></label>
                    <input type="range" min="5" max="30" step="1" value={minShots} onChange={e => setMinShots(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={shotsRes} />
                </div>
              )}

              {activeTab === 'corners' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>コーナーキック数と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>コーナーキック数: <strong style={{ color: '#38bdf8' }}>{cornerKicks - 1}〜{cornerKicks + 1} 本</strong></label>
                    <input type="range" min="0" max="15" step="1" value={cornerKicks} onChange={e => setCornerKicks(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={cornersRes} />
                </div>
              )}

              {activeTab === 'freeKicks' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>フリーキック数と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>フリーキック数: <strong style={{ color: '#38bdf8' }}>{freeKicks - 1}〜{freeKicks + 1} 本</strong></label>
                    <input type="range" min="0" max="30" step="1" value={freeKicks} onChange={e => setFreeKicks(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={freeKicksRes} />
                </div>
              )}

              {activeTab === 'possession' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>ボール支配率と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>ボール支配率: <strong style={{ color: '#38bdf8' }}>{minPossession - 1}〜{minPossession + 1}%</strong></label>
                    <input type="range" min="30" max="80" step="5" value={minPossession} onChange={e => setMinPossession(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={possessionRes} />
                </div>
              )}

              {activeTab === 'firstGoal' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>先制点と勝利確率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>先制点の時間帯: <strong style={{ color: '#38bdf8' }}>{firstGoalMinute - 1}〜{firstGoalMinute + 1} 分</strong></label>
                    <input type="range" min="10" max="45" step="5" value={firstGoalMinute} onChange={e => setFirstGoalMinute(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={firstGoalRes} />
                </div>
              )}

              {activeTab === 'highXg' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>決定機数（高xG）と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>決定機数: <strong style={{ color: '#38bdf8' }}>{minHighXg - 1}〜{minHighXg + 1} 本</strong></label>
                    <input type="range" min="1" max="8" step="1" value={minHighXg} onChange={e => setMinHighXg(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={shotQualityRes} />
                </div>
              )}

              {activeTab === 'defense' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>相手パス試行数の制限（守備強度）</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>相手パス許容数: <strong style={{ color: '#38bdf8' }}>{maxOpponentPasses - 1}〜{maxOpponentPasses + 1} 本</strong></label>
                    <input type="range" min="200" max="600" step="25" value={maxOpponentPasses} onChange={e => setMaxOpponentPasses(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={defenseRes} />
                </div>
              )}

              {activeTab === 'shotAcc' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>枠内シュート率（シュート精度）</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>枠内シュート率: <strong style={{ color: '#38bdf8' }}>{minShotAcc - 1}〜{minShotAcc + 1}%</strong></label>
                    <input type="range" min="20" max="70" step="5" value={minShotAcc} onChange={e => setMinShotAcc(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={shotAccRes} />
                </div>
              )}

              {activeTab === 'passAcc' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>パス成功率と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>パス成功率: <strong style={{ color: '#38bdf8' }}>{minPassAcc - 1}〜{minPassAcc + 1}%</strong></label>
                    <input type="range" min="70" max="92" step="1" value={minPassAcc} onChange={e => setMinPassAcc(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={passAccRes} />
                </div>
              )}

              {winRateTrend.length > 1 && (
                <WinRateTrendChart
                  data={winRateTrend}
                  metric={getMetricInfo(activeTab)}
                  selectedValue={selectedMetricValue}
                />
              )}
            </div>

            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
              <h3 style={{ color: '#38bdf8', marginTop: 0, fontSize: '15px' }}>{getMetricInfo(activeTab)?.name}</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
                {getMetricInfo(activeTab)?.description}
              </p>
              {activeTab !== 'homeAway' && (
                <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#94a3b8', marginBottom: 0 }}>
                  選択した数値の前後1を含む範囲に該当する試合を集計します。
                </p>
              )}

              <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#94a3b8', marginBottom: 0 }}>
                該当試合における勝利・引き分け・敗北の割合を表示します。
              </p>
            </div>
          </div>
        </div>
      )}

      {mode === 'multi' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {conditions.map((cond, index) => {
              const info = getMetricInfo(cond.metric);
              return (
                <div key={cond.id} style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>条件 {index + 1}</span>
                    {conditions.length > 1 && (
                      <button
                        onClick={() => removeCondition(cond.id)}
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        削除
                      </button>
                    )}
                  </div>

                  <select
                    value={cond.metric}
                    onChange={e => updateCondition(cond.id, 'metric', e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontSize: '13px' }}
                  >
                    {METRICS.map(m => (
                      <option key={m.id} value={m.id} disabled={!metricAvailability[m.id]?.available}>{m.name}{!metricAvailability[m.id]?.available ? '（利用不可）' : ''}</option>
                    ))}
                  </select>

                  <div style={{ marginTop: '10px' }}>
                    {cond.metric === 'homeAway' ? (
                      <select
                        value={cond.homeAway}
                        onChange={e => updateCondition(cond.id, 'homeAway', e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontSize: '13px' }}
                      >
                        <option value="home">ホームでプレーした試合</option>
                        <option value="away">アウェイでプレーした試合</option>
                      </select>
                    ) : (
                      <>
                        <label style={{ fontSize: '12px', color: '#cbd5e1' }}>閾値: <strong style={{ color: '#38bdf8' }}>{cond.value} {info?.unit}</strong></label>
                        <input
                          type="range"
                          min={info?.min}
                          max={info?.max}
                          step={info?.step}
                          value={cond.value}
                          onChange={e => updateCondition(cond.id, 'value', Number(e.target.value))}
                          style={{ width: '100%', marginTop: '4px' }}
                        />
                      </>
                    )}
                  </div>
                  {!metricAvailability[cond.metric]?.available && (
                    <div style={{ marginTop: '7px', color: '#fbbf24', fontSize: '12px' }}>この条件は選択中のデータに存在しないため、複数条件の集計から自動的に除外されます。</div>
                  )}
                  <p style={{ margin: '10px 0 0', fontSize: '12px', lineHeight: '1.5', color: '#94a3b8' }}>
                    {info?.description}
                    {cond.metric !== 'homeAway' && ' 選択値の前後1を含む範囲で集計します。'}
                  </p>
                </div>
              );
            })}

            <button
              onClick={addCondition}
              style={{
                padding: '12px', borderRadius: '8px', border: '1px dashed #0284c7', background: 'rgba(2, 132, 199, 0.1)',
                color: '#38bdf8', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', transition: '0.2s'
              }}
            >
              ＋ 条件を追加する
            </button>

            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155', marginTop: '10px' }}>
              <ResultBar res={multiResult} />
            </div>
          </div>

          <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155', height: 'fit-content' }}>
            <h3 style={{ color: '#38bdf8', marginTop: 0, fontSize: '15px' }}>要約</h3>
            <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
              <p style={{ marginBottom: '8px' }}><strong>選択中の条件:</strong></p>
              <ul style={{ paddingLeft: '18px', margin: 0 }}>
                {conditions.map((c, i) => {
                  const info = getMetricInfo(c.metric);
                  return (
                    <li key={c.id} style={{ marginTop: i > 0 ? '6px' : 0 }}>
                      {c.metric === 'homeAway'
                        ? (c.homeAway === 'home' ? 'ホーム戦' : 'アウェイ戦')
                        : `${info?.name} ${c.value} ${info?.unit}`}
                    </li>
                  );
                })}
              </ul>
              <hr style={{ borderColor: '#334155', margin: '15px 0' }} />
              <p style={{ margin: 0 }}>
                該当件数: <strong>{multiResult.total} 件</strong><br />
                勝率: <strong style={{ color: '#22c55e' }}>{multiResult.winRate}%</strong>
              </p>
            </div>
          </div>
        </div>
      )}
      </>}

      {openTool === 'team-insights' && <>
        <div style={{ marginBottom: '10px' }}>
          <button
            type="button"
            onClick={() => moveToJourneyStep(journeyStep === 3 ? 2 : 0)}
            style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', color: '#334155', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            ← 一つ前のステップに戻る
          </button>
        </div>
        <TeamInsights matches={matches} requestedMatch={requestedMatchAnalysis} requestedTeam={selectedMapTeam?.teamName} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', margin: '-10px 0 24px' }}>
          <button
            type="button"
            onClick={() => {
              setRequestedUpcomingTeam(requestedMatchAnalysis ? null : selectedMapTeam?.displayName || null);
              setOpenTool('upcoming-matches');
              setRequestedMatchAnalysis(null);
              setJourneyStep(2);
              window.setTimeout(() => document.getElementById('upcoming-matches')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
            }}
            style={{ padding: '9px 14px', border: '1px solid #2563eb', borderRadius: '6px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            次のステップ：{requestedMatchAnalysis ? '試合予想へ戻る' : 'このチームの今後の試合を見る'} →
          </button>
        </div>
      </>}

      {/* ★ここに今週の試合予想コンポーネントを配置 */}
      {openTool === 'upcoming-matches' && <div id="upcoming-matches" style={{ scrollMarginTop: '20px' }}>
        {selectedMapTeam && <button
          type="button"
          onClick={() => moveToJourneyStep(1)}
          style={{ marginBottom: '10px', padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', color: '#334155', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
        >
          ← 一つ前のステップに戻る
        </button>}
        <UpcomingMatches requestedTeam={requestedUpcomingTeam} onAnalyzeMatch={(match) => {
          const normalizedMatch = canonicalizeRequestedMatch(match);
          setRequestedMatchAnalysis({ homeTeam: normalizedMatch.home_team, awayTeam: normalizedMatch.away_team, requestId: Date.now() });
          setOpenTool('team-insights');
          setJourneyStep(3);
          window.setTimeout(() => document.getElementById('team-insights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
        }} />
      </div>}

      <footer style={{ marginTop: '28px', paddingTop: '18px', borderTop: '1px solid #334155', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', color: '#94a3b8', fontSize: '12px' }}>
        <span>© 2026 サッカー・プレースタイルマップ</span>
        <nav aria-label="法的情報" style={{ display: 'flex', gap: '16px' }}>
          <a href="/privacy-policy.html" onClick={(event) => { event.preventDefault(); setLegalModal('privacy'); }} style={{ color: '#7dd3fc' }}>プライバシーポリシー</a>
          <a href="/terms.html" onClick={(event) => { event.preventDefault(); setLegalModal('terms'); }} style={{ color: '#7dd3fc' }}>利用規約</a>
        </nav>
      </footer>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  );
}

function WinRateTrendChart({ data, metric, selectedValue }) {
  return (
    <section style={{ marginTop: '22px', padding: '16px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '15px' }}>{metric?.name}ごとの勝率推移</h3>
      <p style={{ margin: '0 0 14px', color: '#94a3b8', fontSize: '11px' }}>
        各数値の前後1を含む試合を集計しています。点にカーソルを合わせると該当件数を確認できます。
      </p>
      <div style={{ width: '100%', height: '290px' }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 14, right: 20, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="value" tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: metric?.name, position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={value => `${value}%`} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: '#f8fafc', fontSize: '12px' }}
              formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
              labelFormatter={(value, payload) => `${metric?.name}: ${value}（該当 ${payload?.[0]?.payload?.該当件数 ?? 0}件）`}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            {selectedValue !== undefined && <ReferenceLine x={selectedValue} stroke="#38bdf8" strokeDasharray="5 4" label={{ value: '選択中', fill: '#38bdf8', fontSize: 10 }} />}
            <Line type="monotone" dataKey="勝率" stroke="#22c55e" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="引分率" stroke="#eab308" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="敗北率" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ResultBar({ res }) {
  if (!res || res.total === 0) {
    return (
      <div>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>該当件数: 0 件</div>
        <div style={{ background: '#334155', padding: '12px', borderRadius: '6px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
          条件を満たす試合データがありません（スライダーを下げて調整してください）
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>該当件数: {res.total} 件</div>
      <div style={{ display: 'flex', height: '32px', borderRadius: '6px', border: '1px solid #475569' }}>
        {Number(res.winRate) > 0 && (
          <OutcomeSegment label="勝利" rate={res.winRate} teams={res.teamsByOutcome?.win} color="#16a34a" align="left" />
        )}
        {Number(res.drawRate) > 0 && (
          <OutcomeSegment label="引分" rate={res.drawRate} teams={res.teamsByOutcome?.draw} color="#ca8a04" textColor="#000" align="center" />
        )}
        {Number(res.lossRate) > 0 && (
          <OutcomeSegment label="敗北" rate={res.lossRate} teams={res.teamsByOutcome?.loss} color="#dc2626" align="right" />
        )}
      </div>
      <div style={{ marginTop: '7px', color: '#64748b', fontSize: '11px' }}>各項目にカーソルを合わせると該当チームを確認できます。</div>
    </div>
  );
}

function OutcomeSegment({ label, rate, teams = [], color, textColor = '#fff', align }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipPosition = align === 'left'
    ? { left: 0 }
    : align === 'right'
      ? { right: 0 }
      : { left: '50%', transform: 'translateX(-50%)' };

  return (
    <div
      tabIndex={0}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      style={{ width: `${rate}%`, background: color, color: textColor, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', fontWeight: 'bold', fontSize: '12px', cursor: 'help', outlineOffset: '2px', whiteSpace: 'nowrap' }}
      aria-label={`${label} ${rate}%。該当チーム一覧を表示`}
    >
      {label} {rate}%
      {showTooltip && (
        <div className="outcome-tooltip" style={{ ...tooltipPosition, position: 'absolute', top: 'calc(100% + 8px)', zIndex: 20, width: '280px', maxWidth: '80vw', padding: '10px', background: '#020617', color: '#f8fafc', border: `1px solid ${color}`, borderRadius: '7px', boxShadow: '0 10px 25px rgba(0,0,0,0.45)', fontWeight: 'normal', whiteSpace: 'normal' }}>
          <div style={{ fontWeight: 'bold', color, marginBottom: '7px' }}>{label}に含まれるチーム（{teams.length}）</div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {teams.map(team => (
              <div key={team.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 2px', borderBottom: '1px solid #1e293b', fontSize: '12px' }}>
                <span>{team.name}</span>
                <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{team.count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
