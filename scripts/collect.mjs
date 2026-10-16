#!/usr/bin/env node
// Collects Wednesday 6:00–9:00 efforts on the segment and merges them into data/stages/<date>.json
//
// Usage:
//   STRAVA_COOKIE="..." node scripts/collect.mjs              # auto: last Wednesday
//   STRAVA_COOKIE="..." node scripts/collect.mjs --date 2026-10-14
//   STRAVA_FIXTURE_DIR=test/fixtures node scripts/collect.mjs --date 2026-10-14 --today 2026-10-14
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';
import { localDate, lastChallengeDay, mondayOf, weekdayOf, inWindow, parseLeaderboardJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGES_DIR = path.join(ROOT, 'data', 'stages');
const EXCLUDED_FILE = path.join(ROOT, 'data', 'excluded.json');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(dateRange, page) {
  const fixtureDir = process.env.STRAVA_FIXTURE_DIR;
  if (fixtureDir) {
    const f = path.join(fixtureDir, `${dateRange}-page${page}.json`);
    if (!fs.existsSync(f)) return { leaderboard: [], totalCount: 0 };
    return parseLeaderboardJson(fs.readFileSync(f, 'utf8'));
  }

  const cookie = process.env.STRAVA_COOKIE;
  if (!cookie) throw new Error('STRAVA_COOKIE is not set');

  const url = `https://www.strava.com/frontend/segments/${CONFIG.segment.id}/leaderboard` +
    `?filter_type=all&date_range=${dateRange}&gender=overall&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
      Referer: `https://www.strava.com/segments/${CONFIG.segment.id}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    redirect: 'manual',
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400) || text.trimStart().startsWith('<')) {
    throw new Error(`Strava session rejected (HTTP ${res.status}). Refresh the STRAVA_COOKIE secret.`);
  }
  if (!res.ok) throw new Error(`Strava HTTP ${res.status}: ${text.slice(0, 200)}`);
  return parseLeaderboardJson(text);
}

async function fetchAll(dateRange) {
  const rows = [];
  let total = Infinity;
  for (let page = 1; page <= CONFIG.maxPages && rows.length < total; page++) {
    const j = await fetchPage(dateRange, page);
    const lb = j.leaderboard || [];
    total = Number(j.totalCount ?? lb.length);
    if (!lb.length) break;
    rows.push(...lb);
    console.log(`  page ${page}: ${lb.length} rows (${rows.length}/${total})`);
    if (!process.env.STRAVA_FIXTURE_DIR) await sleep(CONFIG.delayMs);
  }
  return rows;
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const today = arg('today') || localDate();
  const stageDate = arg('date') || lastChallengeDay(today);

  if (weekdayOf(stageDate) !== CONFIG.weekday) throw new Error(`${stageDate} is not a challenge day`);
  if (stageDate > today) throw new Error(`${stageDate} is in the future`);

  // "today" works only on the day itself; afterwards "this_week" still contains it
  // (each rider's best of the week) until Sunday night.
  let dateRange;
  if (stageDate === today) dateRange = 'today';
  else if (mondayOf(stageDate) === mondayOf(today)) dateRange = 'this_week';
  else throw new Error(`${stageDate} is no longer reachable on Strava's date filters (only today / this week)`);

  console.log(`Stage ${stageDate} · today ${today} · date_range=${dateRange}`);
  const rows = await fetchAll(dateRange);

  const excluded = new Set(loadJson(EXCLUDED_FILE, []).map(String));
  const fresh = rows
    .filter((r) => !r.isPrivateEffort)
    .filter((r) => !excluded.has(String(r.athleteId)))
    .filter((r) => inWindow(r.startDateLocal, stageDate))
    .map((r) => ({
      athleteId: String(r.athleteId),
      name: String(r.displayName || '').trim(),
      elapsedTime: Number(r.elapsedTime),
      start: r.startDateLocal.slice(11, 19),
      activityId: String(r.activityId),
      effortId: String(r.effortId),
    }));

  // Merge with what is already stored: new riders are added, faster times replace slower ones.
  fs.mkdirSync(STAGES_DIR, { recursive: true });
  const file = path.join(STAGES_DIR, `${stageDate}.json`);
  const stage = loadJson(file, { date: stageDate, results: [] });
  const byId = new Map(stage.results.map((r) => [r.athleteId, r]));
  let added = 0, improved = 0;
  for (const r of fresh) {
    const old = byId.get(r.athleteId);
    if (!old) { byId.set(r.athleteId, r); added++; }
    else if (r.elapsedTime < old.elapsedTime) { byId.set(r.athleteId, r); improved++; }
    else if (old.name !== r.name) old.name = r.name;
  }
  for (const id of excluded) byId.delete(id);

  stage.results = [...byId.values()].sort((a, b) => a.elapsedTime - b.elapsedTime);
  stage.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(stage, null, 2) + '\n');

  console.log(`Fetched ${rows.length}, in window ${fresh.length}, added ${added}, improved ${improved}, total ${stage.results.length}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
