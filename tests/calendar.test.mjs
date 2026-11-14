import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeCalendar, upcomingRaces } from '../src/calendar.mjs';

const bundled = JSON.parse(await readFile(new URL('../src/calendar.json', import.meta.url), 'utf8'));

const payload = { MRData: { RaceTable: { season: '2026', Races: [
  { round: '1', raceName: 'First Grand Prix', date: '2026-03-01', time: '14:00:00Z', Circuit: { Location: { locality: 'City A' } }, Qualifying: { date: '2026-02-28', time: '14:00:00Z' } },
  { round: '2', raceName: 'Second Grand Prix', date: '2026-03-08', time: '14:00:00Z' }
] } } };

test('calendar parsing keeps dates and sessions in order', () => {
  const calendar = normalizeCalendar(payload);
  assert.equal(calendar.season, 2026);
  assert.equal(calendar.races[0].sessions[0].label, 'Qualifying');
  assert.equal(calendar.races[0].sessions[1].label, 'Race');
  assert.equal(calendar.races[0].locality, 'City A');
  assert.equal(upcomingRaces(calendar, Date.parse('2026-03-02T00:00:00Z'))[0].round, 2);
});

test('invalid provider payloads fail without inventing a calendar', () => {
  assert.throws(() => normalizeCalendar({}), /Invalid calendar/);
  assert.throws(() => normalizeCalendar({ MRData: { RaceTable: { season: '2026', Races: [] } } }), /no valid races/);
});

test('bundled published calendar contains real scheduled rounds and source time', () => {
  assert.equal(bundled.source, 'Jolpica F1 API');
  assert.ok(Number.isFinite(Date.parse(bundled.fetchedAt)));
  assert.ok(bundled.races.length >= 20);
  assert.equal(new Set(bundled.races.map((race) => race.round)).size, bundled.races.length);
  assert.ok(bundled.races.every((race) => Number.isFinite(Date.parse(race.startsAt)) && race.name));
});
