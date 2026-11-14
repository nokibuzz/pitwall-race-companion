const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function validateScenario(input) {
  const required = ['gap', 'driverPace', 'targetPace', 'pitLoss', 'freshGain', 'stayLaps', 'horizon'];
  for (const key of required) if (!finite(input[key])) return `${key} is missing or invalid.`;
  if (input.driverPace <= 0 || input.targetPace <= 0) return 'Lap pace must be positive.';
  if (input.pitLoss < 0 || input.pitLoss > 60) return 'Pit loss must be between 0 and 60 seconds.';
  if (input.freshGain < -3 || input.freshGain > 5) return 'Fresh tyre gain must be between -3 and 5 seconds per lap.';
  if (!Number.isInteger(input.stayLaps) || input.stayLaps < 1 || input.stayLaps >= input.horizon) return 'Stay-out laps must be less than the comparison horizon.';
  if (!Number.isInteger(input.horizon) || input.horizon < 3 || input.horizon > 30) return 'The horizon must be 3–30 laps.';
  return null;
}

function runPath(input, pitAt) {
  let gap = input.gap;
  let rejoinGap = null;
  const timeline = [{ lap: 0, gap }];
  const oldDeg = input.oldDeg ?? 0.055;
  const newDeg = input.newDeg ?? 0.035;
  const targetDeg = input.targetDeg ?? 0.04;
  const outLapPenalty = input.outLapPenalty ?? 1.0;
  for (let lap = 1; lap <= input.horizon; lap++) {
    const pitted = lap >= pitAt;
    const driverLap = pitted
      ? input.driverPace - input.freshGain + newDeg * (lap - pitAt) + (lap === pitAt ? outLapPenalty : 0)
      : input.driverPace + oldDeg * lap;
    const targetLap = input.targetPace + targetDeg * lap;
    gap += driverLap - targetLap + (lap === pitAt ? input.pitLoss : 0);
    timeline.push({ lap, gap: +gap.toFixed(3) });
    if (lap === pitAt) rejoinGap = gap;
  }
  return { pitAt, rejoinGap: +rejoinGap.toFixed(3), finishGap: +gap.toFixed(3), timeline };
}

function sensitivity(input, pitAt) {
  const values = [];
  for (const pitShift of [-2.5, 2.5]) {
    for (const gainShift of [-0.25, 0.25]) {
      values.push(runPath({ ...input, pitLoss: Math.max(0, input.pitLoss + pitShift), freshGain: input.freshGain + gainShift }, pitAt).finishGap);
    }
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function compareStrategies(input) {
  const error = validateScenario(input);
  if (error) return { error };
  const now = runPath(input, 1);
  const later = runPath(input, input.stayLaps + 1);
  now.sensitivity = sensitivity(input, 1);
  later.sensitivity = sensitivity(input, input.stayLaps + 1);
  return {
    now,
    later,
    advantage: +(later.finishGap - now.finishGap).toFixed(3),
    assumptions: [
      'Green-flag running and a dry track throughout the comparison.',
      'The selected rival does not pit in the comparison window.',
      'Recent clean-lap pace continues, with simple assumed tyre degradation.',
      'No traffic, overtaking delay, fuel effect, safety car, or tyre inventory constraint.'
    ]
  };
}

export function gapLabel(seconds, code = 'the rival') {
  if (!finite(seconds)) return 'Unavailable';
  if (Math.abs(seconds) < 0.05) return `Level with ${code}`;
  return `${Math.abs(seconds).toFixed(1)}s ${seconds > 0 ? 'behind' : 'ahead of'} ${code}`;
}

export function scenarioNarrative(result, input) {
  if (result.error) return result.error;
  const preferred = result.advantage > 0.2 ? 'Pitting now' : result.advantage < -0.2 ? `Staying out ${input.stayLaps} laps` : 'Both choices';
  const margin = Math.abs(result.advantage).toFixed(1);
  const comparison = Math.abs(result.advantage) <= 0.2
    ? 'finish almost level in this model.'
    : `has a ${margin}s modelled advantage after ${input.horizon} laps.`;
  return `${preferred} ${comparison} An immediate stop puts the car ${gapLabel(result.now.rejoinGap, input.targetCode)} after the pit lap. Staying out puts it ${gapLabel(result.later.rejoinGap, input.targetCode)} after its later stop. These are conditional estimates, not a prediction of race position.`;
}
