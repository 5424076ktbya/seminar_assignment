import React, { useState, useMemo } from 'react';
import matchesData from './shots_data.json';

function App() {
  const matches = Array.isArray(matchesData) ? matchesData : [];

  const [activeTab, setActiveTab] = useState('homeAway');

  // 条件設定ステート
  const [minShots, setMinShots] = useState(15);                   // シュート総数
  const [minPossession, setMinPossession] = useState(60);
  const [firstGoalMinute, setFirstGoalMinute] = useState(30);
  const [minHighXg, setMinHighXg] = useState(3);
  const [maxOpponentPasses, setMaxOpponentPasses] = useState(350);
  const [minShotAcc, setMinShotAcc] = useState(45);
  const [minPassAcc, setMinPassAcc] = useState(85);
  const [homeAwayCondition, setHomeAwayCondition] = useState('home');

  // 集計用汎用関数
  const analyzeLaw = (filterFn) => {
    let qualified = 0, win = 0, draw = 0, loss = 0;
    matches.forEach(m => {
      ['teamA', 'teamB'].forEach(tKey => {
        const tName = m[tKey];
        const stats = m.stats[tName];
        if (stats && filterFn(stats, m, tName)) {
          qualified++;
          if (m.winner === tName) win++;
          else if (m.winner === null) draw++;
          else loss++;
        }
      });
    });
    const total = qualified || 1;
    return {
      total: qualified,
      winRate: ((win / total) * 100).toFixed(1),
      drawRate: ((draw / total) * 100).toFixed(1),
      lossRate: ((loss / total) * 100).toFixed(1)
    };
  };

  // 各指標の計算結果
  const shotsRes = useMemo(() => analyzeLaw(s => s.shots >= minShots), [matches, minShots]);
  const possessionRes = useMemo(() => analyzeLaw(s => s.possession >= minPossession), [matches, minPossession]);
  const shotQualityRes = useMemo(() => analyzeLaw(s => s.high_xg_shots >= minHighXg), [matches, minHighXg]);
  const defenseRes = useMemo(() => analyzeLaw(s => s.opponent_passes <= maxOpponentPasses), [matches, maxOpponentPasses]);
  const shotAccRes = useMemo(() => analyzeLaw(s => s.shot_accuracy >= minShotAcc), [matches, minShotAcc]);
  const passAccRes = useMemo(() => analyzeLaw(s => s.pass_accuracy >= minPassAcc), [matches, minPassAcc]);

  // 先制点時間の集計
  const firstGoalRes = useMemo(() => {
    let qualified = 0, win = 0, draw = 0, loss = 0;
    matches.forEach(m => {
      if (m.first_goal_team && m.first_goal_minute !== null && m.first_goal_minute <= firstGoalMinute) {
        qualified++;
        if (m.winner === m.first_goal_team) win++;
        else if (m.winner === null) draw++;
        else loss++;
      }
    });
    const total = qualified || 1;
    return {
      total: qualified,
      winRate: ((win / total) * 100).toFixed(1),
      drawRate: ((draw / total) * 100).toFixed(1),
      lossRate: ((loss / total) * 100).toFixed(1)
    };
  }, [matches, firstGoalMinute]);

  // ホーム / アウェイ分析
  const homeAwayRes = useMemo(() => {
    return analyzeLaw(s => {
      return homeAwayCondition === 'home' ? s.is_home === true : s.is_home === false;
    });
  }, [matches, homeAwayCondition]);

  return (
    <div style={{ padding: '30px', backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: '25px', borderBottom: '1px solid #334155', paddingBottom: '15px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', color: '#38bdf8' }}>サッカー試合データ分析ダッシュボード</h1>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
          対象データ数: 全 {matches.length} 試合
        </p>
      </div>

      {/* タブ一覧 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '25px', flexWrap: 'wrap' }}>
        {[
          { id: 'homeAway', label: 'ホーム / アウェイ' },
          { id: 'shots', label: 'シュート本数' },
          { id: 'possession', label: 'ボール支配率' },
          { id: 'firstGoal', label: '先制点時間帯' },
          { id: 'shotQuality', label: '決定機数 (高xG)' },
          { id: 'defense', label: '相手パス許容数' },
          { id: 'shotAcc', label: '枠内シュート率' },
          { id: 'passAcc', label: 'パス成功率' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
              backgroundColor: activeTab === tab.id ? '#0284c7' : '#1e293b', color: '#fff', transition: '0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* メインコンテンツ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
          
          {/* TAB: ホーム / アウェイ */}
          {activeTab === 'homeAway' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>ホーム / アウェイ別の勝率比較</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>ホーム開催・アウェイ開催における基本的な勝敗データの傾向を確認します。</p>
              
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px' }}>対象条件の選択:</label>
                <select
                  value={homeAwayCondition}
                  onChange={e => setHomeAwayCondition(e.target.value)}
                  style={{
                    width: '100%', padding: '8px', borderRadius: '4px', background: '#1e293b', color: '#38bdf8',
                    border: '1px solid #475569', fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  <option value="home">ホームでプレーした試合</option>
                  <option value="away">アウェイでプレーした試合</option>
                </select>
              </div>

              <ResultBar res={homeAwayRes} />
            </div>
          )}

          {/* TAB: シュート本数 */}
          {activeTab === 'shots' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>シュート総数と勝率の関係</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>1試合の中で一定数以上のシュートを放ったチームの勝利確率を集計します。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>シュート本数の閾値: <strong style={{ color: '#38bdf8' }}>{minShots} 本以上</strong></label>
                <input type="range" min="5" max="30" step="1" value={minShots} onChange={e => setMinShots(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={shotsRes} />
            </div>
          )}

          {/* TAB: ボール支配率 */}
          {activeTab === 'possession' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>ボール支配率と勝率の関係</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>一定以上のボール支配率を記録したチームの勝敗結果を集計します。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>ボール支配率の閾値: <strong style={{ color: '#38bdf8' }}>{minPossession}% 以上</strong></label>
                <input type="range" min="30" max="80" step="5" value={minPossession} onChange={e => setMinPossession(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={possessionRes} />
            </div>
          )}

          {/* TAB: 先制点 */}
          {activeTab === 'firstGoal' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>先制点と勝利確率</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>試合前半の特定時間内に先制点を獲得したチームの勝率を算出します。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>先制点の時間帯: <strong style={{ color: '#38bdf8' }}>前半 {firstGoalMinute} 分以内</strong></label>
                <input type="range" min="10" max="45" step="5" value={firstGoalMinute} onChange={e => setFirstGoalMinute(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={firstGoalRes} />
            </div>
          )}

          {/* TAB: 決定機 */}
          {activeTab === 'shotQuality' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>決定機数（xG 0.15以上）と勝率</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>一定以上のゴール期待値を持つシュート機会の構築数と試合結果の相関です。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>決定機の最小本数: <strong style={{ color: '#38bdf8' }}>{minHighXg} 本以上</strong></label>
                <input type="range" min="1" max="8" step="1" value={minHighXg} onChange={e => setMinHighXg(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={shotQualityRes} />
            </div>
          )}

          {/* TAB: 守備強度 */}
          {activeTab === 'defense' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>相手パス試行数の制限（守備強度）</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>相手チームのパス数を一定以下に抑制した試合の勝率を集計します。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>相手パス許容数の上限: <strong style={{ color: '#38bdf8' }}>{maxOpponentPasses} 本以下</strong></label>
                <input type="range" min="200" max="600" step="25" value={maxOpponentPasses} onChange={e => setMaxOpponentPasses(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={defenseRes} />
            </div>
          )}

          {/* TAB: 枠内シュート率 */}
          {activeTab === 'shotAcc' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>枠内シュート率（シュート精度）</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>総シュート数のうち、枠内に飛んだ割合が一定値以上のチームの勝率です。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>枠内シュート率の下限: <strong style={{ color: '#38bdf8' }}>{minShotAcc}% 以上</strong></label>
                <input type="range" min="20" max="70" step="5" value={minShotAcc} onChange={e => setMinShotAcc(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={shotAccRes} />
            </div>
          )}

          {/* TAB: パス成功率 */}
          {activeTab === 'passAcc' && (
            <div>
              <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>パス成功率と勝率</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>ビルドアップおよび全体パスの精度が勝敗に与える影響を集計します。</p>
              <div style={{ background: '#0f172a', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
                <label style={{ fontSize: '13px' }}>パス成功率の下限: <strong style={{ color: '#38bdf8' }}>{minPassAcc}% 以上</strong></label>
                <input type="range" min="70" max="92" step="1" value={minPassAcc} onChange={e => setMinPassAcc(Number(e.target.value))} style={{ width: '100%', marginTop: '8px' }} />
              </div>
              <ResultBar res={passAccRes} />
            </div>
          )}

        </div>

        {/* 右側：要約パネル */}
        <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
          <h3 style={{ color: '#38bdf8', marginTop: 0, fontSize: '15px' }}>分析要約</h3>
          
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
            {activeTab === 'homeAway' && (
              <p>
                {homeAwayCondition === 'home' ? 'ホーム' : 'アウェイ'}チームの勝率は <strong>{homeAwayRes.winRate}%</strong> です。（該当数: {homeAwayRes.total} 件）
              </p>
            )}
            {activeTab === 'shots' && <p>シュートを {minShots} 本以上打ったチームの勝率は <strong>{shotsRes.winRate}%</strong> です。（該当数: {shotsRes.total} 件）</p>}
            {activeTab === 'possession' && <p>ボール支配率 {minPossession}% 以上を記録したチームの勝率は <strong>{possessionRes.winRate}%</strong> です。（該当数: {possessionRes.total} 件）</p>}
            {activeTab === 'firstGoal' && <p>前半 {firstGoalMinute} 分までに先制したチームの勝率は <strong>{firstGoalRes.winRate}%</strong> です。（該当数: {firstGoalRes.total} 件）</p>}
            {activeTab === 'shotQuality' && <p>決定機を {minHighXg} 本以上作ったチームの勝率は <strong>{shotQualityRes.winRate}%</strong> です。（該当数: {shotQualityRes.total} 件）</p>}
            {activeTab === 'defense' && <p>相手パス数を {maxOpponentPasses} 本以下に抑えたチームの勝率は <strong>{defenseRes.winRate}%</strong> です。（該当数: {defenseRes.total} 件）</p>}
            {activeTab === 'shotAcc' && <p>枠内シュート率 {minShotAcc}% 以上を記録したチームの勝率は <strong>{shotAccRes.winRate}%</strong> です。（該当数: {shotAccRes.total} 件）</p>}
            {activeTab === 'passAcc' && <p>パス成功率 {minPassAcc}% 以上を記録したチームの勝率は <strong>{passAccRes.winRate}%</strong> です。（該当数: {passAccRes.total} 件）</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// 集計バーコンポーネント
function ResultBar({ res }) {
  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>該当件数: {res.total} 件</div>
      <div style={{ display: 'flex', height: '32px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #475569' }}>
        <div style={{ width: `${res.winRate}%`, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>
          勝利 {res.winRate}%
        </div>
        <div style={{ width: `${res.drawRate}%`, background: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: '#000' }}>
          引分 {res.drawRate}%
        </div>
        <div style={{ width: `${res.lossRate}%`, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>
          敗北 {res.lossRate}%
        </div>
      </div>
    </div>
  );
}

export default App;