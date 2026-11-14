import assert from 'node:assert/strict';
import test from 'node:test';
import { compareStrategies, gapLabel } from '../src/strategy.mjs';

const base = { gap: 3, driverPace: 82, targetPace: 82.2, pitLoss: 20, freshGain: 1, stayLaps: 4, horizon: 12 };

test('both strategies use the same horizon and pit on the specified lap', () => {
  const result = compareStrategies(base);
  assert.equal(result.now.pitAt, 1);
  assert.equal(result.later.pitAt, 5);
  assert.equal(result.now.timeline.length, 13);
  assert.equal(result.later.timeline.length, 13);
  assert.equal(result.now.rejoinGap, result.now.timeline[1].gap);
  assert.equal(result.later.rejoinGap, result.later.timeline[5].gap);
});

test('a higher pit loss worsens both rejoin gaps by the same amount', () => {
  const a = compareStrategies(base);
  const b = compareStrategies({ ...base, pitLoss: 24 });
  assert.ok(Math.abs(b.now.rejoinGap - a.now.rejoinGap - 4) < 0.001);
  assert.ok(Math.abs(b.later.rejoinGap - a.later.rejoinGap - 4) < 0.001);
});

test('missing gaps and invalid horizon do not produce invented estimates', () => {
  assert.match(compareStrategies({ ...base, gap: null }).error, /gap/);
  assert.match(compareStrategies({ ...base, stayLaps: 12 }).error, /Stay-out/);
});

test('gap signs are explained consistently', () => {
  assert.equal(gapLabel(-2.4, 'VER'), '2.4s ahead of VER');
  assert.equal(gapLabel(2.4, 'VER'), '2.4s behind VER');
});
