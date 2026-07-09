import React, { useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import shotsData from './data/shots.json';
import passesData from './data/passes.json';

const STRATEGIC_COLORS = {
  'Ground Pass': '#ec4899', 
  'Cross': '#f59e0b',       
  'High Pass': '#3b82f6',    
  'Low Pass': '#10b981',     
  'Other': '#8b5cf6'         
};

export default function App() {
  const teams = [...new Set(shotsData.map(s => s.team))];
  const [selectedTeam, setSelectedTeam] = useState(teams[0] || '');
  const [selectedPassType, setSelectedPassType] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const [hoveredPass, setHoveredPass] = useState(null);
  const [tooltipStyle, setTooltipStyle] = useState({ left: '0px', top: '0px' });

  // ==========================================
  // 📊 試合全体のスタッツを自動集計するロジック
  // ==========================================
  const teamA = teams[0] || "Team A";
  const teamB = teams[1] || "Team B";

  const getTeamStats = (teamName) => {
    const s = shotsData.filter(x => x.team === teamName);
    const p = passesData.filter(x => x.team === teamName);
    const goalsCount = s.filter(x => x.outcome.toLowerCase() === 'goal').length;
    const savedCount = s.filter(x => x.outcome.toLowerCase() === 'saved').length;
    const onTarget = goalsCount + savedCount; // ゴール + セーブされたものは枠内

    return {
      shots: s.length,
      goals: goalsCount,
      onTarget: onTarget,
      keyPasses: p.length
    };
  };

  const statsA = getTeamStats(teamA);
  const statsB = getTeamStats(teamB);

  // フィルター用データ
  const teamShots = shotsData.filter(s => s.team === selectedTeam);
  const teamPasses = passesData.filter(p => p.team === selectedTeam);

  const players = [...new Set([...teamShots.map(s => s.player), ...teamPasses.map(p => p.player)])].filter(Boolean).sort();

  const currentShots = selectedPlayer ? teamShots.filter(s => s.player === selectedPlayer) : teamShots;
  const currentPasses = selectedPlayer ? teamPasses.filter(p => p.player === selectedPlayer) : teamPasses;

  const goals = currentShots.filter(s => s.outcome === 'Goal');
  const misses = currentShots.filter(s => s.outcome !== 'Goal');

  const passTypeCounts = currentPasses.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});
  
  const pieData = Object.keys(passTypeCounts).map(key => ({
    name: key,
    value: passTypeCounts[key],
    color: STRATEGIC_COLORS[key] || STRATEGIC_COLORS['Other']
  }));

  const displayPasses = selectedPassType ? currentPasses.filter(p => p.type === selectedPassType) : currentPasses;

  const translatePassType = (type) => {
    if (type === 'Ground Pass') return 'グラウンダーパス';
    if (type === 'Cross') return 'クロス';
    if (type === 'High Pass') return 'ハイパス（浮き球）';
    if (type === 'Low Pass') return 'ローパス';
    return type;
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setTooltipStyle({ left: `${mouseX + 15}px`, top: `${mouseY + 15}px` });
  };

  const PitchBackground = () => (
    <>
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30"></div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] h-[30%] border-2 border-white/30 rounded-full"></div>
      <div className="absolute right-0 top-1/4 w-[16.5%] h-1/2 border-2 border-white/40 bg-emerald-800/20"></div>
      <div className="absolute right-0 top-[37%] w-[5.5%] h-[26%] border-2 border-white/40"></div>
      <div className="absolute right-[11%] top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white/70 rounded-full"></div>
      <div className="absolute -right-1 top-[45%] w-1 h-[10%] bg-white border border-slate-900"></div>
    </>
  );

  // 📊 スタッツバーを1行描画するためのミニコンポーネント
  const StatRow = ({ label, valA, valB }) => {
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    const total = numA + numB;
    const pctA = total > 0 ? (numA / total) * 100 : 50;
    
    return (
      <div className="mb-4">
        <div className="flex justify-between text-xs font-semibold mb-1">
          <span className="text-emerald-400 font-bold">{valA}</span>
          <span className="text-slate-400">{label}</span>
          <span className="text-cyan-400 font-bold">{valB}</span>
        </div>
        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${pctA}%` }}></div>
          <div className="bg-cyan-500 h-full transition-all duration-500" style={{ width: `${100 - pctA}%` }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      {/* ヘッダー */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
            サッカー試合の可視化 
          </h1>
          <p className="text-slate-400 mt-1">{teams.join(' vs ')} の試合データを可視化</p>
        </div>
        
        <div className="mt-4 md:mt-0 flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          {teams.map(team => (
            <button
              key={team}
              onClick={() => {
                setSelectedTeam(team);
                setSelectedPassType(null);
                setSelectedPlayer(null);
                setHoveredPass(null);
              }}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
                selectedTeam === team ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      </header>

      {/* 選手フィルター */}
      <div className="mb-6 bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-300">🏃‍♂️ 選手で分析:</span>
          <select
            value={selectedPlayer || ''}
            onChange={(e) => {
              setSelectedPlayer(e.target.value || null);
              setSelectedPassType(null);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 focus:outline-none focus:border-emerald-500 max-w-xs cursor-pointer"
          >
            <option value="">✨ チーム全員を表示</option>
            {players.map(player => (
              <option key={player} value={player}>{player}</option>
            ))}
          </select>
        </div>
        {selectedPlayer && (
          <button
            onClick={() => setSelectedPlayer(null)}
            className="text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-3 py-1.5 rounded-lg transition-all"
          >
            ❌ フィルターを解除して全員に戻す
          </button>
        )}
      </div>

      {/* マップ並列エリア */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* 左：シュート位置分析 */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col">
          <div className="mb-4">
            <h2 className="text-xl font-bold">⚽ {selectedPlayer ? `${selectedPlayer} のシュート` : 'シュート位置分析'}</h2>
          </div>
          
          <div className="relative w-full aspect-[120/80] bg-emerald-800 border-2 border-slate-200/40 rounded-sm overflow-hidden shadow-inner flex-grow">
            <PitchBackground />
            <div className="absolute inset-0 z-20">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <XAxis type="number" dataKey="x" domain={[0, 120]} hide />
                  <YAxis type="number" dataKey="y" domain={[0, 80]} hide />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const translateOutcome = (outcome) => {
                          if (!outcome) return outcome;
                          const lower = outcome.toLowerCase();
                          if (lower === 'goal') return '⚽ ゴール';
                          if (lower === 'off t') return '❌ 枠外シュート';
                          if (lower === 'saved') return '🧤 キーパーセーブ';
                          if (lower === 'blocked') return '🛡️ ブロック';
                          if (lower === 'post') return '🥅 ポスト・バー直撃';
                          return outcome;
                        };
                        return (
                          <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-xl text-xs shadow-2xl backdrop-blur-md min-w-[180px]">
                            <p className="font-bold text-sm text-emerald-400 mb-1.5">{data.player}</p>
                            <div className="space-y-1 text-slate-300">
                              <p className="flex justify-between"><span className="text-slate-500">時間:</span> <span className="font-medium">{data.minute}分</span></p>
                              <p className="flex justify-between">
                                <span className="text-slate-500">結果:</span> 
                                <span className={`font-bold ${data.outcome && data.outcome.toLowerCase() === 'goal' ? 'text-rose-400' : 'text-cyan-400'}`}>
                                  {translateOutcome(data.outcome)}
                                </span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* ZAxisを削除し、一律の大きさ(size)でプロット */}
                  <Scatter name="ゴール" data={goals} fill="#f43f5e" stroke="#fff" strokeWidth={1} size={120} />
                  <Scatter name="枠外・セーブ" data={misses} fill="#38bdf8" opacity={0.7} stroke="#fff" strokeWidth={1} size={120} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 右：パス軌跡分析 */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col">
          <div className="mb-4 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">🎯 {selectedPlayer ? `${selectedPlayer} のパス軌跡` : 'パス軌跡分析'}</h2>
              <p className="text-xs text-slate-400 mt-1">※矢印にマウスを乗せるとパスの情報を表示します</p>
            </div>
            {selectedPassType && (
              <button onClick={() => setSelectedPassType(null)} className="text-xs bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded text-slate-300 transition-all shadow">
                全パスを表示
              </button>
            )}
          </div>
          
          <div className="relative w-full aspect-[120/80] bg-emerald-800 border-2 border-slate-200/40 rounded-sm overflow-hidden shadow-inner flex-grow cursor-crosshair" onMouseMove={handleMouseMove}>
            <PitchBackground />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 80" preserveAspectRatio="none">
              <defs>
                {Object.keys(STRATEGIC_COLORS).map(type => (
                  <marker key={`arrow-${type}`} id={`arrow-${type.replace(' ', '-')}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill={STRATEGIC_COLORS[type]} />
                  </marker>
                ))}
              </defs>
              {displayPasses.map((pass, i) => {
                const passColor = STRATEGIC_COLORS[pass.type] || STRATEGIC_COLORS['Other'];
                const markerId = `arrow-${(pass.type || 'Other').replace(' ', '-')}`;
                const isHovered = hoveredPass === pass;
                const anyHovered = hoveredPass !== null;
                return (
                  <g key={i} opacity={isHovered ? 1.0 : (anyHovered ? 0.15 : 0.75)} className="transition-opacity duration-150" style={{ pointerEvents: 'auto' }} onMouseEnter={() => setHoveredPass(pass)} onMouseLeave={() => setHoveredPass(null)}>
                    <line x1={pass.x} y1={pass.y} x2={pass.end_x} y2={pass.end_y} stroke="transparent" strokeWidth="4" className="cursor-pointer" />
                    <line x1={pass.x} y1={pass.y} x2={pass.end_x} y2={pass.end_y} stroke={passColor} strokeWidth={isHovered ? "1.6" : "1.0"} strokeDasharray={pass.type === 'Cross' ? '1.5 1.5' : 'none'} markerEnd={`url(#${markerId})`} />
                    <circle cx={pass.x} cy={pass.y} r={isHovered ? "1.0" : "0.7"} fill={passColor} />
                  </g>
                );
              })}
            </svg>
            {hoveredPass && (
              <div className="absolute z-50 bg-slate-900/95 border border-slate-700 p-3 rounded-xl text-xs shadow-2xl backdrop-blur-md w-[200px] pointer-events-none" style={{ left: tooltipStyle.left, top: tooltipStyle.top }}>
                <p className="font-bold text-sm text-amber-400 mb-2 truncate">🏃‍♂️ {hoveredPass.player || '不明な選手'}</p>
                <p className="text-slate-300">種類: <span className="font-bold" style={{ color: STRATEGIC_COLORS[hoveredPass.type] }}>{translatePassType(hoveredPass.type)}</span></p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 下部：統計情報エリア */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mt-8">
        
        {/* 📊 チームスタッツ徹底比較ボード */}
        <div className="xl:col-span-1 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
              <span>📊 チームスタッツ比較</span>
              <span className="text-xs font-normal text-slate-400">（試合全体）</span>
            </h2>
            <div className="flex justify-between items-center text-center font-bold text-sm mb-6 border-b border-slate-700 pb-3">
              <span className="text-emerald-400 w-1/3 truncate text-left">{teamA}</span>
              <span className="text-slate-500 w-1/3">VS</span>
              <span className="text-cyan-400 w-1/3 truncate text-right">{teamB}</span>
            </div>
            
            <StatRow label="ゴール数" valA={statsA.goals} valB={statsB.goals} />
            <StatRow label="総シュート数" valA={statsA.shots} valB={statsB.shots} />
            <StatRow label="枠内シュート数" valA={statsA.onTarget} valB={statsB.onTarget} />
            <StatRow label="キーパス（決定機）" valA={statsA.keyPasses} valB={statsB.keyPasses} />
          </div>
        </div>

        {/* フィルター用の個人/チームミニスタッツ */}
        <div className="xl:col-span-1 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold mb-4">🔍 選択フィルター内の集計</h2>
            <p className="text-xs text-slate-400 mb-6">上のフィルターで選択されている項目だけの集計値です。</p>
          </div>
          {/* grid-cols-3 から grid-cols-2 に変更し、総xG枠を削除 */}
          <div className="grid grid-cols-2 gap-3 h-full items-center">
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
              <p className="text-[11px] text-slate-400 font-medium">シュート数</p>
              <p className="text-2xl font-extrabold text-emerald-400 mt-1">{currentShots.length}</p>
            </div>
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
              <p className="text-[11px] text-slate-400 font-medium">ゴール数</p>
              <p className="text-2xl font-extrabold text-rose-500 mt-1">{goals.length}</p>
            </div>
          </div>
        </div>

        {/* 円グラフ */}
        <div className="xl:col-span-1 bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold">🎯 チャンスパス内訳</h2>
            <p className="text-xs text-slate-400 mt-1 mb-2">※クリックで右マップを絞り込みます</p>
          </div>
          <div className="h-44 w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={60} paddingAngle={5} dataKey="value" onClick={(data) => setSelectedPassType(data.name)} className="cursor-pointer">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke={selectedPassType === entry.name ? '#fff' : 'none'} strokeWidth={2} opacity={selectedPassType && selectedPassType !== entry.name ? 0.3 : 1} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={32} onClick={(data) => setSelectedPassType(data.value)} wrapperStyle={{ cursor: 'pointer', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm">チャンスメイクデータはありません</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}