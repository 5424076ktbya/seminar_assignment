import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction, get } from 'firebase/database';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';

import upcomingData from '../upcoming_matches.json';
import demoData from '../demo_matches.json';

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyAEaRhiu8LK12zguD0BAHprxbxAyLzZv_4",
  authDomain: "soccer-predict-59a84.firebaseapp.com",
  databaseURL: "https://soccer-predict-59a84-default-rtdb.firebaseio.com",
  projectId: "soccer-predict-59a84",
  storageBucket: "soccer-predict-59a84.firebasestorage.app",
  messagingSenderId: "307448711261",
  appId: "1:307448711261:web:901df3dd88cc88c789e5b4",
  measurementId: "G-502M75QKZW"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export default function UpcomingMatches() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [voteCounts, setVoteCounts] = useState({});
  const [userVotes, setUserVotes] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_asc');

  const rawData = activeTab === 'upcoming' 
    ? (upcomingData.length > 0 ? upcomingData : []) 
    : demoData;

  useEffect(() => {
    // Googleログイン状態の監視
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        const userVotesRef = ref(db, `user_votes/${user.uid}`);
        get(userVotesRef).then((snapshot) => {
          if (snapshot.exists()) {
            setUserVotes(snapshot.val());
          }
        });
      } else {
        setUserVotes({});
      }
    });

    // 試合ごとの総投票数をリアルタイム監視
    const votesRef = ref(db, 'match_votes');
    const unsubscribeVotes = onValue(votesRef, (snapshot) => {
      setVoteCounts(snapshot.val() || {});
    });

    return () => {
      unsubscribeAuth();
      unsubscribeVotes();
    };
  }, []);

  // 的中率＆勝敗データの計算
  const calculateUserStats = () => {
    let totalFinishedVotes = 0;
    let correctVotes = 0;

    // 全データ（本番＆デモ）から試合結果のあるものを照合
    const allMatches = [...upcomingData, ...demoData];

    allMatches.forEach(match => {
      const userChoice = userVotes[match.id];
      // ユーザーが投票していて、かつ試合結果(result)が存在する場合
      if (userChoice && match.result) {
        totalFinishedVotes += 1;
        if (userChoice === match.result) {
          correctVotes += 1;
        }
      }
    });

    const winRate = totalFinishedVotes > 0 
      ? ((correctVotes / totalFinishedVotes) * 100).toFixed(1) 
      : 0;

    return { totalFinishedVotes, correctVotes, winRate };
  };

  const stats = calculateUserStats();

  const handleLogin = () => {
    signInWithPopup(auth, provider).catch((error) => console.error("ログインエラー:", error));
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleVote = (matchId, choice, isFinished) => {
    if (!currentUser) {
      alert("投票するにはGoogleログインが必要です。");
      return;
    }

    if (isFinished) {
      alert("この試合は既に終了しているため、投票変更はできません。");
      return;
    }

    const previousChoice = userVotes[matchId];
    const isCancel = previousChoice === choice;

    const matchVoteRef = ref(db, `match_votes/${matchId}`);
    runTransaction(matchVoteRef, (currentData) => {
      if (!currentData) currentData = { home: 0, draw: 0, away: 0 };
      if (previousChoice && currentData[previousChoice] > 0) {
        currentData[previousChoice] -= 1;
      }
      if (!isCancel) {
        currentData[choice] = (currentData[choice] || 0) + 1;
      }
      return currentData;
    });

    const newUserVotes = { ...userVotes };
    if (isCancel) {
      delete newUserVotes[matchId];
    } else {
      newUserVotes[matchId] = choice;
    }

    setUserVotes(newUserVotes);
    
    const userVotesRef = ref(db, `user_votes/${currentUser.uid}`);
    runTransaction(userVotesRef, () => newUserVotes);
  };

  const checkIsCloseMatch = (votes) => {
    const total = votes.home + votes.draw + votes.away;
    if (total < 2) return false;
    const homeRate = (votes.home / total) * 100;
    const awayRate = (votes.away / total) * 100;
    return Math.abs(homeRate - awayRate) <= 20 && homeRate >= 25 && awayRate >= 25;
  };

  const processedData = rawData
    .filter(m => {
      if (selectedLeague !== 'ALL' && m.league !== selectedLeague) return false;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const home = m.home_team.toLowerCase();
        const away = m.away_team.toLowerCase();
        if (!home.includes(query) && !away.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date_asc') {
        return new Date(a.datetime) - new Date(b.datetime);
      } else if (sortBy === 'date_desc') {
        return new Date(b.datetime) - new Date(a.datetime);
      } else if (sortBy === 'votes_desc') {
        const votesA = voteCounts[a.id] ? (voteCounts[a.id].home + voteCounts[a.id].draw + voteCounts[a.id].away) : 0;
        const votesB = voteCounts[b.id] ? (voteCounts[b.id].home + voteCounts[b.id].draw + voteCounts[b.id].away) : 0;
        return votesB - votesA;
      }
      return 0;
    });

  const hotMatches = rawData.filter(m => {
    const votes = voteCounts[m.id] || { home: 0, draw: 0, away: 0 };
    return checkIsCloseMatch(votes);
  });

  const renderMatchCard = (m, isHighlight = false) => {
    const votes = voteCounts[m.id] || { home: 0, draw: 0, away: 0 };
    const totalVotes = votes.home + votes.draw + votes.away;

    const homePct = totalVotes ? Math.round((votes.home / totalVotes) * 100) : 0;
    const drawPct = totalVotes ? Math.round((votes.draw / totalVotes) * 100) : 0;
    const awayPct = totalVotes ? Math.round((votes.away / totalVotes) * 100) : 0;

    const userChoice = userVotes[m.id];
    const isFinished = !!m.result;
    const isHit = isFinished && userChoice && userChoice === m.result;

    return (
      <div 
        key={m.id} 
        style={{
          background: isHighlight ? '#25282a' : '#1e1e1e',
          border: isHighlight ? '1px solid #ffb74d' : (isFinished ? (isHit ? '1px solid #4caf50' : '1px solid #f44336') : (userChoice ? '1px solid #2196f3' : '1px solid #333')),
          borderRadius: '6px',
          padding: '16px',
          marginBottom: '12px',
          position: 'relative'
        }}
      >
        {/* ステータスバッジ */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
          {isFinished ? (
            <span style={{ background: '#444', color: '#aaa', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px' }}>
              試合終了
            </span>
          ) : (
            <span style={{ background: '#1b5e20', color: '#81c784', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px' }}>
              受付中
            </span>
          )}

          {userChoice && (
            <span style={{
              background: isFinished ? (isHit ? '#2e7d32' : '#c62828') : '#1565c0',
              color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold'
            }}>
              {isFinished ? (isHit ? '🎯 的中！' : '❌ 不的中') : '投票済み'}
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
          {m.league} | {new Date(m.datetime).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem', fontWeight: 'bold' }}>
          <span style={{ flex: 1, textAlign: 'right', color: m.result === 'home' ? '#ffb74d' : '#fff' }}>
            {m.result === 'home' && "👑 "}{m.home_team}
          </span>
          <span style={{ margin: '0 15px', color: '#888', fontSize: '0.8rem', fontWeight: 'normal' }}>VS</span>
          <span style={{ flex: 1, textAlign: 'left', color: m.result === 'away' ? '#ffb74d' : '#fff' }}>
            {m.away_team}{m.result === 'away' && " 👑"}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button
            onClick={() => handleVote(m.id, 'home', isFinished)}
            disabled={isFinished}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px',
              border: userChoice === 'home' ? '2px solid #66bb6a' : '1px solid #444',
              background: userChoice === 'home' ? '#2e7d32' : '#2a2a2a',
              color: '#fff', cursor: isFinished ? 'not-allowed' : 'pointer', fontSize: '0.85rem',
              opacity: isFinished && userChoice !== 'home' ? 0.5 : 1
            }}
          >
            {userChoice === 'home' && "✓ "}
            {m.home_team} ({homePct}%)
          </button>

          <button
            onClick={() => handleVote(m.id, 'draw', isFinished)}
            disabled={isFinished}
            style={{
              width: '100px', padding: '8px', borderRadius: '4px',
              border: userChoice === 'draw' ? '2px solid #ffb74d' : '1px solid #444',
              background: userChoice === 'draw' ? '#ef6c00' : '#2a2a2a',
              color: '#fff', cursor: isFinished ? 'not-allowed' : 'pointer', fontSize: '0.85rem',
              opacity: isFinished && userChoice !== 'draw' ? 0.5 : 1
            }}
          >
            {userChoice === 'draw' && "✓ "}
            引き分け ({drawPct}%)
          </button>

          <button
            onClick={() => handleVote(m.id, 'away', isFinished)}
            disabled={isFinished}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px',
              border: userChoice === 'away' ? '2px solid #42a5f5' : '1px solid #444',
              background: userChoice === 'away' ? '#1565c0' : '#2a2a2a',
              color: '#fff', cursor: isFinished ? 'not-allowed' : 'pointer', fontSize: '0.85rem',
              opacity: isFinished && userChoice !== 'away' ? 0.5 : 1
            }}
          >
            {userChoice === 'away' && "✓ "}
            {m.away_team} ({awayPct}%)
          </button>
        </div>

        <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', marginTop: '10px', background: '#333' }}>
          <div style={{ width: `${homePct}%`, background: '#2e7d32', transition: 'width 0.3s' }} />
          <div style={{ width: `${drawPct}%`, background: '#ef6c00', transition: 'width 0.3s' }} />
          <div style={{ width: `${awayPct}%`, background: '#1565c0', transition: 'width 0.3s' }} />
        </div>

        <div style={{ fontSize: '0.75rem', color: '#777', textAlign: 'right', marginTop: '6px' }}>
          総投票数: {totalVotes}票 {!isFinished && userChoice && " (再クリックで解除)"}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', background: '#121212', borderRadius: '8px', color: '#e0e0e0' }}>
      
      {/* ログイン＆的中率ステータスバー */}
      <div style={{ background: '#1a1a1a', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {currentUser ? (
              <div>
                <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{currentUser.displayName}</span>
                <span style={{ fontSize: '0.8rem', color: '#aaa', marginLeft: '8px' }}>さんの予想成績</span>
              </div>
            ) : (
              <span style={{ color: '#aaa', fontSize: '0.9rem' }}>ログインすると予想履歴と的中率が保存されます</span>
            )}
          </div>
          {currentUser ? (
            <button onClick={handleLogout} style={{ background: '#333', color: '#aaa', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
              ログアウト
            </button>
          ) : (
            <button onClick={handleLogin} style={{ background: '#4285f4', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Googleでログイン
            </button>
          )}
        </div>

        {/* ログイン時のみ的中率ダッシュボードを表示 */}
        {currentUser && (
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
        )}
      </div>

      {/* タブ切替 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('upcoming')}
          style={{
            flex: 1, padding: '10px', borderRadius: '4px', border: 'none',
            background: activeTab === 'upcoming' ? '#333' : '#1e1e1e',
            color: activeTab === 'upcoming' ? '#fff' : '#888',
            fontWeight: activeTab === 'upcoming' ? 'bold' : 'normal', cursor: 'pointer'
          }}
        >
          直近1か月の試合 ({upcomingData.length})
        </button>

        <button
          onClick={() => setActiveTab('demo')}
          style={{
            flex: 1, padding: '10px', borderRadius: '4px', border: 'none',
            background: activeTab === 'demo' ? '#333' : '#1e1e1e',
            color: activeTab === 'demo' ? '#fff' : '#888',
            fontWeight: activeTab === 'demo' ? 'bold' : 'normal', cursor: 'pointer'
          }}
        >
          デモ用データ（結果あり） ({demoData.length})
        </button>
      </div>

      {/* 注目カード */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', color: '#ffb74d', fontSize: '1rem' }}>
          注目カード（予想拮抗）
        </h3>
        {hotMatches.length > 0 ? (
          hotMatches.map(m => renderMatchCard(m, true))
        ) : (
          <p style={{ color: '#666', fontSize: '0.85rem' }}>
            現在、予想が拮抗しているカードはありません。
          </p>
        )}
      </div>

      {/* 検索・フィルター・ソートバー */}
      <div style={{ background: '#1a1a1a', padding: '12px', borderRadius: '6px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="チーム名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: '150px', padding: '6px 10px', borderRadius: '4px', border: '1px solid #333', background: '#2a2a2a', color: '#fff', fontSize: '0.85rem' }}
        />

        <select
          value={selectedLeague}
          onChange={(e) => setSelectedLeague(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #333', background: '#2a2a2a', color: '#fff', fontSize: '0.85rem' }}
        >
          <option value="ALL">全リーグ</option>
          <option value="EPL">プレミアリーグ (EPL)</option>
          <option value="La_Liga">ラ・リーガ</option>
          <option value="Bundesliga">ブンデスリーガ</option>
          <option value="Serie_A">セリエA</option>
          <option value="Ligue_1">リーグ・アン</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #333', background: '#2a2a2a', color: '#fff', fontSize: '0.85rem' }}
        >
          <option value="date_asc">日時順 (昇順)</option>
          <option value="date_desc">日時順 (降順)</option>
          <option value="votes_desc">投票数が多い順</option>
        </select>
      </div>

      {/* 試合一覧 */}
      <div>
        <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', fontSize: '1rem' }}>
          試合一覧 / 勝敗予想 ({processedData.length}件表示中)
        </h3>

        {processedData.length > 0 ? (
          processedData.map(m => renderMatchCard(m, false))
        ) : (
          <p style={{ color: '#666', textAlign: 'center', padding: '20px 0', fontSize: '0.85rem' }}>
            条件に一致する試合データが見つかりませんでした。
          </p>
        )}
      </div>

    </div>
  );
}