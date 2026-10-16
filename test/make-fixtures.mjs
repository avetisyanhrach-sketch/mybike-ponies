// Generates fake leaderboard pages in the same shape as Strava's /frontend/segments/:id/leaderboard
import fs from 'node:fs';
import path from 'node:path';

const [,, outDir, dateRange, date, seed = '1'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

const names = ['Jackson Brody', 'Rodrigo Martinez🇸🇻', 'Juan Cortes', 'ofer lion', 'Angelica Arellano', 'Alessandro .',
  'Nico M8', '<script>alert(1)</script>', 'Robert Nam', 'Maria K', 'Hrach A', 'Dylan Leong'];
let s = Number(seed);
const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;

const rows = names.map((n, i) => {
  // a few deliberately outside the window or on another day
  let hh = 6 + Math.floor(rnd() * 3), d = date;
  if (i === 3) hh = 5;            // 05:xx -> excluded
  if (i === 4) hh = 9;            // 09:xx -> excluded (after 09:00:00)
  if (i === 8 && dateRange === 'this_week') d = date.replace(/\d\d$/, (x) => String(Number(x) + 1).padStart(2, '0')); // Thursday
  const mm = String(Math.floor(rnd() * 59)).padStart(2, '0');
  return {
    rank: 0,
    displayName: n,
    athleteId: 84400432 + i,
    athleteIdStr: String(84400432 + i),
    startDateLocal: `${d}T${String(hh).padStart(2, '0')}:${mm}:10Z`,
    effortId: `__35454951286868265${10 + i}`, // written as a raw 20-digit number
    activityId: 20584539727 + i,
    activityIdStr: String(20584539727 + i),
    isPrivateEffort: i === 10,
    elapsedTime: 780 + Math.floor(rnd() * 600),
  };
}).sort((a, b) => a.elapsedTime - b.elapsedTime).map((r, i) => ({ ...r, rank: i + 1 }));

const per = 5;
for (let p = 0; p * per < rows.length; p++) {
  const body = { leaderboard: rows.slice(p * per, (p + 1) * per), totalCount: rows.length };
  // write big integers raw, like Strava does
  const text = JSON.stringify(body).replace(/"__(\d+)"/g, '$1');
  fs.writeFileSync(path.join(outDir, `${dateRange}-page${p + 1}.json`), text);
}
console.log(`wrote ${rows.length} rows to ${outDir}`);
