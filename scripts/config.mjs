// MYBIKE CREW – Ponies Wednesday Challenge: settings
export const CONFIG = {
  title: 'MYBIKE CREW – Ponies Wednesday Challenge',
  segment: {
    id: 966059,
    name: 'Griffith Park Hill Climb',
    distanceKm: 5.21,
    avgGrade: 5.2,
  },
  timezone: 'America/Los_Angeles',
  weekday: 3, // 0 = Sunday ... 3 = Wednesday
  // Effort must START inside this window (local LA time, inclusive)
  windowStart: '06:00:00',
  windowEnd: '09:00:00',
  // Polite crawling
  delayMs: 1500,
  maxPages: 40,
};
