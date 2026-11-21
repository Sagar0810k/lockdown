import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lockdown, nativeAvailable } from './native';

const KEY = 'lockdown:timetable';

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const emptyTimetable = () => ({
  entries: [],
  blocked: [],
  strict: false,
  silence: true,
  masterEnabled: true,
});

export async function loadTimetable() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...emptyTimetable(),
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      blocked: Array.isArray(parsed.blocked) ? parsed.blocked : [],
    };
  } catch {
    return emptyTimetable();
  }
}

export async function saveTimetable(tt) {
  await AsyncStorage.setItem(KEY, JSON.stringify(tt));
  syncTimetableNative(tt);
}

/** Pushes the schedule to the native alarm scheduler (no-op without the native module). */
export function syncTimetableNative(tt) {
  if (!nativeAvailable || typeof Lockdown.setTimetable !== 'function') return;
  try {
    Lockdown.setTimetable(JSON.stringify(tt));
  } catch {
    // Native side unavailable — the UI still works, alarms just won't fire.
  }
}

export function makeEntry({ label, days, startH, startM, endH, endM, enabled = true, id }) {
  return {
    id: id || `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: label || 'Study block',
    days: [...new Set(days)].sort((a, b) => a - b),
    startH,
    startM,
    endH,
    endM,
    enabled,
  };
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function fmtTime(h, m) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad2(m)} ${ampm}`;
}

export function fmtRange(entry) {
  return `${fmtTime(entry.startH, entry.startM)} – ${fmtTime(entry.endH, entry.endM)}`;
}

export function describeDays(days) {
  if (!days || days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return [...days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(' · ');
}

/** Next start time for a block, strictly after `from`. Days match Date.getDay() (0 = Sunday). */
export function nextOccurrence(entry, from = new Date()) {
  if (!entry.days || entry.days.length === 0) return null;
  for (let i = 0; i < 8; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    if (!entry.days.includes(d.getDay())) continue;
    d.setHours(entry.startH, entry.startM, 0, 0);
    if (d.getTime() > from.getTime()) return d;
  }
  return null;
}

/** The soonest upcoming block across the whole timetable, or null. */
export function upcomingSession(tt, from = new Date()) {
  if (!tt?.masterEnabled) return null;
  let best = null;
  for (const entry of tt.entries) {
    if (!entry.enabled) continue;
    const time = nextOccurrence(entry, from);
    if (time && (!best || time.getTime() < best.time.getTime())) best = { time, entry };
  }
  return best;
}

export function fmtDayTime(d) {
  return `${DAY_LABELS[d.getDay()]} · ${fmtTime(d.getHours(), d.getMinutes())}`;
}
