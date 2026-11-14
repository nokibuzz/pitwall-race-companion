import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALENDAR_URL, normalizeCalendar } from '../src/calendar.mjs';
import { STANDINGS_URL, LAST_RESULTS_URL, rankPodiumForm } from '../src/form.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agent = 'PitwallRaceCompanion/0.2 (+https://github.com/nokibuzz/pitwall-race-companion; non-commercial schedule snapshot builder)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': agent, Accept: 'application/json' }, signal: controller.signal });
      if (response.ok) return response.json();
      if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`${url}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * (attempt + 1));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`${url}: unavailable after retries`);
}

const calendarPayload = await get(CALENDAR_URL);
await sleep(500);
const standingsPayload = await get(STANDINGS_URL);
await sleep(500);
const resultsPayload = await get(LAST_RESULTS_URL);
const calendar = normalizeCalendar(calendarPayload);
let form;
try {
  form = rankPodiumForm(standingsPayload, resultsPayload);
} catch {
  form = { season: calendar.season, throughRound: null, latestRace: null, latestRaceDate: null, picks: [], method: 'No matching completed-round standings and results are available yet.' };
}
const fetchedAt = new Date().toISOString();
await writeFile(path.join(root, 'src', 'calendar.json'), JSON.stringify({ ...calendar, source: 'Jolpica F1 API', fetchedAt, endpoint: CALENDAR_URL }));
await writeFile(path.join(root, 'src', 'form.json'), JSON.stringify({ ...form, source: 'Jolpica F1 API', fetchedAt, endpoints: [STANDINGS_URL, LAST_RESULTS_URL] }));
console.log(`Wrote ${calendar.season} calendar (${calendar.races.length} races) and form through round ${form.throughRound ?? 'pending'}`);
