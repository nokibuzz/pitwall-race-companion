import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { rankPodiumForm } from '../src/form.mjs';

const bundled = JSON.parse(await readFile(new URL('../src/form.json', import.meta.url), 'utf8'));
const driver = (id, name, code) => ({ driverId: id, givenName: name, familyName: 'Driver', code });
const standings = { MRData: { StandingsTable: { StandingsLists: [{ season: '2026', round: '20', DriverStandings: [
  { Driver: driver('alpha', 'Alpha', 'ALP'), points: '100' },
  { Driver: driver('beta', 'Beta', 'BET'), points: '80' },
  { Driver: driver('gamma', 'Gamma', 'GAM'), points: '60' }
] }] } } };
const results = { MRData: { RaceTable: { Races: [{ season: '2026', round: '20', raceName: 'Recorded Grand Prix', date: '2026-11-08', Results: [
  { Driver: driver('beta', 'Beta', 'BET'), position: '1' },
  { Driver: driver('alpha', 'Alpha', 'ALP'), position: '2' },
  { Driver: driver('gamma', 'Gamma', 'GAM'), position: '3' }
] }] } } };

test('form watch ranks real-record-shaped data without future information', () => {
  const forecast = rankPodiumForm(standings, results);
  assert.equal(forecast.season, 2026);
  assert.equal(forecast.throughRound, 20);
  assert.equal(forecast.picks.length, 3);
  assert.equal(forecast.picks[0].name, 'Alpha Driver');
  assert.ok(forecast.method.includes('no upcoming qualifying'));
});

test('mismatched standings and results are refused', () => {
  const wrong = structuredClone(results);
  wrong.MRData.RaceTable.Races[0].round = '21';
  assert.throws(() => rankPodiumForm(standings, wrong), /do not match/);
});

test('bundled form watch uses real driver identities', () => {
  assert.equal(bundled.source, 'Jolpica F1 API');
  assert.ok([0, 3].includes(bundled.picks.length));
  assert.ok(bundled.picks.every((entry) => entry.name.includes(' ') && /^[A-Z0-9]{3,4}$/.test(entry.code)));
  assert.ok(bundled.picks.every((entry) => Number.isFinite(entry.points)));
});
