import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, deleteUser } from 'firebase/auth';

import upcomingData from '../upcoming_matches.json';
import jleagueData from '../jleague_matches.json';
import { auth, db } from '../firebase';
import { isMatchLocked } from '../matchAvailability';
import { canonicalTeamName } from '../dataNormalization';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.333A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.681 9c0-.592.102-1.167.282-1.706V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.039l3.007-2.333Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.333C4.672 5.165 6.656 3.58 9 3.58Z" />
    </svg>
  );
}

// Firebase Realtime Database のキーとして安全な試合IDに変換
const getFirebaseMatchId = (matchId) => {
  return String(matchId).replace(/[.#$[\]\/]/g, '_');
};

export default function UpcomingMatches({ onAnalyzeMatch, requestedTeam }) {
  const [regionTab, setRegionTab] = useState('jleague');
  const [pickupFilter, setPickupFilter] = useState('most_voted');

  const [voteCounts, setVoteCounts] = useState({});
  const [userVotes, setUserVotes] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [sortBy, setSortBy] = useState('date_asc');

  useEffect(() => {
    if (!requestedTeam) return;
    const teamName = canonicalTeamName(requestedTeam);
    const isJLeagueTeam = (jleagueData || []).some(match =>
      canonicalTeamName(match.home_team) === teamName || canonicalTeamName(match.away_team) === teamName
    );
    setRegionTab(isJLeagueTeam ? 'jleague' : 'europe');
    setSelectedLeague('ALL');
    setSearchQuery(teamName);
    setShowSearchSuggestions(false);
  }, [requestedTeam]);
  
  // 履歴表示モーダル/アコーディオンの開閉状態
  const [showHistory, setShowHistory] = useState(false);

  // データ取得関数（デモデータ削除済）
  const getRawData = () => {
    if (regionTab === 'jleague') {
      return jleagueData || [];
    } else {
      return upcomingData || [];
    }
  };

  const rawData = getRawData();
  const allMatches = [...(upcomingData || []), ...(jleagueData || [])];
  const normalizedSearchQuery = canonicalTeamName(searchQuery).trim().toLocaleLowerCase('ja');
  const teamSuggestions = normalizedSearchQuery
    ? [...new Set(rawData.flatMap(match => [canonicalTeamName(match.home_team), canonicalTeamName(match.away_team)]).filter(Boolean))]
      .filter(teamName => teamName.toLocaleLowerCase('ja').includes(normalizedSearchQuery))
      .sort((a, b) => a.localeCompare(b, 'ja'))
      .slice(0, 8)
    : [];

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (!user) {
        setUserVotes({});
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setVoteCounts({});
      setUserVotes({});
      return undefined;
    }

    const votesRef = ref(db, 'match_votes');

    const unsubscribeVotes = onValue(votesRef, (snapshot) => {
      const rawVotes = snapshot.val() || {};
      const counts = {};
      const myVotes = {};

      Object.entries(rawVotes).forEach(([matchId, users]) => {
        let home = 0;
        let draw = 0;
        let away = 0;

        if (users && typeof users === 'object') {
          Object.entries(users).forEach(([uid, choice]) => {
            if (choice === 'home') home += 1;
            if (choice === 'draw') draw += 1;
            if (choice === 'away') away += 1;

            if (currentUser && uid === currentUser.uid) {
              myVotes[matchId] = choice;
            }
          });
        }

        counts[matchId] = { home, draw, away };
      });

      setVoteCounts(counts);
      setUserVotes(currentUser ? myVotes : {});
    }, (error) => {
      console.error('投票データの取得に失敗しました:', error);
      setVoteCounts({});
      setUserVotes({});
    });

    return () => {
      unsubscribeVotes();
    };
  }, [currentUser]);

  const calculateUserStats = () => {
    let totalFinishedVotes = 0;
    let correctVotes = 0;

    allMatches.forEach(match => {
      const userChoice = userVotes[getFirebaseMatchId(match.id)];
      if (userChoice && match.result) {
        totalFinishedVotes += 1;
        if (userChoice === match.result) correctVotes += 1;
      }
    });

    const winRate = totalFinishedVotes > 0 
      ? ((correctVotes / totalFinishedVotes) * 100).toFixed(1) 
      : 0;

    return { totalFinishedVotes, correctVotes, winRate };
  };

  const stats = calculateUserStats();

  const getUserHistoryMatches = () => {
    return allMatches.filter(m => !!userVotes[getFirebaseMatchId(m.id)]);
  };

  const historyMatches = getUserHistoryMatches();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Googleログインに失敗しました:', error);
        alert('Googleログインに失敗しました。時間をおいてもう一度お試しください。');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('ログアウトに失敗しました:', error);
      alert('ログアウトに失敗しました。');
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    const confirmed = window.confirm('投票履歴と本サイトの認証アカウントを完全に削除します。この操作は取り消せません。よろしいですか？');
    if (!confirmed) return;

    try {
      await Promise.all(Object.keys(userVotes).map((matchId) =>
        remove(ref(db, `match_votes/${matchId}/${currentUser.uid}`))
      ));
      await deleteUser(currentUser);
      alert('投票履歴とアカウントを削除しました。');
    } catch (error) {
      console.error('アカウント削除に失敗しました:', error);
      if (error.code === 'auth/requires-recent-login') {
        alert('安全のため再ログインが必要です。一度ログアウトして再ログイン後、もう一度削除してください。');
      } else {
        alert('削除に失敗しました。時間をおいてもう一度お試しください。');
      }
    }
  };

  const handleVote = async (matchId, choice, isFinished) => {
    if (!currentUser) {
      alert("投票するにはGoogleログインが必要です。");
      return;
    }

    if (isFinished) {
      alert("この試合は既に終了しています。");
      return;
    }

    const firebaseMatchId = getFirebaseMatchId(matchId);
    const previousChoice = userVotes[firebaseMatchId];
    const isCancel = previousChoice === choice;

    const voteRef = ref(
      db,
      `match_votes/${firebaseMatchId}/${currentUser.uid}`
    );

    try {
      if (isCancel) {
        await remove(voteRef);
      } else {
        await set(voteRef, choice);
      }
    } catch (error) {
      console.error("投票に失敗しました:", error);
      alert("投票に失敗しました。もう一度お試しください。");
    }
  };

  const getFeaturedMatches = () => {
    const currentTargetMatches = getRawData();

    const calculated = currentTargetMatches
      .filter(m => !m.result)
      .map(m => {
        const v = voteCounts[getFirebaseMatchId(m.id)] || { home: 0, draw: 0, away: 0 };
        const total = v.home + v.draw + v.away;
        
        const homePct = total ? (v.home / total) * 100 : 0;
        const awayPct = total ? (v.away / total) * 100 : 0;
        const diff = Math.abs(homePct - awayPct);

        return { ...m, totalVotes: total, diff };
      })
      .filter(m => m.totalVotes > 0);

    if (pickupFilter === 'most_voted') {
      return calculated.sort((a, b) => b.totalVotes - a.totalVotes).slice(0, 2);
    } else if (pickupFilter === 'close_match') {
      return calculated.sort((a, b) => a.diff - b.diff).slice(0, 2);
    } else if (pickupFilter === 'one_sided') {
      return calculated.sort((a, b) => b.diff - a.diff).slice(0, 2);
    }
    return [];
  };

  const featuredMatches = getFeaturedMatches();

  const processedData = rawData
    .filter(m => {
      if (selectedLeague !== 'ALL' && m.league !== selectedLeague) return false;
      if (searchQuery.trim() !== '') {
        const query = canonicalTeamName(searchQuery).toLocaleLowerCase('ja');
        const home = canonicalTeamName(m.home_team).toLocaleLowerCase('ja');
        const away = canonicalTeamName(m.away_team).toLocaleLowerCase('ja');
        if (!home.includes(query) && !away.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.datetime);
      const dateB = new Date(b.datetime);
      if (sortBy === 'date_asc') return dateA - dateB;
      if (sortBy === 'date_desc') return dateB - dateA;
      return 0;
    });

  const renderMatchCard = (m, isFeatured = false) => {
    const firebaseMatchId = getFirebaseMatchId(m.id);
    const votes = voteCounts[firebaseMatchId] || { home: 0, draw: 0, away: 0 };
    const totalVotes = votes.home + votes.draw + votes.away;

    const homePct = totalVotes ? Math.round((votes.home / totalVotes) * 100) : 0;
    const drawPct = totalVotes ? Math.round((votes.draw / totalVotes) * 100) : 0;
    const awayPct = totalVotes ? Math.round((votes.away / totalVotes) * 100) : 0;

    const userChoice = userVotes[firebaseMatchId];
    const isFinished = !!m.result;
    const isLocked = isMatchLocked(m);
    const isHit = isFinished && userChoice && userChoice === m.result;

    return (
      <div 
        key={m.id} 
        style={{ 
          background: isFeatured ? '#22221e' : '#1e1e1e', 
          border: isFeatured 
            ? '1px solid #2563eb'
            : (isFinished ? (isHit ? '1px solid #4caf50' : '1px solid #333') : (userChoice ? '1px solid #2196f3' : '1px solid #333')),
          borderRadius: '8px', 
          padding: '16px', 
          marginBottom: '12px',
          position: 'relative'
        }}
      >
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
          {isFeatured && (
            <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
              PICK UP
            </span>
          )}

          {isFinished ? (
            <span style={{ background: '#333', color: '#aaa', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid #444' }}>
              試合終了
            </span>
          ) : isLocked ? (
            <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid #2563eb', fontWeight: 'bold' }}>
              受付終了
            </span>
          ) : (
            <span style={{ background: '#eff6ff', color: '#2563eb', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid #93c5fd', fontWeight: 'bold' }}>
              受付中
            </span>
          )}

          {userChoice && (
            <span style={{ 
              background: isFinished ? (isHit ? '#2e7d32' : '#c62828') : '#1565c0', 
              color: '#fff', 
              fontSize: '0.7rem', 
              padding: '2px 8px', 
              borderRadius: '4px',
              fontWeight: 'bold'
            }}>
              {isFinished ? (isHit ? '的中' : '不的中') : '投票済み'}
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '12px' }}>
          {m.league} | {m.datetime} <span style={{ marginLeft: '10px', color: '#aaa' }}>（総投票数: {totalVotes}票）</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.05rem', fontWeight: 'bold', padding: '4px 0' }}>
          <div style={{ flex: 1, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
            {m.result === 'home' && (
              <span style={{ background: '#4caf50', color: '#000', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '3px', fontWeight: '900' }}>WIN</span>
            )}
            <span style={{ color: m.result === 'home' ? '#81c784' : (m.result ? '#666' : '#fff') }}>
              {m.home_team}
            </span>
          </div>

          <span style={{ margin: '0 16px', color: '#555', fontSize: '0.85rem', fontWeight: 'normal' }}>VS</span>

          <div style={{ flex: 1, textAlign: 'left', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: m.result === 'away' ? '#81c784' : (m.result ? '#666' : '#fff') }}>
              {m.away_team}
            </span>
            {m.result === 'away' && (
              <span style={{ background: '#4caf50', color: '#000', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '3px', fontWeight: '900' }}>WIN</span>
            )}
          </div>
        </div>

        {m.result === 'draw' && (
          <div style={{ textAlign: 'center', marginTop: '6px' }}>
            <span style={{ background: '#ef6c00', color: '#fff', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '3px', fontWeight: 'bold' }}>DRAW（引き分け）</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button 
            onClick={() => handleVote(m.id, 'home', isLocked)}
            disabled={isLocked}
            style={{ 
              flex: 1, padding: '8px', borderRadius: '4px', 
              border: userChoice === 'home' ? '2px solid #66bb6a' : (m.result === 'home' ? '1px solid #4caf50' : '1px solid #333'), 
              background: userChoice === 'home' ? '#2e7d32' : (m.result === 'home' ? '#1b381e' : '#2a2a2a'), 
              color: '#fff', cursor: isLocked ? 'not-allowed' : 'pointer' 
            }}
          >
            {m.home_team} ({homePct}%)
          </button>
          
          <button 
            onClick={() => handleVote(m.id, 'draw', isLocked)}
            disabled={isLocked}
            style={{ 
              width: '90px', padding: '8px', borderRadius: '4px', 
              border: userChoice === 'draw' ? '2px solid #ffb74d' : (m.result === 'draw' ? '1px solid #ef6c00' : '1px solid #333'), 
              background: userChoice === 'draw' ? '#ef6c00' : (m.result === 'draw' ? '#3d2506' : '#2a2a2a'), 
              color: '#fff', cursor: isLocked ? 'not-allowed' : 'pointer' 
            }}
          >
            引き分け ({drawPct}%)
          </button>

          <button 
            onClick={() => handleVote(m.id, 'away', isLocked)}
            disabled={isLocked}
            style={{ 
              flex: 1, padding: '8px', borderRadius: '4px', 
              border: userChoice === 'away' ? '2px solid #42a5f5' : (m.result === 'away' ? '1px solid #4caf50' : '1px solid #333'), 
              background: userChoice === 'away' ? '#1565c0' : (m.result === 'away' ? '#1b381e' : '#2a2a2a'), 
              color: '#fff', cursor: isLocked ? 'not-allowed' : 'pointer' 
            }}
          >
            {m.away_team} ({awayPct}%)
          </button>
        </div>
        {onAnalyzeMatch && (
          <button
            type="button"
            onClick={() => onAnalyzeMatch(m)}
            style={{ width: '100%', marginTop: '9px', padding: '8px', borderRadius: '4px', border: '1px solid #0284c7', background: 'rgba(2, 132, 199, 0.12)', color: '#7dd3fc', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
          >
            この対戦の過去データ分析・観戦ポイントを見る
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', background: '#121212', borderRadius: '8px', color: '#e0e0e0' }}>
      
      {/* 成績ダッシュボード */}
      <div style={{ background: '#1a1a1a', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {currentUser ? (
              <span><strong>{currentUser.displayName}</strong> さんの予想成績</span>
            ) : (
              <span style={{ color: '#aaa', fontSize: '0.9rem' }}>ログインすると成績・的中率が記録されます</span>
            )}
          </div>
          {currentUser ? (
            <button onClick={handleLogout} style={{ background: '#333', color: '#aaa', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
              ログアウト
            </button>
          ) : (
            <button onClick={handleLogin} style={{ background: '#fff', color: '#1f1f1f', border: '1px solid #747775', padding: '9px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              <GoogleIcon />
              Googleでログイン
            </button>
          )}
        </div>

        {!currentUser && (
          <p style={{ color: '#888', fontSize: '0.75rem', margin: '10px 0 0', lineHeight: 1.5 }}>
            ログインすると、本人識別用のUIDと投票内容をFirebaseに保存します。パスワードは本サイトへ送信されません。
          </p>
        )}

        {currentUser && (
          <>
            <div style={{ display: 'flex', gap: '16px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #2a2a2a' }}>
              <div style={{ flex: 1, background: '#252525', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>通算的中率</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#4caf50' }}>{stats.winRate}%</div>
              </div>
              <div style={{ flex: 1, background: '#252525', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>的中数 / 終了試合</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ffb74d' }}>{stats.correctVotes} / {stats.totalFinishedVotes}</div>
              </div>
            </div>

            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  background: '#2a2a2a', color: '#2196f3', border: '1px solid #333',
                  padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold'
                }}
              >
                {showHistory ? '▲ 自分の予想履歴を閉じる' : `▼ 自分の予想履歴を見る (${historyMatches.length}件)`}
              </button>
            </div>

            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button type="button" onClick={handleDeleteAccount} style={{ background: 'transparent', color: '#ef9a9a', border: '1px solid #633', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>
                アカウントと投票データを削除
              </button>
            </div>

            {showHistory && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #333' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#2196f3' }}>📋 予想した試合の履歴</h4>
                {historyMatches.length > 0 ? (
                  historyMatches.map(m => {
                    const userChoice = userVotes[getFirebaseMatchId(m.id)];
                    const isFinished = !!m.result;
                    const isLocked = isMatchLocked(m);
                    const isHit = isFinished && userChoice === m.result;
                    
                    let choiceText = '引き分け';
                    if (userChoice === 'home') choiceText = `${m.home_team} 勝利`;
                    if (userChoice === 'away') choiceText = `${m.away_team} 勝利`;

                    return (
                      <div 
                        key={`history-${m.id}`}
                        style={{
                          background: '#222', padding: '10px 14px', borderRadius: '6px', marginBottom: '8px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #333'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#888' }}>{m.league} | {m.datetime}</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginTop: '2px' }}>
                            {m.home_team} vs {m.away_team}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#42a5f5', marginTop: '2px' }}>
                            あなたの予想: <strong>{choiceText}</strong>
                          </div>
                        </div>

                        <div>
                          {isFinished ? (
                            isHit ? (
                              <span style={{ background: '#2e7d32', color: '#fff', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                的中 
                              </span>
                            ) : (
                              <span style={{ background: '#c62828', color: '#fff', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                                不的中 
                              </span>
                            )
                          ) : isLocked ? (
                            <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '4px', border: '1px solid #2563eb', fontWeight: 'bold' }}>
                              受付終了
                            </span>
                          ) : (
                            <span style={{ background: '#eff6ff', color: '#2563eb', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '4px', border: '1px solid #93c5fd', fontWeight: 'bold' }}>
                              受付中
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center', padding: '10px 0' }}>
                    まだ予想した試合がありません
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 注目の試合 Pick Up エリア */}
      <div style={{ marginBottom: '25px', background: '#181818', padding: '16px', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ fontSize: '1.05rem', color: '#2563eb', margin: 0, fontWeight: 'bold' }}>
              注目の試合 
            </h3>

            <div style={{ display: 'flex', gap: '4px', background: '#252525', padding: '3px', borderRadius: '6px' }}>
              <button
                onClick={() => { setRegionTab('jleague'); setSelectedLeague('ALL'); }}
                style={{
                  padding: '4px 12px', borderRadius: '4px', border: 'none', fontSize: '0.75rem',
                  background: regionTab === 'jleague' ? '#1565c0' : 'transparent',
                  color: regionTab === 'jleague' ? '#fff' : '#aaa',
                  fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                Jリーグ
              </button>
              <button
                onClick={() => { setRegionTab('europe'); setSelectedLeague('ALL'); }}
                style={{
                  padding: '4px 12px', borderRadius: '4px', border: 'none', fontSize: '0.75rem',
                  background: regionTab === 'europe' ? '#1565c0' : 'transparent',
                  color: regionTab === 'europe' ? '#fff' : '#aaa',
                  fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                欧州5大
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setPickupFilter('most_voted')}
              style={{
                padding: '4px 10px', borderRadius: '4px', border: 'none', fontSize: '0.75rem',
                background: pickupFilter === 'most_voted' ? '#2563eb' : '#f8fafc',
                color: pickupFilter === 'most_voted' ? '#fff' : '#475569',
                fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              投票数が多い
            </button>
            <button
              onClick={() => setPickupFilter('close_match')}
              style={{
                padding: '4px 10px', borderRadius: '4px', border: 'none', fontSize: '0.75rem',
                background: pickupFilter === 'close_match' ? '#2563eb' : '#f8fafc',
                color: pickupFilter === 'close_match' ? '#fff' : '#475569',
                fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              予想が拮抗
            </button>
            <button
              onClick={() => setPickupFilter('one_sided')}
              style={{
                padding: '4px 10px', borderRadius: '4px', border: 'none', fontSize: '0.75rem',
                background: pickupFilter === 'one_sided' ? '#2563eb' : '#f8fafc',
                color: pickupFilter === 'one_sided' ? '#fff' : '#475569',
                fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              予想に差がある
            </button>
          </div>
        </div>

        {featuredMatches.length > 0 ? (
          featuredMatches.map(m => renderMatchCard(m, true))
        ) : (
          <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center', padding: '16px 0' }}>
            現在対象の試合（1票以上の投票がある試合）がありません
          </div>
        )}
      </div>

      {/* 【メインタブ】 Jリーグ vs 欧州5大リーグ */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button
          onClick={() => { setRegionTab('jleague'); setSelectedLeague('ALL'); }}
          style={{
            flex: 1, padding: '12px', borderRadius: '6px', border: 'none',
            background: regionTab === 'jleague' ? '#1565c0' : '#222',
            color: regionTab === 'jleague' ? '#fff' : '#aaa',
            fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem'
          }}
        >
          Jリーグ (J1)
        </button>

        <button
          onClick={() => { setRegionTab('europe'); setSelectedLeague('ALL'); }}
          style={{
            flex: 1, padding: '12px', borderRadius: '6px', border: 'none',
            background: regionTab === 'europe' ? '#1565c0' : '#222',
            color: regionTab === 'europe' ? '#fff' : '#aaa',
            fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem'
          }}
        >
          欧州5大リーグ
        </button>
      </div>

      {/* 💡【新規追加】欧州5大リーグの各リーグ別切り替えタブ（デモ用タブから変更） */}
      {regionTab === 'europe' && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '15px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', name: 'すべて' },
            { id: 'EPL', name: 'プレミア (EPL)' },
            { id: 'La_Liga', name: 'ラ・リーガ' },
            { id: 'Bundesliga', name: 'ブンデス' },
            { id: 'Serie_A', name: 'セリエA' },
            { id: 'Ligue_1', name: 'リーグ・アン' },
          ].map(league => (
            <button
              key={league.id}
              onClick={() => setSelectedLeague(league.id)}
              style={{
                padding: '6px 12px', borderRadius: '20px', border: 'none', fontSize: '0.8rem',
                background: selectedLeague === league.id ? '#2196f3' : '#2a2a2a',
                color: selectedLeague === league.id ? '#fff' : '#aaa',
                fontWeight: selectedLeague === league.id ? 'bold' : 'normal',
                cursor: 'pointer'
              }}
            >
              {league.name}
            </button>
          ))}
        </div>
      )}

      {/* 検索コントロール */}
      {requestedTeam && searchQuery === canonicalTeamName(requestedTeam) && (
        <div style={{ marginBottom: '10px', padding: '9px 11px', border: '1px solid #93c5fd', borderRadius: '6px', background: '#eff6ff', color: '#1e3a8a', fontSize: '0.82rem' }}>
          <strong>{canonicalTeamName(requestedTeam)}</strong> の試合に絞り込んでいます。試合カードから2チームの比較と観戦ポイントを確認できます。
        </div>
      )}
      <div style={{ position: 'relative', background: '#1a1a1a', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
        <input
          type="text"
          placeholder="クラブ名で検索..."
          value={searchQuery}
          onFocus={() => setShowSearchSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSearchSuggestions(false), 120)}
          onChange={(e) => { setSearchQuery(e.target.value); setShowSearchSuggestions(true); }}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #333', background: '#2a2a2a', color: '#fff', boxSizing: 'border-box' }}
        />
        {showSearchSuggestions && teamSuggestions.length > 0 && (
          <div className="upcoming-search-suggestions" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% - 10px)', left: '10px', right: '10px', border: '1px solid #cbd5e1', borderRadius: '0 0 6px 6px', background: '#fff', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.14)', overflow: 'hidden' }}>
            {teamSuggestions.map(teamName => (
              <button
                key={teamName}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => { setSearchQuery(teamName); setShowSearchSuggestions(false); }}
                style={{ display: 'block', width: '100%', padding: '9px 12px', border: 0, borderTop: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', textAlign: 'left', cursor: 'pointer', fontSize: '0.86rem' }}
              >
                {teamName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 試合一覧表示エリア */}
      <div>
        <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', fontSize: '1rem', color: '#bbb' }}>
          {regionTab === 'jleague' ? 'J1リーグ 試合一覧' : `欧州 直近試合 (${selectedLeague === 'ALL' ? '全リーグ' : selectedLeague})`} ({processedData.length}件)
        </h3>

        {processedData.length > 0 ? (
          processedData.map(m => renderMatchCard(m))
        ) : (
          <p style={{ color: '#666', textAlign: 'center', padding: '30px 0' }}>
            該当する試合データがありません。
          </p>
        )}
      </div>

    </div>
  );
}
