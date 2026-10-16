// End-to-end test on fake data in a temporary copy of the project: node test/run.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inWindow, lastChallengeDay, mondayOf, parseLeaderboardJson } from '../scripts/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- unit checks
assert.equal(lastChallengeDay('2026-10-16'), '2026-10-14');
assert.equal(lastChallengeDay('2026-10-14'), '2026-10-14');
assert.equal(lastChallengeDay('2026-10-13'), '2026-10-07');
assert.equal(mondayOf('2026-10-14'), '2026-10-12');
assert.equal(inWindow('2026-10-14T06:00:00Z', '2026-10-14'), true);
assert.equal(inWindow('2026-10-14T09:00:00Z', '2026-10-14'), true);
assert.equal(inWindow('2026-10-14T09:00:01Z', '2026-10-14'), false);
assert.equal(inWindow('2026-10-14T05:59:59Z', '2026-10-14'), false);
assert.equal(inWindow('2026-10-15T07:00:00Z', '2026-10-14'), false);
assert.equal(parseLeaderboardJson('{"effortId":3545495128686826519}').effortId, '3545495128686826519');

// --- end to end in a temp copy
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponies-'));
for (const d of ['scripts', 'test']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
fs.mkdirSync(path.join(tmp, 'data', 'stages'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'data', 'excluded.json'), '["84400437"]');

const run = (file, args, env = {}) => execFileSync('node', [path.join(tmp, file), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
const fx = path.join(tmp, 'fx');
run('test/make-fixtures.mjs', [path.join(fx, 'w1'), 'today', '2026-10-07', '3']);
run('test/make-fixtures.mjs', [path.join(fx, 'w2'), 'today', '2026-10-14', '7']);
run('scripts/collect.mjs', ['--today', '2026-10-07'], { STRAVA_FIXTURE_DIR: path.join(fx, 'w1') });
run('scripts/collect.mjs', ['--today', '2026-10-14'], { STRAVA_FIXTURE_DIR: path.join(fx, 'w2') });
run('scripts/collect.mjs', ['--today', '2026-10-14'], { STRAVA_FIXTURE_DIR: path.join(fx, 'w2') }); // re-run is idempotent
run('scripts/build.mjs', []);

const stage = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'stages', '2026-10-14.json'), 'utf8'));
// 12 rows - 05:xx - 09:xx - private - excluded = 8
assert.equal(stage.results.length, 8);
assert.ok(stage.results.every((r) => r.start >= '06:00:00' && r.start <= '09:00:00'));
assert.ok(!stage.results.some((r) => r.athleteId === '84400437'), 'excluded rider removed');
assert.ok(stage.results.every((r) => /^\d{15,}$/.test(r.effortId)), 'effort ids keep full precision');

const data = JSON.parse(fs.readFileSync(path.join(tmp, 'docs', 'data.json'), 'utf8'));
assert.equal(data.stages[0].date, '2026-10-14');
assert.equal(data.stages[0].number, 2);
assert.equal(data.stages[0].results[0].pos, 1);
assert.equal(data.stages[0].results[0].gap, 0);
const gt = data.grandTours[0];
assert.equal(gt.month, '2026-10');
for (const s of gt.standings) {
  const h = data.riders[s.athleteId].history;
  assert.equal(h.length, 2, 'only riders with every stage qualify');
  assert.equal(s.total, h[0].time + h[1].time);
}
for (let i = 1; i < gt.standings.length; i++) assert.ok(gt.standings[i].total >= gt.standings[i - 1].total);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('All tests passed');
