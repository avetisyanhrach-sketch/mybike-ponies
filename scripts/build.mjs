#!/usr/bin/env node
// Builds docs/data.json (served by GitHub Pages) from data/stages/*.json
// - Stage results with positions and gaps
// - Monthly Grand Tour: sum of times, only riders who completed every stage of the month (Nichols Ride rules)
// - Rider profiles: history, best/avg position, rides, podiums, wins, best time
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGES_DIR = path.join(ROOT, 'data', 'stages');
const EXCLUDED_FILE = path.join(ROOT, 'data', 'excluded.json');
const OUT = path.join(ROOT, 'docs', 'data.json');

// Positions with ties: equal values share a position (1, 2, 2, 4)
function rank(list, key) {
  let prev = null, pos = 0;
  return list.map((item, i) => {
    if (item[key] !== prev) { pos = i + 1; prev = item[key]; }
    return { ...item, pos };
  });
}

const excluded = new Set((() => {
  try { return JSON.parse(fs.readFileSync(EXCLUDED_FILE, 'utf8')).map(String); } catch { return []; }
})());

const files = fs.existsSync(STAGES_DIR)
  ? fs.readdirSync(STAGES_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  : [];

const latestName = new Map();
const stages = files.map((f, idx) => {
  const raw = JSON.parse(fs.readFileSync(path.join(STAGES_DIR, f), 'utf8'));
  const sorted = raw.results
    .filter((r) => !excluded.has(String(r.athleteId)))
    .sort((a, b) => a.elapsedTime - b.elapsedTime);
  const leader = sorted[0]?.elapsedTime ?? 0;
  for (const r of sorted) latestName.set(r.athleteId, r.name);
  return {
    date: raw.date,
    number: idx + 1,
    results: rank(sorted, 'elapsedTime').map((r) => ({
      pos: r.pos,
      athleteId: r.athleteId,
      time: r.elapsedTime,
      gap: r.elapsedTime - leader,
      start: r.start,
      activityId: r.activityId,
    })),
  };
});

// Grand Tour per month
const months = new Map();
for (const s of stages) {
  const m = s.date.slice(0, 7);
  if (!months.has(m)) months.set(m, []);
  months.get(m).push(s);
}
const grandTours = [...months.entries()].map(([month, ms]) => {
  const totals = new Map();
  for (const s of ms) for (const r of s.results) {
    const t = totals.get(r.athleteId) || { athleteId: r.athleteId, total: 0, count: 0 };
    t.total += r.time; t.count += 1;
    totals.set(r.athleteId, t);
  }
  const qualified = [...totals.values()].filter((t) => t.count === ms.length).sort((a, b) => a.total - b.total);
  const leader = qualified[0]?.total ?? 0;
  return {
    month,
    stageDates: ms.map((s) => s.date),
    standings: rank(qualified, 'total').map((t) => ({ pos: t.pos, athleteId: t.athleteId, total: t.total, gap: t.total - leader })),
  };
});

// Rider profiles
const riders = {};
for (const s of stages) for (const r of s.results) {
  const p = riders[r.athleteId] ||= { name: latestName.get(r.athleteId), history: [] };
  p.history.push({ date: s.date, number: s.number, pos: r.pos, time: r.time, activityId: r.activityId, field: s.results.length });
}
for (const gt of grandTours) for (const g of gt.standings) {
  const p = riders[g.athleteId];
  (p.grandTours ||= []).push({ month: gt.month, pos: g.pos, total: g.total });
}
for (const p of Object.values(riders)) {
  const pos = p.history.map((h) => h.pos);
  p.rides = pos.length;
  p.bestPos = Math.min(...pos);
  p.avgPos = Math.round((pos.reduce((a, b) => a + b, 0) / pos.length) * 10) / 10;
  p.wins = pos.filter((x) => x === 1).length;
  p.podiums = pos.filter((x) => x <= 3).length;
  p.bestTime = Math.min(...p.history.map((h) => h.time));
  p.history.reverse(); // newest first
}

const out = {
  title: CONFIG.title,
  segment: CONFIG.segment,
  window: { start: CONFIG.windowStart.slice(0, 5), end: CONFIG.windowEnd.slice(0, 5), timezone: CONFIG.timezone },
  generatedAt: new Date().toISOString(),
  stages: stages.reverse(), // newest first
  grandTours: grandTours.reverse(),
  riders,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Built ${OUT}: ${stages.length} stages, ${grandTours.length} grand tours, ${Object.keys(riders).length} riders`);
