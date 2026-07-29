import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction } from 'firebase/database';

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

export default function UpcomingMatches() {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [voteCounts, setVoteCounts] = useState({});
  const [userVotes, setUserVotes] = useState({});

  const currentData = activeTab === 'upcoming' 
    ? (upcomingData.length > 0 ? upcomingData : []) 
    : demoData;

  useEffect(() => {
    const savedVotes = JSON.parse(localStorage.getItem('userMatchVotes') || '{}');
    setUserVotes(savedVotes);

    const votesRef = ref(db, 'match_votes');
    const unsubscribe = onValue(votesRef, (snapshot) => {
      setVoteCounts(snapshot.val() || {});
    });

    return () => unsubscribe();
  }, []);

  const handleVote = (matchId, choice) => {
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
    localStorage.setItem('userMatchVotes', JSON.stringify(newUserVotes));
  };

  const checkIsCloseMatch = (votes) => {
    const total = votes.home + votes.draw + votes.away;
    if (total < 2) return false;
    const homeRate = (votes.home / total) * 100;
    const awayRate = (votes.away / total) * 100;
    return Math.abs(homeRate - awayRate) <= 20 && homeRate >= 25 && awayRate >= 25;
  };

  const hotMatches = currentData.filter(m => {
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

    return (
      <div 
        key={m.id} 
        style={{
          background: isHighlight ? '#25282a' : '#1e1e1e',
          border: isHighlight ? '1px solid #ffb74d' : '1px solid #333',
          borderRadius: '6px',
          padding: '16px',
          marginBottom: '12px'
        }}
      >
        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
          {m.league} | {new Date(m.datetime).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem', fontWeight: 'bold' }}>
          <span style={{ flex: 1, textAlign: 'right' }}>{m.home_team}</span>
          <span style={{ margin: '0 15px', color: '#888', fontSize: '0.8rem', fontWeight: 'normal' }}>VS</span>
          <span style={{ flex: 1, textAlign: 'left' }}>{m.away_team}</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button
            onClick={() => handleVote(m.id, 'home')}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444',
              background: userChoice === 'home' ? '#2e7d32' : '#2a2a2a',
              color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            {m.home_team} ({homePct}%)
          </button>

          <button
            onClick={() => handleVote(m.id, 'draw')}
            style={{
              width: '90px', padding: '8px', borderRadius: '4px', border: '1px solid #444',
              background: userChoice === 'draw' ? '#ef6c00' : '#2a2a2a',
              color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            引き分け ({drawPct}%)
          </button>

          <button
            onClick={() => handleVote(m.id, 'away')}
            style={{
              flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444',
              background: userChoice === 'away' ? '#1565c0' : '#2a2a2a',
              color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
            }}
          >
            {m.away_team} ({awayPct}%)
          </button>
        </div>

        <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', marginTop: '10px', background: '#333' }}>
          <div style={{ width: `${homePct}%`, background: '#2e7d32', transition: 'width 0.3s' }} />
          <div style={{ width: `${drawPct}%`, background: '#ef6c00', transition: 'width 0.3s' }} />
          <div style={{ width: `${awayPct}%`, background: '#1565c0', transition: 'width 0.3s' }} />
        </div>

        <div style={{ fontSize: '0.75rem', color: '#777', textAlign: 'right', marginTop: '6px' }}>
          総投票数: {totalVotes}票 {userChoice && " (再クリックで解除)"}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', background: '#121212', borderRadius: '8px', color: '#e0e0e0' }}>
      
      {/* タブ切替 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('upcoming')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: 'none',
            background: activeTab === 'upcoming' ? '#333' : '#1e1e1e',
            color: activeTab === 'upcoming' ? '#fff' : '#888',
            fontWeight: activeTab === 'upcoming' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
        >
          直近1か月の試合 ({upcomingData.length})
        </button>

        <button
          onClick={() => setActiveTab('demo')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: 'none',
            background: activeTab === 'demo' ? '#333' : '#1e1e1e',
            color: activeTab === 'demo' ? '#fff' : '#888',
            fontWeight: activeTab === 'demo' ? 'bold' : 'normal',
            cursor: 'pointer'
          }}
        >
          デモ用データ ({demoData.length})
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

      {/* 試合一覧 */}
      <div>
        <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '8px', fontSize: '1rem' }}>
          試合一覧 / 勝敗予想
        </h3>
        <p style={{ color: '#777', fontSize: '0.8rem', marginBottom: '16px' }}>
          {activeTab === 'upcoming' 
            ? "直近1か月以内に開催予定の試合一覧です。" 
            : "動作確認用のデモ試合データです。"}
        </p>

        {currentData.length > 0 ? (
          currentData.map(m => renderMatchCard(m, false))
        ) : (
          <p style={{ color: '#666', textAlign: 'center', padding: '20px 0', fontSize: '0.85rem' }}>
            現在、表示可能な試合データはありません。
          </p>
        )}
      </div>

    </div>
  );
}