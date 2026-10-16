import { CONFIG } from './config.mjs';

// Current date in LA as YYYY-MM-DD
export function localDate(d = new Date(), tz = CONFIG.timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Day of week (0=Sun) for a YYYY-MM-DD string
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// Most recent challenge day (Wednesday) on or before dateStr
export function lastChallengeDay(dateStr, weekday = CONFIG.weekday) {
  const diff = (weekdayOf(dateStr) - weekday + 7) % 7;
  return addDays(dateStr, -diff);
}

// Monday of the week containing dateStr (Strava "This Week" starts Monday)
export function mondayOf(dateStr) {
  const diff = (weekdayOf(dateStr) + 6) % 7;
  return addDays(dateStr, -diff);
}

// Strava's startDateLocal looks like "2026-10-14T06:33:59Z" but the "Z" is fake:
// it is wall-clock local time. Treat it as plain text.
export function splitLocal(startDateLocal) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(startDateLocal || '');
  return m ? { date: m[1], time: m[2] } : null;
}

export function inWindow(startDateLocal, stageDate, cfg = CONFIG) {
  const p = splitLocal(startDateLocal);
  if (!p || p.date !== stageDate) return false;
  return p.time >= cfg.windowStart && p.time <= cfg.windowEnd;
}

// Large integer IDs lose precision in JSON.parse – keep them as strings
export function parseLeaderboardJson(text) {
  const safe = text.replace(/"(effortId|athleteId|activityId)"\s*:\s*(\d+)/g, '"$1":"$2"');
  return JSON.parse(safe);
}

export function formatTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
