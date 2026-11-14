import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const history = JSON.parse(await readFile(new URL('../src/history.json', import.meta.url), 'utf8'));

test('shipped history contains recorded drivers, results, laps and stops', () => {
  assert.equal(history.source, 'Jolpica F1 API');
  assert.equal(history.races.length, 3);
  for (const race of history.races) {
    assert.ok(race.drivers.length >= 20);
    assert.equal(race.snapshots.length, race.totalLaps);
    assert.ok(race.pits.length > 0);
    assert.equal(race.drivers[0].finish, 1);
    assert.ok(race.drivers[0].name.includes(' '));
    assert.ok(race.pitLossSamples > 0);
    const lap = race.snapshots[Math.min(39, race.totalLaps - 1)];
    const order = [...lap.cars].sort((a, b) => a.elapsed - b.elapsed);
    assert.deepEqual(order.map((car) => car.position), order.map((_, index) => index + 1));
    for (const driver of race.drivers.filter((entry) => entry.lapsCompleted === race.totalLaps && Number.isFinite(entry.timeMillis))) {
      const last = race.snapshots.at(-1).cars.find((car) => car.number === driver.number);
      assert.ok(last, `${driver.name} missing last lap`);
      assert.ok(Math.abs(last.elapsed * 1000 + driver.classificationAdjustmentMillis - driver.timeMillis) <= 1000, `${driver.name} elapsed time mismatch`);
    }
  }
});

test('recorded examples include actual known finishing order', () => {
  const abuDhabi = history.races.find((race) => race.id === '2025-24');
  assert.equal(abuDhabi.title, 'Abu Dhabi Grand Prix');
  assert.deepEqual(abuDhabi.drivers.slice(0, 3).map((driver) => driver.name), ['Max Verstappen', 'Oscar Piastri', 'Lando Norris']);
  const monza = history.races.find((race) => race.id === '2024-16');
  assert.deepEqual(monza.drivers.slice(0, 3).map((driver) => driver.name), ['Charles Leclerc', 'Oscar Piastri', 'Lando Norris']);
});
