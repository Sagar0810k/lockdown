import AsyncStorage from '@react-native-async-storage/async-storage';

const STATS_KEY = 'lockdown:stats';
const BLOCKED_KEY = 'lockdown:blocked';

const emptyStats = () => ({ sessions: [], byPkg: {} });

export async function loadStats() {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    return raw ? { ...emptyStats(), ...JSON.parse(raw) } : emptyStats();
  } catch {
    return emptyStats();
  }
}

export async function consumeNativeReport(reportJson, attemptsByPkg) {
  if (!reportJson) return;
  const report = JSON.parse(reportJson);
  const stats = await loadStats();
  stats.sessions.push({
    ts: report.startedWall,
    minutes: report.minutes,
    attempts: report.attempts,
    reason: report.reason, // completed | quit | emergency | restart
  });
  if (stats.sessions.length > 500) stats.sessions = stats.sessions.slice(-500);
  if (attemptsByPkg) {
    for (const [pkg, count] of Object.entries(attemptsByPkg)) {
      stats.byPkg[pkg] = (stats.byPkg[pkg] || 0) + count;
    }
  }
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export async function resetStats() {
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(emptyStats()));
}

export async function loadBlocked() {
  try {
    const raw = await AsyncStorage.getItem(BLOCKED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // stored as [{pkg, name}]; tolerate legacy string arrays
    return parsed.map((x) => (typeof x === 'string' ? { pkg: x, name: x } : x));
  } catch {
    return [];
  }
}

export async function saveBlocked(entries) {
  await AsyncStorage.setItem(BLOCKED_KEY, JSON.stringify(entries));
}

export function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function summarize(stats) {
  const now = new Date();
  const todayKey = dayKey(now.getTime());
  const weekAgo = now.getTime() - 6 * 86400000;

  let todayMinutes = 0;
  let weekMinutes = 0;
  let todayAttempts = 0;
  const days = new Set();

  for (const s of stats.sessions) {
    if (s.reason === 'restart') continue;
    const key = dayKey(s.ts);
    days.add(key);
    if (key === todayKey) {
      todayMinutes += s.minutes;
      todayAttempts += s.attempts;
    }
    if (s.ts >= weekAgo) weekMinutes += s.minutes;
  }

  // streak: consecutive days with >= 1 session, counting back from today (or yesterday if today is still fresh)
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const totalAttempts = stats.sessions.reduce((a, s) => a + (s.attempts || 0), 0);
  return { todayMinutes, weekMinutes, todayAttempts, streak, totalAttempts, sessionCount: stats.sessions.length };
}

export function last14Days(stats) {
  const byDay = {};
  for (const s of stats.sessions) {
    if (s.reason === 'restart') continue;
    const key = dayKey(s.ts);
    byDay[key] = (byDay[key] || 0) + s.minutes;
  }
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const key = dayKey(d.getTime());
    out.push({ key, label: 'SMTWTFS'[d.getDay()], minutes: byDay[key] || 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
