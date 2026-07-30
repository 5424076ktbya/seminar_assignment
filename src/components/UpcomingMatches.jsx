import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction, get } from 'firebase/database';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';

// 各データファイルの読み込み
import upcomingData from '../upcoming_matches.json';
import demoData from '../demo_matches.json';
import jleagueData from '../jleague_matches.json';

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
  // 1. メインタブ ('jleague' | 'europe') -> デフォルトを現在シーズン中のJリーグに設定
  const [regionTab, setRegionTab] = useState('jleague');
  // 2. 欧州用サブタブ ('upcoming' | 'demo')
  const [europeSubTab, setEuropeSubTab] = useState('upcoming');

  const [voteCounts, setVoteCounts] = useState({});
  const [userVotes, setUserVotes] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_asc');

  // 現在選択されているカテゴリに応じたソースデータを取得
  const getRawData = () => {
    if (regionTab === 'jleague') {
      return jleagueData || [];
    } else {
      return europeSubTab === 'upcoming' ? (upcomingData || []) : (demoData || []);
    }
  };

  const rawData = getRawData();

  useEffect(() => {
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

    const votesRef = ref(db, 'match_votes');
    const unsubscribeVotes = onValue(votesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setVoteCounts(data);
      } else {
        setVoteCounts({});
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeVotes();
    };
  }, []);

  // 通算的中率の計算（Jリーグ・欧州すべてのデータを照合）
  const calculateUserStats = () => {
    let totalFinishedVotes = 0;
    let correctVotes = 0;

    const allMatches = [
      ...(upcomingData || []),
      ...(demoData || []),
      ...(jleagueData || [])
    ];

    allMatches.forEach(match => {
      const userChoice = userVotes[match.id];
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
    signInWithPopup(auth, provider).catch(error => console.error("Login failed:", error));
  };

  const handleLogout = () => {
    signOut(auth).catch(error => console.error("Logout failed:", error));
  };

  const handleVote = (matchId, choice, isFinished) => {
    if (!currentUser) {
      alert("投票するにはGoogleログインが必要です。");
      return;
    }
    if (isFinished) {
      alert("この試合は既に終了しています。");
      return;
    }

    const previousChoice = userVotes[matchId];
    const isCancel = previousChoice === choice;

    const matchVoteRef = ref(db, `match_votes/${matchId}`);
    runTransaction(matchVoteRef, (currentData) => {
      if (!currentData) {
        currentData = { home: 0, draw: 0, away: 0 };
      }
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

  // フィルター・ソート処理
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
      const dateA = new Date(a.datetime);
      const dateB = new Date(b.datetime);
      if (sortBy === 'date_asc') return dateA - dateB;
      if (sortBy === 'date_desc') return dateB - dateA;
      return 0;
    });

  const renderMatchCard = (m) => {
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
          background: '#1e1e1e', 
          border: isFinished 
            ? (isHit ? '1px solid #4caf50' : '1px solid #f44336') 
            : (userChoice ? '1px solid #2196f3' : '1px solid #333'),
          borderRadius: '6px', 
          padding: '16px', 
          marginBottom: '12px',
          position: 'relative'
        }}
      >
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
              color: '#fff', 
              fontSize: '0.7rem', 
              padding: '2px 8px', 
              borderRadius: '10px',
              fontWeight: 'bold'
            }}>
              {isFinished ? (isHit ? '🎯 的中！' : '❌ 不的中') : '投票済み'}
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
          {m.league} | {m.datetime}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem', fontWeight: 'bold' }}>
          <span style={{ flex: 1, textAlign: 'right', color: m.result === 'home' ? '#ffb74d' : '#fff' }}>
            {m.result === 'home' && "👑 "}{m.home_team}
          </span>
          <span style={{ margin: '0 15px', color: '#888', fontSize: '0.8rem' }}>VS</span>
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
              color: '#fff', cursor: isFinished ? 'not-allowed' : 'pointer' 
            }}
          >
            {m.home_team} ({homePct}%)
          </button>
          
          <button 
            onClick={() => handleVote(m.id, 'draw', isFinished)}
            disabled={isFinished}
            style={{ 
              width: '90px', padding: '8px', borderRadius: '4px', 
              border: userChoice === 'draw' ? '2px solid #ffb74d' : '1px solid #444', 
              background: userChoice === 'draw' ? '#ef6c00' : '#2a2a2a', 
              color: '#fff', cursor: isFinished ? 'not-allowed' : 'pointer' 
            }}
          >
            引き分け ({drawPct}%)
          </button>

          <button 
            onClick={() => handleVote(m.id, 'away', isFinished)}
            disabled={isFinished}
            style={{ 
              flex: 1, padding: '8px', borderRadius: '4px', 
              border: userChoice === 'away' ? '2px solid #42a5f5' : '1px solid #444', 
              background: userChoice === 'away' ? '#1565c0' : '#2a2a2a', 
              color: '#fff', cursor: isFinished ? 'not-allowed' : 'pointer' 
            }}
          >
            {m.away_team} ({awayPct}%)
          </button>
        </div>
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
            <button onClick={handleLogin} style={{ background: '#4285f4', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Googleでログイン
            </button>
          )}
        </div>

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
          🇯🇵 Jリーグ (J1)
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
          🇪🇺 欧州5大リーグ
        </button>
      </div>

      {/* 欧州タブ選択時のみ表示するサブ切り替えボタン */}
      {regionTab === 'europe' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
          <button
            onClick={() => setEuropeSubTab('upcoming')}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px', border: 'none',
              background: europeSubTab === 'upcoming' ? '#333' : '#1a1a1a',
              color: europeSubTab === 'upcoming' ? '#fff' : '#777', cursor: 'pointer'
            }}
          >
            直近の試合 ({upcomingData ? upcomingData.length : 0})
          </button>
          <button
            onClick={() => setEuropeSubTab('demo')}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px', border: 'none',
              background: europeSubTab === 'demo' ? '#333' : '#1a1a1a',
              color: europeSubTab === 'demo' ? '#fff' : '#777', cursor: 'pointer'
            }}
          >
            デモ用データ ({demoData ? demoData.length : 0})
          </button>
        </div>
      )}

      {/* 検索コントロール */}
      <div style={{ background: '#1a1a1a', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
        <input
          type="text"
          placeholder="クラブ名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #333', background: '#2a2a2a', color: '#fff', boxSizing: 'border-box' }}
        />
      </div>

      {/* 試合一覧表示エリア */}
      <div>
        <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', fontSize: '1rem', color: '#bbb' }}>
          {regionTab === 'jleague' ? '🇯🇵 J1リーグ 試合一覧' : (europeSubTab === 'upcoming' ? '🇪🇺 欧州 直近試合' : '🇪🇺 欧州 デモデータ')} ({processedData.length}件)
        </h3>

        {processedData.length > 0 ? (
          processedData.map(m => renderMatchCard(m))
        ) : (
          <p style={{ color: '#666', textAlign: 'center', padding: '30px 0' }}>
            {regionTab === 'europe' && europeSubTab === 'upcoming' 
              ? '現在、欧州リーグはオフシーズンのため直近の試合データがありません。「デモ用データ」または「Jリーグ」タブをお試しください。'
              : '該当する試合データがありません。'}
          </p>
        )}
      </div>

    </div>
  );
}