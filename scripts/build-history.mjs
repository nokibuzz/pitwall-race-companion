import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.jolpi.ca/ergast/f1';
const racesToImport = [[2025, 24], [2025, 16], [2024, 16]];
const agent = 'PitwallRaceCompanion/0.2 (+https://github.com/nokibuzz/pitwall-race-companion; non-commercial historical snapshot builder)';
const cacheDir = path.join(root, '.cache', 'jolpica');
const forceFresh = process.argv.includes('--fresh');
let lastRequest = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url) {
  const cacheFile = path.join(cacheDir, `${createHash('sha256').update(url).digest('hex')}.json`);
  try {
    const age = Date.now() - (await stat(cacheFile)).mtimeMs;
    const ttl = url.includes('/current/') ? 6 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    if (!forceFresh && age < ttl) return JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch {}
  const wait = Math.max(0, 900 - (Date.now() - lastRequest));
  if (wait) await pause(wait);
  lastRequest = Date.now();
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': agent, Accept: 'application/json' } });
    if (response.ok) {
      const body = await response.json();
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(body));
      return body;
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 5) throw new Error(`${url}: HTTP ${response.status}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await pause(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000 * (attempt + 1));
    lastRequest = Date.now();
  }
}

function seconds(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function fetchRaceEndpoint(season, round, endpoint) {
  const url = `${API}/${season}/${round}/${endpoint}.json?limit=100`;
  const payload = await request(url);
  const race = payload?.MRData?.RaceTable?.Races?.[0];
  if (!race) throw new Error(`Missing ${endpoint} for ${season} round ${round}`);
  return { url, payload, race };
}

async function fetchLaps(season, round) {
  const first = await fetchRaceEndpoint(season, round, 'laps');
  const total = Number(first.payload.MRData.total);
  if (!Number.isInteger(total) || total < 200) throw new Error(`Too few lap records for ${season}/${round}`);
  const byLap = new Map();
  const merge = (payload) => {
    for (const lap of payload.MRData.RaceTable.Races?.[0]?.Laps || []) {
      const number = Number(lap.number);
      if (!byLap.has(number)) byLap.set(number, new Map());
      for (const timing of lap.Timings || []) byLap.get(number).set(timing.driverId, timing);
    }
  };
  merge(first.payload);
  for (let offset = 100; offset < total; offset += 100) {
    const payload = await request(`${API}/${season}/${round}/laps.json?limit=100&offset=${offset}`);
    merge(payload);
  }
  const count = [...byLap.values()].reduce((sum, entries) => sum + entries.size, 0);
  if (count !== total) throw new Error(`Expected ${total} timings, reconstructed ${count} for ${season}/${round}`);
  return { byLap, total, sourceUrl: first.url };
}

function normalizeRace(season, round, resultsRace, pitsRace, lapData) {
  const rawResults = resultsRace.Results || [];
  const rawPits = pitsRace.PitStops || [];
  if (rawResults.length < 15 || rawPits.length < 1) throw new Error(`Incomplete results or pit stops for ${season}/${round}`);
  const drivers = rawResults.map((item, index) => ({
    id: item.Driver.driverId,
    number: Number(item.number),
    code: String(item.Driver.code || item.Driver.familyName.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
    name: `${item.Driver.givenName} ${item.Driver.familyName}`,
    team: item.Constructor.name,
    color: ['#f0444d', '#e2e8e9', '#c995ff', '#79d3db', '#ffaf6b', '#a9c4f4'][index % 6],
    grid: Number(item.grid),
    finish: Number(item.position),
    status: item.status,
    lapsCompleted: Number(item.laps),
    timeMillis: item.Time?.millis ? Number(item.Time.millis) : null
  }));
  const idToNumber = new Map(drivers.map((driver) => [driver.id, driver.number]));
  const pitById = new Map();
  const pits = rawPits.map((pit) => {
    const duration = seconds(pit.duration);
    const normalized = { driver: idToNumber.get(pit.driverId), lap: Number(pit.lap), stop: Number(pit.stop), duration };
    if (!pitById.has(pit.driverId)) pitById.set(pit.driverId, new Set());
    pitById.get(pit.driverId).add(normalized.lap);
    return normalized;
  }).filter((pit) => Number.isInteger(pit.driver) && Number.isInteger(pit.lap));
  const elapsed = new Map(drivers.map((driver) => [driver.id, 0]));
  const recent = new Map(drivers.map((driver) => [driver.id, []]));
  const snapshots = [];
  for (const [lapNumber, timings] of [...lapData.byLap].sort((a, b) => a[0] - b[0])) {
    const cars = [];
    for (const [id, timing] of timings) {
      const driver = drivers.find((entry) => entry.id === id);
      const time = seconds(timing.time);
      const position = Number(timing.position);
      if (!driver || !Number.isFinite(time) || !Number.isInteger(position)) continue;
      const total = (elapsed.get(id) || 0) + time;
      elapsed.set(id, total);
      const isPit = pitById.get(id)?.has(lapNumber) || false;
      const isOutLap = pitById.get(id)?.has(lapNumber - 1) || false;
      const lastClean = recent.get(id);
      if (!isPit && !isOutLap && time >= 55 && time <= 180) {
        lastClean.push(time);
        if (lastClean.length > 5) lastClean.shift();
      }
      const lastStop = pits.filter((pit) => pit.driver === driver.number && pit.lap <= lapNumber).at(-1);
      cars.push({ number: driver.number, position, lapTime: +time.toFixed(3), elapsed: +total.toFixed(3), pace: +(median(lastClean) ?? time).toFixed(3), pit: isPit, outlap: isOutLap, lapsSincePit: lastStop ? lapNumber - lastStop.lap : null });
    }
    const leader = cars.find((car) => car.position === 1);
    if (leader) for (const car of cars) car.gap = +(car.elapsed - leader.elapsed).toFixed(3);
    snapshots.push({ lap: lapNumber, cars: cars.sort((a, b) => a.position - b.position) });
  }
  const totalLaps = snapshots.at(-1)?.lap;
  const leadLapFinishers = drivers.filter((driver) => driver.lapsCompleted === totalLaps && Number.isFinite(driver.timeMillis));
  if (leadLapFinishers.length < 5 || snapshots.length !== totalLaps) throw new Error(`Incomplete lap or result coverage for ${season}/${round}`);
  const finishMismatch = leadLapFinishers.map((driver) => ({ code: driver.code, difference: Math.round((elapsed.get(driver.id) || 0) * 1000 - driver.timeMillis) }));
  // Classified result times can include a post-race time penalty that is absent from lap timings.
  if (finishMismatch.some((entry) => entry.difference > 1000 || entry.difference < -20000 || (Math.abs(entry.difference) > 1000 && ![5000, 10000, 15000, 20000].some((penalty) => Math.abs(entry.difference + penalty) <= 1000)))) {
    throw new Error(`Cumulative lap times disagree with classified results for ${season}/${round}: ${JSON.stringify(finishMismatch)}`);
  }
  for (const entry of finishMismatch) {
    const driver = drivers.find((item) => item.code === entry.code);
    driver.classificationAdjustmentMillis = entry.difference < -1000 ? -entry.difference : 0;
  }
  const pitLossSamples = pits.map((pit) => {
    const current = snapshots[pit.lap - 1]?.cars.find((car) => car.number === pit.driver);
    const outlap = snapshots[pit.lap]?.cars.find((car) => car.number === pit.driver);
    const before = [pit.lap - 3, pit.lap - 2, pit.lap - 1].map((lap) => snapshots[lap - 1]?.cars.find((car) => car.number === pit.driver)).filter((car) => car && !car.pit && !car.outlap).map((car) => car.lapTime);
    const baseline = median(before);
    return current && outlap && baseline ? current.lapTime + outlap.lapTime - 2 * baseline : null;
  }).filter((value) => Number.isFinite(value) && value >= 8 && value <= 60);
  const pitLoss = +(median(pitLossSamples) ?? 22).toFixed(1);
  return {
    id: `${season}-${round}`, season, round,
    title: resultsRace.raceName, circuit: resultsRace.Circuit.circuitName,
    locality: resultsRace.Circuit.Location.locality,
    date: `${resultsRace.date}T${resultsRace.time}`,
    totalLaps, pitLoss, pitLossSamples: pitLossSamples.length,
    drivers, pits, snapshots
  };
}

const races = [];
const endpoints = [];
for (const [season, round] of racesToImport) {
  const results = await fetchRaceEndpoint(season, round, 'results');
  const pitstops = await fetchRaceEndpoint(season, round, 'pitstops');
  const laps = await fetchLaps(season, round);
  races.push(normalizeRace(season, round, results.race, pitstops.race, laps));
  endpoints.push(results.url, pitstops.url, laps.sourceUrl);
  console.log(`Imported ${season} round ${round}: ${races.at(-1).title}, ${laps.total} lap records`);
}
const output = {
  source: 'Jolpica F1 API',
  license: 'CC BY-NC-SA 4.0, non-commercial use',
  fetchedAt: new Date().toISOString(),
  endpoints,
  note: 'Recorded positions, lap times, pit stops and results; derived cumulative elapsed, recent clean pace and pit-loss estimate. No tyre compound or race-control status.',
  races
};
await writeFile(path.join(root, 'src', 'history.json'), JSON.stringify(output));
console.log(`Wrote ${races.length} real historical races`);
