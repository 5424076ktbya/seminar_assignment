export function getMatchStartTime(datetime) {
  if (!datetime) return null;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(datetime)) {
    const time = new Date(`${datetime.replace(' ', 'T')}:00+09:00`).getTime();
    return Number.isNaN(time) ? null : time;
  }

  const match = datetime.match(/(\d{4})年\s*(\d{2})\/(\d{2})（.+?）\s*(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    const time = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`).getTime();
    return Number.isNaN(time) ? null : time;
  }

  return null;
}

export function isMatchLocked(match, now = Date.now()) {
  if (match?.result) return true;
  const startTime = getMatchStartTime(match?.datetime);
  return startTime !== null && now >= startTime;
}
