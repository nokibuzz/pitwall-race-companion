const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function carOnLap(race, number, lap) {
  return race.snapshots[lap - 1]?.cars.find((car) => car.number === number);
}

function cleanPace(race, number, laps) {
  return median(laps.map((lap) => carOnLap(race, number, lap)).filter((car) => car && !car.pit && !car.outlap && car.lapTime >= 55 && car.lapTime <= 180).map((car) => car.lapTime));
}

export function availablePitChoices(race) {
  const choices = [];
  if (!race?.drivers || !race?.pits || !race?.snapshots) return choices;
  for (const driver of race.drivers) {
    for (const pit of race.pits.filter((entry) => entry.driver === driver.number)) {
      if (pit.lap < 8 || pit.lap > race.totalLaps - 8) continue;
      const before = cleanPace(race, driver.number, [pit.lap - 4, pit.lap - 3, pit.lap - 2, pit.lap - 1]);
      const after = cleanPace(race, driver.number, [pit.lap + 2, pit.lap + 3, pit.lap + 4, pit.lap + 5]);
      if (!Number.isFinite(before) || !Number.isFinite(after) || Math.abs(before - after) > 2.5) continue;
      const horizon = Math.min(race.totalLaps, pit.lap + 8);
      const car = carOnLap(race, driver.number, horizon);
      if (!car || !Number.isFinite(car.elapsed)) continue;
      const field = race.snapshots[horizon - 1].cars.filter((item) => Number.isFinite(item.elapsed));
      const computedPosition = 1 + field.filter((item) => item.elapsed < car.elapsed).length;
      if (computedPosition !== car.position) continue;
      choices.push({ driverNumber: driver.number, driverName: driver.name, driverCode: driver.code, stopLap: pit.lap, stop: pit.stop, pitDuration: pit.duration, horizon, before, after });
    }
  }
  return choices.sort((a, b) => a.stopLap - b.stopLap || a.driverName.localeCompare(b.driverName));
}

export function analyzePitAlternative(race, choice, shift) {
  if (!Number.isInteger(shift) || shift < -5 || shift > 5) throw new Error('Choose a change of at most five laps.');
  const canonical = availablePitChoices(race).find((entry) => entry.driverNumber === choice?.driverNumber && entry.stopLap === choice?.stopLap);
  if (!canonical) throw new Error('This recorded pit stop does not have enough clean timing data for analysis.');
  const newStopLap = canonical.stopLap + shift;
  if (newStopLap < 3 || newStopLap > race.totalLaps - 3) throw new Error('The alternative stop falls outside the usable race window.');
  const otherStops = race.pits.filter((pit) => pit.driver === canonical.driverNumber && pit.lap !== canonical.stopLap);
  if (otherStops.some((pit) => Math.abs(pit.lap - newStopLap) < 3 || (pit.lap > Math.min(newStopLap, canonical.stopLap) && pit.lap < Math.max(newStopLap, canonical.stopLap)))) throw new Error('The alternative overlaps another recorded stop.');
  const horizon = canonical.horizon;
  const snapshot = race.snapshots[horizon - 1];
  const actual = snapshot?.cars.find((car) => car.number === canonical.driverNumber);
  if (!actual || !Number.isFinite(actual.elapsed)) throw new Error('No recorded timing at the comparison lap.');
  const paceDifference = canonical.before - canonical.after;
  const delta = +(shift * paceDifference).toFixed(3);
  const changedElapsed = actual.elapsed + delta;
  const otherCars = snapshot.cars.filter((car) => car.number !== canonical.driverNumber && Number.isFinite(car.elapsed));
  const modeledPosition = 1 + otherCars.filter((car) => car.elapsed < changedElapsed).length;
  const baselinePosition = 1 + otherCars.filter((car) => car.elapsed < actual.elapsed).length;
  if (baselinePosition !== actual.position) throw new Error('The recorded timing cannot be reconciled with lap position.');
  const driver = race.drivers.find((entry) => entry.number === canonical.driverNumber);
  const nearest = [...otherCars].sort((a, b) => Math.abs(a.elapsed - changedElapsed) - Math.abs(b.elapsed - changedElapsed))[0];
  const nearestDriver = race.drivers.find((entry) => entry.number === nearest?.number);
  const sensitivity = Math.abs(shift) * 0.25;
  const positionFor = (time) => 1 + otherCars.filter((car) => car.elapsed < time).length;
  return {
    driverName: canonical.driverName,
    driverCode: canonical.driverCode,
    actualFinish: driver.finish,
    actualStatus: driver.status,
    actualStopLap: canonical.stopLap,
    alternativeStopLap: newStopLap,
    shift,
    comparisonLap: horizon,
    actualPosition: actual.position,
    modeledPosition,
    timeDelta: delta,
    paceBefore: canonical.before,
    paceAfter: canonical.after,
    pitDuration: canonical.pitDuration,
    nearestRival: nearestDriver?.name || null,
    modeledPositionRange: [positionFor(changedElapsed - sensitivity), positionFor(changedElapsed + sensitivity)].sort((a, b) => a - b),
    timeDeltaRange: [+(delta - sensitivity).toFixed(3), +(delta + sensitivity).toFixed(3)]
  };
}
