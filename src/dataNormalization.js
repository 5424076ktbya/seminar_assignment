const JLEAGUE_TEAM_NAMES = {
  '札幌': '北海道コンサドーレ札幌',
  '仙台': 'ベガルタ仙台',
  '山形': 'モンテディオ山形',
  '鹿島': '鹿島アントラーズ',
  '水戸': '水戸ホーリーホック',
  '浦和': '浦和レッズ',
  '大宮': '大宮アルディージャ',
  '柏': '柏レイソル',
  '千葉': 'ジェフユナイテッド千葉',
  'FC東京': 'ＦＣ東京',
  'ＦＣ東京': 'ＦＣ東京',
  '東京Ｖ': '東京ヴェルディ',
  '町田': 'ＦＣ町田ゼルビア',
  '川崎Ｆ': '川崎フロンターレ',
  '横浜FM': '横浜Ｆ・マリノス',
  '横浜ＦＭ': '横浜Ｆ・マリノス',
  '横浜FC': '横浜ＦＣ',
  '横浜ＦＣ': '横浜ＦＣ',
  '湘南': '湘南ベルマーレ',
  '甲府': 'ヴァンフォーレ甲府',
  '松本': '松本山雅ＦＣ',
  '新潟': 'アルビレックス新潟',
  '清水': '清水エスパルス',
  '磐田': 'ジュビロ磐田',
  '名古屋': '名古屋グランパス',
  '京都': '京都サンガF.C.',
  'Ｇ大阪': 'ガンバ大阪',
  'G大阪': 'ガンバ大阪',
  'Ｃ大阪': 'セレッソ大阪',
  'C大阪': 'セレッソ大阪',
  '神戸': 'ヴィッセル神戸',
  '岡山': 'ファジアーノ岡山',
  '広島': 'サンフレッチェ広島',
  '徳島': '徳島ヴォルティス',
  '福岡': 'アビスパ福岡',
  '鳥栖': 'サガン鳥栖',
  '長崎': 'Ｖ・ファーレン長崎',
  '大分': '大分トリニータ'
};

export function canonicalTeamName(name) {
  if (!name) return name;
  const cleaned = String(name).trim();
  return JLEAGUE_TEAM_NAMES[cleaned] || cleaned;
}

export function normalizeMatch(match) {
  if (!match) return match;
  const originalTeamA = match.teamA || match.home_team;
  const originalTeamB = match.teamB || match.away_team;
  const teamA = canonicalTeamName(originalTeamA);
  const teamB = canonicalTeamName(originalTeamB);
  const originalStats = match.stats || {};
  const stats = {
    [teamA]: originalStats[originalTeamA] || originalStats[teamA] || null,
    [teamB]: originalStats[originalTeamB] || originalStats[teamB] || null
  };
  return {
    ...match,
    league: match.league || 'Europe (league metadata unavailable)',
    teamA,
    teamB,
    home_team: canonicalTeamName(match.home_team || originalTeamA),
    away_team: canonicalTeamName(match.away_team || originalTeamB),
    winner: canonicalTeamName(match.winner),
    first_goal_team: canonicalTeamName(match.first_goal_team),
    stats
  };
}

export function canonicalizeRequestedMatch(match) {
  return {
    ...match,
    home_team: canonicalTeamName(match?.home_team),
    away_team: canonicalTeamName(match?.away_team)
  };
}
