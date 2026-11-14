import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { analyzePitAlternative, availablePitChoices } from '../src/review.mjs';

const history = JSON.parse(await readFile(new URL('../src/history.json', import.meta.url), 'utf8'));
const abuDhabi = history.races.find((race) => race.id === '2025-24');

test('counterfactual preserves recorded position and labels modeled lap position', () => {
  const choice = availablePitChoices(abuDhabi).find((entry) => entry.driverCode === 'HAM' && entry.stopLap === 8);
  assert.ok(choice);
  const result = analyzePitAlternative(abuDhabi, choice, -2);
  assert.equal(result.driverName, 'Lewis Hamilton');
  assert.equal(result.actualStopLap, 8);
  assert.equal(result.alternativeStopLap, 6);
  assert.equal(result.actualPosition, 13);
  assert.equal(result.modeledPosition, 12);
  assert.equal(result.actualFinish, 8);
  assert.ok(result.timeDelta < 0);
  assert.ok(result.comparisonLap < abuDhabi.totalLaps);
  const baseline = analyzePitAlternative(abuDhabi, choice, 0);
  const later = analyzePitAlternative(abuDhabi, choice, 2);
  assert.equal(result.comparisonLap, later.comparisonLap);
  assert.equal(result.actualPosition, later.actualPosition);
  assert.equal(baseline.modeledPosition, baseline.actualPosition);
});

test('the model rejects missing or anomalous local pace', () => {
  const choices = availablePitChoices(abuDhabi);
  assert.ok(choices.length > 0);
  assert.ok(choices.every((entry) => entry.stopLap >= 8 && entry.stopLap <= abuDhabi.totalLaps - 8));
  assert.throws(() => analyzePitAlternative(abuDhabi, choices[0], 6), /at most five laps/);
  assert.throws(() => analyzePitAlternative(abuDhabi, { driverNumber: 999, stopLap: 10 }, -2), /enough clean timing/);
});
