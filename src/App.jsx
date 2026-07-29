import React, { useState, useMemo, Component } from 'react';
import matchesData from './shots_data.json';
import UpcomingMatches from './components/UpcomingMatches'; // 今週の試合予想コンポーネントを追加

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
  const matches = Array.isArray(matchesData) ? matchesData : [];

  const [mode, setMode] = useState('single');
  const [activeTab, setActiveTab] = useState('homeAway');

  const [minShots, setMinShots] = useState(15);
  const [minPossession, setMinPossession] = useState(60);
  const [firstGoalMinute, setFirstGoalMinute] = useState(30);
  const [minHighXg, setMinHighXg] = useState(3);
  const [maxOpponentPasses, setMaxOpponentPasses] = useState(350);
  const [minShotAcc, setMinShotAcc] = useState(45);
  const [minPassAcc, setMinPassAcc] = useState(85);
  const [homeAwayCondition, setHomeAwayCondition] = useState('home');

  const METRICS = [
    { id: 'homeAway', name: 'ホーム / アウェイ', unit: '戦' },
    { id: 'shots', name: 'シュート本数', min: 5, max: 30, step: 1, default: 15, unit: '本以上' },
    { id: 'possession', name: 'ボール支配率', min: 30, max: 80, step: 5, default: 60, unit: '% 以上' },
    { id: 'firstGoal', name: '先制点時間帯', min: 10, max: 45, step: 5, default: 30, unit: '分以内に先制' },
    { id: 'highXg', name: '決定機数 (高xG)', min: 1, max: 8, step: 1, default: 3, unit: '本以上' },
    { id: 'defense', name: '相手パス許容数', min: 200, max: 600, step: 25, default: 350, unit: '本以下' },
    { id: 'shotAcc', name: '枠内シュート率', min: 20, max: 70, step: 5, default: 45, unit: '% 以上' },
    { id: 'passAcc', name: 'パス成功率', min: 70, max: 92, step: 1, default: 85, unit: '% 以上' }
  ];

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
    if (metric === 'shots') return Number(stats.shots ?? 0) >= value;
    if (metric === 'possession') return Number(stats.possession ?? 0) >= value;
    if (metric === 'firstGoal') return match.first_goal_team === teamName && match.first_goal_minute !== null && match.first_goal_minute !== undefined && Number(match.first_goal_minute) <= value;
    if (metric === 'highXg') return Number(stats.high_xg_shots ?? 0) >= value;
    if (metric === 'defense') return Number(stats.opponent_passes ?? 999) <= value;
    if (metric === 'shotAcc') return Number(stats.shot_accuracy ?? 0) >= value;
    if (metric === 'passAcc') return Number(stats.pass_accuracy ?? 0) >= value;
    if (metric === 'homeAway') return homeAway === 'home' ? stats.is_home === true : stats.is_home === false;
    return true;
  };

  const analyzeLaw = (filterFn) => {
    let qualified = 0, win = 0, draw = 0, loss = 0;
    matches.forEach(m => {
      if (!m || !m.stats) return;
      ['teamA', 'teamB'].forEach(tKey => {
        const tName = m[tKey];
        if (!tName) return;
        const stats = m.stats[tName];
        if (stats && filterFn(stats, m, tName)) {
          qualified++;
          if (m.winner === tName) win++;
          else if (m.winner === null || m.winner === undefined) draw++;
          else loss++;
        }
      });
    });
    const total = qualified;
    if (total === 0) {
      return { total: 0, winRate: "0.0", drawRate: "0.0", lossRate: "0.0" };
    }
    return {
      total: qualified,
      winRate: ((win / total) * 100).toFixed(1),
      drawRate: ((draw / total) * 100).toFixed(1),
      lossRate: ((loss / total) * 100).toFixed(1)
    };
  };

  const homeAwayRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'homeAway', homeAway: homeAwayCondition })), [matches, homeAwayCondition]);
  const shotsRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'shots', value: minShots })), [matches, minShots]);
  const possessionRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'possession', value: minPossession })), [matches, minPossession]);
  const shotQualityRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'highXg', value: minHighXg })), [matches, minHighXg]);
  const defenseRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'defense', value: maxOpponentPasses })), [matches, maxOpponentPasses]);
  const shotAccRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'shotAcc', value: minShotAcc })), [matches, minShotAcc]);
  const passAccRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'passAcc', value: minPassAcc })), [matches, minPassAcc]);
  const firstGoalRes = useMemo(() => analyzeLaw((s, m, t) => checkSingleCond(s, m, t, { metric: 'firstGoal', value: firstGoalMinute })), [matches, firstGoalMinute]);

  const multiResult = useMemo(() => {
    return analyzeLaw((stats, match, teamName) => {
      return conditions.every(c => checkSingleCond(stats, match, teamName, c));
    });
  }, [matches, conditions]);

  const getMetricInfo = (id) => METRICS.find(m => m.id === id);

  return (
    <div style={{ padding: '30px', backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '15px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', color: '#38bdf8' }}>サッカー試合データ勝率分析</h1>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
          対象データ数: 全 {matches.length} 試合
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', background: '#0f172a', border: '1px solid #334155', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
        <button
          onClick={() => setMode('single')}
          style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
            backgroundColor: mode === 'single' ? '#0284c7' : 'transparent', color: '#fff', transition: '0.2s'
          }}
        >
          単一条件
        </button>
        <button
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
              { id: 'possession', label: 'ボール支配率' },
              { id: 'firstGoal', label: '先制点時間帯' },
              { id: 'highXg', label: '決定機数 (高xG)' },
              { id: 'defense', label: '相手パス許容数' },
              { id: 'shotAcc', label: '枠内シュート率' },
              { id: 'passAcc', label: 'パス成功率' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
                  backgroundColor: activeTab === tab.id ? '#334155' : '#1e293b', color: activeTab === tab.id ? '#38bdf8' : '#94a3b8', transition: '0.2s'
                }}
              >
                {tab.label}
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
                    <label style={{ fontSize: '13px' }}>シュート本数: <strong style={{ color: '#38bdf8' }}>{minShots} 本以上</strong></label>
                    <input type="range" min="5" max="30" step="1" value={minShots} onChange={e => setMinShots(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={shotsRes} />
                </div>
              )}

              {activeTab === 'possession' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>ボール支配率と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>ボール支配率: <strong style={{ color: '#38bdf8' }}>{minPossession}% 以上</strong></label>
                    <input type="range" min="30" max="80" step="5" value={minPossession} onChange={e => setMinPossession(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={possessionRes} />
                </div>
              )}

              {activeTab === 'firstGoal' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>先制点と勝利確率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>先制点の時間帯: <strong style={{ color: '#38bdf8' }}>前半 {firstGoalMinute} 分以内</strong></label>
                    <input type="range" min="10" max="45" step="5" value={firstGoalMinute} onChange={e => setFirstGoalMinute(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={firstGoalRes} />
                </div>
              )}

              {activeTab === 'highXg' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>決定機数（高xG）と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>決定機の最小本数: <strong style={{ color: '#38bdf8' }}>{minHighXg} 本以上</strong></label>
                    <input type="range" min="1" max="8" step="1" value={minHighXg} onChange={e => setMinHighXg(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={shotQualityRes} />
                </div>
              )}

              {activeTab === 'defense' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>相手パス試行数の制限（守備強度）</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>相手パス許容数の上限: <strong style={{ color: '#38bdf8' }}>{maxOpponentPasses} 本以下</strong></label>
                    <input type="range" min="200" max="600" step="25" value={maxOpponentPasses} onChange={e => setMaxOpponentPasses(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={defenseRes} />
                </div>
              )}

              {activeTab === 'shotAcc' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>枠内シュート率（シュート精度）</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>枠内シュート率の下限: <strong style={{ color: '#38bdf8' }}>{minShotAcc}% 以上</strong></label>
                    <input type="range" min="20" max="70" step="5" value={minShotAcc} onChange={e => setMinShotAcc(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={shotAccRes} />
                </div>
              )}

              {activeTab === 'passAcc' && (
                <div>
                  <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>パス成功率と勝率</h3>
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                    <label style={{ fontSize: '13px' }}>パス成功率の下限: <strong style={{ color: '#38bdf8' }}>{minPassAcc}% 以上</strong></label>
                    <input type="range" min="70" max="92" step="1" value={minPassAcc} onChange={e => setMinPassAcc(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
                  </div>
                  <ResultBar res={passAccRes} />
                </div>
              )}
            </div>

            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
              <h3 style={{ color: '#38bdf8', marginTop: 0, fontSize: '15px' }}>要約</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
                選択中の条件を満たした試合における勝利・引き分け・敗北の割合を示しています。
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
                      <option key={m.id} value={m.id}>{m.name}</option>
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

      {/* ★ここに今週の試合予想コンポーネントを配置 */}
      <UpcomingMatches />
    </div>
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
      <div style={{ display: 'flex', height: '32px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #475569' }}>
        {Number(res.winRate) > 0 && (
          <div style={{ width: `${res.winRate}%`, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>
            勝利 {res.winRate}%
          </div>
        )}
        {Number(res.drawRate) > 0 && (
          <div style={{ width: `${res.drawRate}%`, background: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: '#000' }}>
            引分 {res.drawRate}%
          </div>
        )}
        {Number(res.lossRate) > 0 && (
          <div style={{ width: `${res.lossRate}%`, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>
            敗北 {res.lossRate}%
          </div>
        )}
      </div>
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