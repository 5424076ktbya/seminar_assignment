import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction } from 'firebase/database';
import upcomingData from '../upcoming_matches.json';

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

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function UpcomingMatches() {
  const [voteCounts, setVoteCounts] = useState({});
  const [userVotes, setUserVotes] = useState({});

  useEffect(() => {
    // 自分の過去の投票をローカルストレージから復元
    const savedVotes = JSON.parse(localStorage.getItem('userMatchVotes') || '{}');
    setUserVotes(savedVotes);

    // Firebaseの全ユーザー投票データをリアルタイム監視
    const votesRef = ref(db, 'match_votes');
    const unsubscribe = onValue(votesRef, (snapshot) => {
      const data = snapshot.val() || {};
      setVoteCounts(data);
    });

    return () => unsubscribe();
  }, []);

  // 投票処理（FirebaseのTransactionを使って安全に加算）
  const handleVote = (matchId, choice) => {
    const previousChoice = userVotes[matchId];
    if (previousChoice === choice) return;

    const matchVoteRef = ref(db, `match_votes/${matchId}`);

    runTransaction(matchVoteRef, (currentData) => {
      if (!currentData) {
        currentData = { home: 0, draw: 0, away: 0 };
      }
      // 前回の投票を取り消し
      if (previousChoice && currentData[previousChoice] > 0) {
        currentData[previousChoice] -= 1;
      }
      // 新しい投票を加算
      currentData[choice] = (currentData[choice] || 0) + 1;
      return currentData;
    });

    // ローカルの自分の選択状況を更新
    const newUserVotes = { ...userVotes, [matchId]: choice };
    setUserVotes(newUserVotes);
    localStorage.setItem('userMatchVotes', JSON.stringify(newUserVotes));
  };

  // 50:50白熱判定ロジック
  const getClosenessBadge = (votes) => {
    const total = votes.home + votes.draw + votes.away;
    if (total < 2) return null; // 投票数が少なすぎる場合は出さない

    const homeRate = (votes.home / total) * 100;
    const awayRate = (votes.away / total) * 100;

    const diff = Math.abs(homeRate - awayRate);
    if (diff <= 15 && homeRate >= 30 && awayRate >= 30) {
      return { text: "🔥 50:50 拮抗バトル（注目！）", color: "#ff4d4d" };
    }
    return null;
  };

  return (
    <div style={{ marginTop: '40px', padding: '20px', background: '#1a1a1a', borderRadius: '12px', color: '#fff' }}>
      <h2 style={{ borderBottom: '2px solid #444', paddingBottom: '10px' }}>
        ⚽ 今週の全試合予想 & リアルタイム注目カード
      </h2>
      <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
        勝敗を予想しよう！全ユーザーのリアルタイム予想が集計され、50:50で白熱しているカードに注目マークが付きます。
      </p>

      <div style={{ display: 'grid', gap: '16px', marginTop: '20px' }}>
        {upcomingData.map(m => {
          const votes = voteCounts[m.id] || { home: 0, draw: 0, away: 0 };
          const totalVotes = votes.home + votes.draw + votes.away;

          const homePct = totalVotes ? Math.round((votes.home / totalVotes) * 100) : 0;
          const drawPct = totalVotes ? Math.round((votes.draw / totalVotes) * 100) : 0;
          const awayPct = totalVotes ? Math.round((votes.away / totalVotes) * 100) : 0;

          const badge = getClosenessBadge(votes);
          const userChoice = userVotes[m.id];

          return (
            <div 
              key={m.id} 
              style={{
                background: '#2a2a2a',
                border: badge ? `2px solid ${badge.color}` : '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                position: 'relative'
              }}
            >
              {badge && (
                <span style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '16px',
                  background: badge.color,
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  padding: '2px 10px',
                  borderRadius: '12px'
                }}>
                  {badge.text}
                </span>
              )}

              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>
                {m.league} | {new Date(m.datetime).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold' }}>
                <span style={{ flex: 1, textAlign: 'right' }}>{m.home_team}</span>
                <span style={{ margin: '0 15px', color: '#ffbd59', fontSize: '0.9rem' }}>VS</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{m.away_team}</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button
                  onClick={() => handleVote(m.id, 'home')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: userChoice === 'home' ? '#4caf50' : '#3a3a3a',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: userChoice === 'home' ? 'bold' : 'normal'
                  }}
                >
                  {m.home_team} ({homePct}%)
                </button>

                <button
                  onClick={() => handleVote(m.id, 'draw')}
                  style={{
                    width: '100px',
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: userChoice === 'draw' ? '#ff9800' : '#3a3a3a',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: userChoice === 'draw' ? 'bold' : 'normal'
                  }}
                >
                  引分 ({drawPct}%)
                </button>

                <button
                  onClick={() => handleVote(m.id, 'away')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: userChoice === 'away' ? '#2196f3' : '#3a3a3a',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: userChoice === 'away' ? 'bold' : 'normal'
                  }}
                >
                  {m.away_team} ({awayPct}%)
                </button>
              </div>

              {/* 予想割合バー */}
              <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginTop: '10px', background: '#444' }}>
                <div style={{ width: `${homePct}%`, background: '#4caf50', transition: 'width 0.3s' }} />
                <div style={{ width: `${drawPct}%`, background: '#ff9800', transition: 'width 0.3s' }} />
                <div style={{ width: `${awayPct}%`, background: '#2196f3', transition: 'width 0.3s' }} />
              </div>

              <div style={{ fontSize: '0.75rem', color: '#777', textAlign: 'right', marginTop: '4px' }}>
                総投票数: {totalVotes}票
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}