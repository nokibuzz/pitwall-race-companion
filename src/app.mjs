import { compareStrategies, gapLabel, scenarioNarrative } from './strategy.mjs';
import { formatLocalDate, upcomingRaces } from './calendar.mjs';
import { analyzePitAlternative, availablePitChoices } from './review.mjs';

const $ = (id) => document.getElementById(id);
const number = (id) => $(id).value.trim() === '' ? NaN : Number($(id).value);
const cleanCode = (text) => (text || 'RIVAL').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'RIVAL';
const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const lapTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}` : '—';
const readSetting = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const saveSetting = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const state = { mode: 'replay', data: null, history: null, form: null, snapshot: null, selected: null, rival: null, result: null, input: null, calendar: null, favorite: readSetting('pitwall-favorite', ''), spoilersHidden: readSetting('pitwall-spoilers-hidden', 'true') !== 'false' };
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
$('spoiler-toggle').checked = state.spoilersHidden;

function renderPodium() {
  const list = $('podium-list');
  list.replaceChildren();
  if (!Array.isArray(state.form?.picks) || !state.form.picks.length) {
    const item = document.createElement('li');
    item.textContent = state.form ? 'Waiting for a completed round in this season.' : 'Current driver form unavailable.';
    list.append(item);
    $('podium-explainer').textContent = state.form?.method || 'Current standings unavailable.';
    return;
  }
  try {
    state.form.picks.forEach((pick, index) => {
      const item = document.createElement('li');
      const rank = document.createElement('span');
      const name = document.createElement('strong');
      const score = document.createElement('small');
      rank.className = 'podium-rank';
      name.className = 'podium-name';
      score.className = 'podium-score';
      rank.textContent = `P${index + 1}`;
      name.textContent = pick.name;
      score.textContent = `${pick.points} pts · last P${pick.lastFinish ?? '—'}`;
      item.append(rank, name, score);
      list.append(item);
    });
    $('podium-explainer').textContent = `Jolpica results through ${state.form.season} round ${state.form.throughRound}. Form score: 70% season points, 30% last race result. No upcoming qualifying or calibrated odds.`;
  } catch {
    const item = document.createElement('li');
    item.textContent = 'Form ranking unavailable.';
    list.append(item);
  }
}

function renderCalendar(calendar) {
  state.calendar = calendar;
  const upcoming = upcomingRaces(calendar);
  const next = upcoming[0];
  $('prediction-race').textContent = next ? next.name : 'the next published Grand Prix';
  $('calendar-status').textContent = 'JOLPICA · SNAPSHOT';
  $('calendar-freshness').textContent = `Snapshot updated ${formatLocalDate(calendar.fetchedAt)} · times shown locally.`;
  $('next-race-link').href = `https://www.formula1.com/en/racing/${calendar.season}`;
  $('race-session-list').replaceChildren();
  if (next) {
    $('next-race-round').textContent = `R${String(next.round).padStart(2, '0')}`;
    $('next-race-title').textContent = next.name;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
    $('next-race-meta').textContent = `${formatLocalDate(next.startsAt)} · ${zone.replaceAll('_', ' ')}`;
    for (const session of next.sessions.slice(-3)) {
      const row = document.createElement('div');
      const label = document.createElement('span');
      const time = document.createElement('strong');
      label.textContent = session.label;
      time.textContent = formatLocalDate(session.startsAt, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      row.append(label, time);
      $('race-session-list').append(row);
    }
  } else {
    $('next-race-round').textContent = '—';
    $('next-race-title').textContent = `${calendar.season} season complete`;
    $('next-race-meta').textContent = 'The next season appears here when its calendar is available.';
  }
  const list = $('calendar-list');
  list.replaceChildren();
  for (const race of calendar.races) {
    const row = document.createElement('div');
    row.className = `calendar-row${race.id === next?.id ? ' is-next' : Date.parse(race.startsAt) <= Date.now() ? ' is-past' : ''}`;
    const round = document.createElement('span');
    const info = document.createElement('div');
    const name = document.createElement('strong');
    const date = document.createElement('small');
    round.className = 'round';
    round.textContent = String(race.round).padStart(2, '0');
    name.textContent = race.name;
    date.textContent = `${formatLocalDate(race.startsAt)}${race.locality ? ` · ${race.locality}` : ''}`;
    info.append(name, date);
    row.append(round, info);
    list.append(row);
  }
  renderPodium();
}

async function loadCalendar() {
  try {
    const response = await fetch('./calendar.json');
    if (!response.ok) throw new Error(`Calendar HTTP ${response.status}`);
    const calendar = await response.json();
    if (!calendar?.season || !Array.isArray(calendar.races) || !calendar.races.length || !Number.isFinite(Date.parse(calendar.fetchedAt))) throw new Error('Invalid calendar snapshot.');
    renderCalendar(calendar);
  } catch {
    $('calendar-status').textContent = 'CALENDAR UNAVAILABLE';
    $('next-race-title').textContent = 'Calendar unavailable';
    $('next-race-meta').textContent = 'Check the official calendar for the latest session times.';
    $('calendar-list').textContent = 'The calendar could not load. Historical race data remains available.';
    $('calendar-freshness').textContent = 'No schedule snapshot is available.';
  }
}

async function loadForm() {
  try {
    const bundled = await fetch('./form.json');
    if (!bundled.ok) throw new Error('Form snapshot unavailable.');
    state.form = await bundled.json();
    if (!Array.isArray(state.form?.picks) || ![0, 3].includes(state.form.picks.length)) throw new Error('Invalid form snapshot.');
    renderPodium();
  } catch {
    $('podium-explainer').textContent = 'Form snapshot unavailable. Check the source later.';
  }
}

function renderFinishers() {
  const container = $('history-finishers');
  const grid = document.createElement('div');
  grid.className = 'finishers-grid';
  for (const driver of state.data.drivers) {
    const row = document.createElement('div');
    const place = document.createElement('span');
    const identity = document.createElement('span');
    const name = document.createElement('strong');
    const team = document.createElement('small');
    const gridPosition = document.createElement('span');
    row.className = 'finisher';
    place.className = 'place';
    identity.className = 'identity';
    gridPosition.className = 'grid';
    place.textContent = `P${driver.finish}`;
    name.textContent = driver.name;
    team.textContent = `${driver.team} · ${driver.status}${driver.classificationAdjustmentMillis ? ` · classified time +${driver.classificationAdjustmentMillis / 1000}s` : ''}`;
    gridPosition.textContent = Number.isInteger(driver.grid) && driver.grid > 0 ? `Grid ${driver.grid}` : 'Pit lane';
    identity.append(name, team);
    row.append(place, identity, gridPosition);
    grid.append(row);
  }
  container.replaceChildren(grid);
}

function renderHistoryAnalysis() {
  const shift = number('history-shift');
  $('history-shift-output').textContent = shift === 0 ? 'recorded stop' : `${Math.abs(shift)} ${Math.abs(shift) === 1 ? 'lap' : 'laps'} ${shift < 0 ? 'earlier' : 'later'}`;
  const choice = state.choices?.[Number($('history-stop').value)];
  if (!choice || !state.data) return;
  try {
    const result = analyzePitAlternative(state.data, choice, shift);
    $('observed-position').textContent = `P${result.actualPosition}`;
    $('observed-context').textContent = `${result.driverName} at lap ${result.comparisonLap}; recorded stop on lap ${result.actualStopLap}. Actual finish: P${result.actualFinish} (${result.actualStatus}).`;
    $('modeled-position').textContent = `P${result.modeledPosition}`;
    $('modeled-context').textContent = `${result.driverCode} stops on lap ${result.alternativeStopLap} in this model. Estimated ${Math.abs(result.timeDelta).toFixed(1)}s ${result.timeDelta < 0 ? 'gained' : result.timeDelta > 0 ? 'lost' : 'change'} by lap ${result.comparisonLap}.`;
    const positionText = result.modeledPosition < result.actualPosition ? `could be ${result.actualPosition - result.modeledPosition} place${result.actualPosition - result.modeledPosition === 1 ? '' : 's'} higher` : result.modeledPosition > result.actualPosition ? `could be ${result.modeledPosition - result.actualPosition} place${result.modeledPosition - result.actualPosition === 1 ? '' : 's'} lower` : 'stays in the same position';
    $('history-takeaway').textContent = shift === 0 ? `${result.driverCode} keeps the recorded stop on lap ${result.actualStopLap}; this is the model baseline at lap ${result.comparisonLap}.` : `${result.driverCode} ${positionText} at lap ${result.comparisonLap} if the stop moved ${Math.abs(shift)} lap${Math.abs(shift) === 1 ? '' : 's'} ${shift < 0 ? 'earlier' : 'later'}.`;
    $('history-limits').textContent = `Recorded clean-lap pace near the stop: ${lapTime(result.paceBefore)} before, ${lapTime(result.paceAfter)} after. The calculation moves the stop but holds pit loss and every other driver's recorded time fixed. A ±0.25s/lap pace change gives modelled P${result.modeledPositionRange[0]}–P${result.modeledPositionRange[1]}. Tyre compounds, traffic and race-control phases are unavailable, so this is not a revised official finish.`;
  } catch (error) {
    $('observed-position').textContent = '—';
    $('observed-context').textContent = `${choice.driverName} stopped on lap ${choice.stopLap}.`;
    $('modeled-position').textContent = '—';
    $('modeled-context').textContent = 'No supported comparison for this change.';
    $('history-takeaway').textContent = error.message;
    $('history-limits').textContent = 'Choose a smaller change or another recorded stop. The model avoids crossing a second stop or using missing lap data.';
  }
}

function renderHistoryRace(raceId) {
  const race = state.history?.races.find((entry) => entry.id === raceId);
  if (!race) return;
  state.data = race;
  if (state.favorite && !race.drivers.some((driver) => driver.code === state.favorite)) {
    state.favorite = '';
    saveSetting('pitwall-favorite', '');
  }
  $('replay-event-title').textContent = `${race.season} ${race.title}`;
  $('replay-event-meta').textContent = `${formatLocalDate(race.date)} local · ${race.circuit} · ${race.totalLaps} laps`;
  $('history-source').replaceChildren();
  const source = document.createElement('span');
  source.textContent = `${race.season} ${race.title} · started ${formatLocalDate(race.date)} in your time zone · ${race.circuit}. Recorded results, lap times and pit stops: `;
  const link = document.createElement('a');
  link.href = `https://api.jolpi.ca/ergast/f1/${race.season}/${race.round}/results.json`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Jolpica F1 API';
  const terms = document.createElement('span');
  terms.textContent = ' · CC BY-NC-SA 4.0. Positions in the model are conditional.';
  $('history-source').append(source, link, terms);
  renderFinishers();
  state.choices = availablePitChoices(race);
  const stopSelect = $('history-stop');
  stopSelect.replaceChildren();
  for (const [index, choice] of state.choices.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${choice.driverName} · lap ${choice.stopLap} · stop ${choice.stop}`;
    stopSelect.append(option);
  }
  const candidate = state.choices.map((choice, index) => {
    try { return { index, result: analyzePitAlternative(race, choice, -2) }; } catch { return null; }
  }).filter((entry) => entry && entry.result.modeledPosition < entry.result.actualPosition && Math.abs(entry.result.timeDelta) <= 5).sort((a, b) => (a.result.actualPosition - a.result.modeledPosition) - (b.result.actualPosition - b.result.modeledPosition) || a.result.actualPosition - b.result.actualPosition)[0];
  if (candidate) stopSelect.value = String(candidate.index);
  $('history-shift').value = '-2';
  $('pit-loss').value = fmt(race.pitLoss);
  $('lap').value = String(Math.min(40, race.totalLaps - number('horizon')));
  renderHistoryAnalysis();
  if (state.mode === 'replay') render();
}

async function loadHistory() {
  try {
    const response = await fetch('./history.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const history = await response.json();
    if (!Array.isArray(history.races) || !history.races.length) throw new Error('No recorded races.');
    state.history = history;
    const select = $('history-race');
    select.replaceChildren();
    for (const race of history.races) {
      const option = document.createElement('option');
      option.value = race.id;
      option.textContent = `${race.season} · ${race.title}`;
      select.append(option);
    }
    renderHistoryRace(history.races[0].id);
    setMode('replay');
  } catch (error) {
    $('history-takeaway').textContent = `Race history could not load: ${error.message}`;
    $('history-source').textContent = 'The manual strategy mode remains available.';
    setMode('manual');
  }
}

function currentDriverCode() {
  if (state.mode === 'manual') return $('manual-driver').value.trim() ? cleanCode($('manual-driver').value) : '';
  return state.data?.drivers.find((driver) => driver.number === number('driver'))?.code || '';
}

function renderCompanion() {
  $('favorite-display').textContent = state.favorite || 'No driver pinned';
  const code = currentDriverCode();
  $('pin-driver').disabled = !code;
  $('pin-driver').innerHTML = code && code === state.favorite ? 'Driver pinned <span aria-hidden="true">✓</span>' : `Pin ${code || 'selected driver'} <span aria-hidden="true">↗</span>`;
}

function availableCars() {
  if (!state.snapshot) return [];
  return state.snapshot.cars.filter((car) => Number.isFinite(car.gap) && Number.isFinite(car.pace) && car.position !== null).sort((a, b) => a.position - b.position);
}

function refreshReplayOptions() {
  const data = state.data;
  const lap = number('lap');
  state.snapshot = data.snapshots.find((s) => s.lap === lap) || null;
  const cars = availableCars();
  const favoriteNumber = data.drivers.find((driver) => driver.code === state.favorite)?.number;
  const previousDriver = $('driver').value || String(favoriteNumber || cars[0]?.number || '');
  const previousTarget = $('target').value || String(cars[1]?.number || '');
  for (const select of [$('driver'), $('target')]) {
    select.replaceChildren();
    for (const car of cars) {
      const driver = data.drivers.find((entry) => entry.number === car.number);
      if (!driver) continue;
      const option = document.createElement('option');
      option.value = String(car.number);
      option.textContent = `P${car.position} · ${driver.code} — ${driver.name}`;
      select.append(option);
    }
  }
  $('driver').value = cars.some((c) => String(c.number) === previousDriver) ? previousDriver : String(cars[0]?.number || '');
  $('target').value = cars.some((c) => String(c.number) === previousTarget && previousTarget !== $('driver').value) ? previousTarget : String(cars.find((c) => String(c.number) !== $('driver').value)?.number || '');
  $('lap-output').textContent = `${lap} / ${data.totalLaps}`;
  renderCompanion();
}

function setMode(mode) {
  state.mode = mode;
  const replay = mode === 'replay';
  $('replay-controls').hidden = !replay;
  $('manual-controls').hidden = replay;
  for (const [id, active] of [['replay-tab', replay], ['manual-tab', !replay]]) {
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-selected', String(active));
  }
  $('data-status').textContent = replay ? `${state.data?.season || 'HISTORY'} ${state.data?.title || 'REPLAY'} · LAP ${$('lap').value} / ${state.data?.totalLaps || '—'}` : 'MANUAL SNAPSHOT · NO AUTO FEED';
  $('conversation').innerHTML = '<div class="bubble answer">The scenario is ready. Ask about either pit decision, the rival, or the model assumptions.</div>';
  renderCompanion();
  render();
}

function updateRangeLimits() {
  if (state.data) {
    const maxLap = Math.max(5, state.data.totalLaps - number('horizon'));
    $('lap').max = String(maxLap);
    if (number('lap') > maxLap) $('lap').value = String(maxLap);
    refreshReplayOptions();
  }
  $('stay').max = String(Math.min(10, number('horizon') - 1));
  if (number('stay') >= number('horizon')) $('stay').value = String(number('horizon') - 1);
  $('stay-output').textContent = `${$('stay').value} ${$('stay').value === '1' ? 'lap' : 'laps'}`;
  $('later-laps').textContent = $('stay').value;
}

function buildInput() {
  const common = { pitLoss: number('pit-loss'), freshGain: number('fresh-gain'), stayLaps: number('stay'), horizon: number('horizon') };
  if (state.mode === 'manual') {
    const lap = number('manual-lap');
    const total = number('manual-total');
    if (!Number.isInteger(lap) || !Number.isInteger(total) || lap < 1 || total < 3 || lap + common.horizon > total) {
      return { error: 'Choose a valid current lap with enough race laps left for the comparison horizon.' };
    }
    const condition = $('manual-condition').value;
    return { ...common, gap: number('manual-gap'), driverPace: number('manual-driver-pace'), targetPace: number('manual-target-pace'), driverCode: cleanCode($('manual-driver').value), targetCode: cleanCode($('manual-target').value), lap, total, source: 'manual', condition, paused: condition !== 'green' };
  }
  if (!state.snapshot) return { error: 'Replay data is unavailable.' };
  const selected = state.snapshot.cars.find((c) => c.number === number('driver'));
  const rival = state.snapshot.cars.find((c) => c.number === number('target'));
  if (!selected || !rival || selected.number === rival.number || !Number.isFinite(selected.gap) || !Number.isFinite(rival.gap)) {
    return { error: 'Choose two different drivers with available timing data.' };
  }
  state.selected = selected;
  state.rival = rival;
  const driver = state.data.drivers.find((d) => d.number === selected.number);
  const target = state.data.drivers.find((d) => d.number === rival.number);
  return { ...common, gap: selected.gap - rival.gap, driverPace: selected.pace, targetPace: rival.pace, driverCode: driver.code, targetCode: target.code, lap: state.snapshot.lap, total: state.data.totalLaps, source: 'historical', condition: 'green' };
}

function renderChart(result, targetCode) {
  const all = [...result.now.timeline, ...result.later.timeline].map((p) => p.gap);
  const min = Math.min(0, ...all) - 3;
  const max = Math.max(0, ...all) + 3;
  const width = 720, height = 210, left = 25, right = 20, top = 14, bottom = 25;
  const x = (lap) => left + lap * (width - left - right) / result.now.timeline.at(-1).lap;
  const y = (gap) => top + (max - gap) * (height - top - bottom) / (max - min || 1);
  const path = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.lap).toFixed(1)},${y(p.gap).toFixed(1)}`).join(' ');
  const grid = [0, 1, 2, 3, 4].map((i) => {
    const value = min + (max - min) * i / 4;
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#3c4a53" stroke-dasharray="3 5"/><text x="0" y="${yy+3}" fill="#7f929c" font-size="10">${value.toFixed(0)}</text>`;
  }).join('');
  const ticks = [0, Math.round(result.now.timeline.at(-1).lap / 2), result.now.timeline.at(-1).lap].map((n) => `<text x="${x(n)}" y="${height-2}" fill="#7f929c" text-anchor="middle" font-size="10">+${n}</text>`).join('');
  const zero = y(0);
  $('chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><title>Projected gap to ${targetCode}</title>${grid}<line x1="${left}" y1="${zero}" x2="${width-right}" y2="${zero}" stroke="#71838d" stroke-width="1"/><path d="${path(result.now.timeline)}" fill="none" stroke="#f33e48" stroke-width="3" vector-effect="non-scaling-stroke"/><path d="${path(result.later.timeline)}" fill="none" stroke="#e2e8e9" stroke-width="3" vector-effect="non-scaling-stroke"/><circle cx="${x(result.now.timeline.at(-1).lap)}" cy="${y(result.now.finishGap)}" r="4" fill="#f33e48"/><circle cx="${x(result.later.timeline.at(-1).lap)}" cy="${y(result.later.finishGap)}" r="4" fill="#e2e8e9"/>${ticks}</svg>`;
  $('chart').setAttribute('aria-label', `Estimated gap to ${targetCode} over ${result.now.timeline.at(-1).lap} laps. Pit now ends ${gapLabel(result.now.finishGap, targetCode)}. Stay out ends ${gapLabel(result.later.finishGap, targetCode)}.`);
}

function renderEvidence(input) {
  if (input.source === 'manual') {
    $('evidence').innerHTML = `<div class="evidence-list"><div class="evidence-item"><span>RACE MOMENT</span><strong>LAP ${input.lap} / ${input.total}</strong><small>Entered by you</small></div><div class="evidence-item"><span>GAP TO RIVAL</span><strong>${fmt(input.gap)}s</strong><small>Positive means behind</small></div><div class="evidence-item"><span>YOUR PACE</span><strong>${lapTime(input.driverPace)}</strong><small>Seconds per lap</small></div><div class="evidence-item"><span>RIVAL PACE</span><strong>${lapTime(input.targetPace)}</strong><small>Seconds per lap</small></div></div>`;
    return;
  }
  const selected = state.selected;
  const nextPit = state.data.pits.filter((p) => p.driver === selected.number && p.lap > input.lap).sort((a, b) => a.lap - b.lap)[0];
  const actual = state.spoilersHidden ? 'Future decision hidden' : nextPit ? `Recorded next stop: lap ${nextPit.lap}` : 'No later recorded stop';
  const actualValue = state.spoilersHidden ? 'HIDDEN' : nextPit ? `LAP ${nextPit.lap}` : 'NO STOP';
  $('snapshot-strip').innerHTML = `<strong>P${selected.position} ${input.driverCode}</strong> · recorded lap ${input.lap}${selected.lapsSincePit === null ? '' : ` · ${selected.lapsSincePit} laps since pit`}<br>Relative to ${input.targetCode}: ${gapLabel(input.gap, input.targetCode)}`;
  const links = '<p class="evidence-links">Recorded lap positions and times: Jolpica F1 API. Tyre compounds and race-control phases are not included.</p>';
  $('evidence').innerHTML = `<div class="evidence-list"><div class="evidence-item"><span>REPLAY MOMENT</span><strong>LAP ${input.lap} / ${input.total}</strong><small>Recorded race</small></div><div class="evidence-item"><span>GAP TO ${input.targetCode}</span><strong>${fmt(input.gap)}s</strong><small>Derived from recorded elapsed laps</small></div><div class="evidence-item"><span>RECENT CLEAN PACE</span><strong>${lapTime(input.driverPace)}</strong><small>${input.driverCode} · median of recent laps</small></div><div class="evidence-item"><span>RECORDED CHOICE</span><strong>${actualValue}</strong><small>${actual}</small></div></div>${links}`;
}

function render() {
  updateRangeLimits();
  if (state.mode === 'replay' && state.data) refreshReplayOptions();
  const input = buildInput();
  state.input = input;
  $('data-status').textContent = state.mode === 'replay' ? `${state.data?.season || 'HISTORY'} ${state.data?.title || 'REPLAY'} · LAP ${$('lap').value} / ${state.data?.totalLaps || '—'}` : `MANUAL · ${$('manual-condition').selectedOptions[0].textContent.toUpperCase()} · NO AUTO FEED`;
  renderCompanion();
  const result = input.error ? { error: input.error } : input.paused ? { error: 'The green-flag model is paused for these track conditions. Re-enter a stable dry green-flag snapshot to compare strategies.', paused: true } : compareStrategies(input);
  state.result = result;
  $('error').hidden = !result.error;
  $('error').textContent = result.error || '';
  $('scenario-badge').innerHTML = `<span class="badge-dot"></span> ${result.paused ? 'MODEL PAUSED' : result.error ? 'INPUTS NEEDED' : 'CONDITIONAL ESTIMATE'}`;
  $('model-status').textContent = result.paused ? 'No estimate for these conditions' : result.error ? 'Complete the inputs to compare' : 'Assumes green-flag running';
  if (result.error) {
    $('takeaway').textContent = result.paused ? 'Track conditions changed. Pit-loss and tyre-pace assumptions need a new model for this phase.' : 'Choose valid inputs to compare both strategies.';
    $('advantage').textContent = '';
    for (const id of ['now-rejoin','now-finish','later-rejoin','later-finish']) $(id).textContent = '—';
    for (const id of ['now-band','later-band']) $(id).textContent = 'No estimate for the current inputs.';
    $('chart').innerHTML = '';
    $('chart').setAttribute('aria-label', 'No projected gap is available for the current inputs.');
    $('assumptions').replaceChildren();
    if (input.source) renderEvidence(input);
    else $('evidence').innerHTML = '';
    return;
  }
  $('takeaway').textContent = scenarioNarrative(result, input);
  $('advantage').textContent = Math.abs(result.advantage) < 0.2 ? 'NEARLY EVEN IN THIS MODEL' : `${result.advantage > 0 ? 'PIT NOW' : 'STAY OUT'} HAS ${fmt(Math.abs(result.advantage))}s MODELLED ADVANTAGE`;
  $('now-rejoin').textContent = gapLabel(result.now.rejoinGap, input.targetCode);
  $('now-finish').textContent = gapLabel(result.now.finishGap, input.targetCode);
  $('later-rejoin').textContent = gapLabel(result.later.rejoinGap, input.targetCode);
  $('later-finish').textContent = gapLabel(result.later.finishGap, input.targetCode);
  $('now-band').textContent = `Sensitivity range after ${input.horizon} laps: ${fmt(result.now.sensitivity.min)}s to ${fmt(result.now.sensitivity.max)}s relative to ${input.targetCode}.`;
  $('later-band').textContent = `Sensitivity range after ${input.horizon} laps: ${fmt(result.later.sensitivity.min)}s to ${fmt(result.later.sensitivity.max)}s relative to ${input.targetCode}.`;
  renderChart(result, input.targetCode);
  renderEvidence(input);
  $('assumptions').innerHTML = result.assumptions.map((a) => `<li>${a}</li>`).join('');
}

function answer(question) {
  const lower = question.toLowerCase();
  const input = state.input, result = state.result;
  if (!input || result?.error) return 'The scenario needs valid inputs first.';
  if (/actual|happen|really|record/.test(lower)) {
    if (input.source === 'manual') return 'This is a manual snapshot, so I have no recorded race outcome. Enter the next timing update to compare a new moment.';
    if (state.spoilersHidden) return 'Spoiler shield is on. Turn it off in Strategy Lab to reveal the recorded next stop.';
    const next = state.data.pits.filter((p) => p.driver === state.selected.number && p.lap > input.lap).sort((a, b) => a.lap - b.lap)[0];
    return next ? `In the recorded ${state.data.season} ${state.data.title}, ${input.driverCode} stopped next on lap ${next.lap}. The two cards model alternatives from lap ${input.lap}; they do not revise the recorded result.` : `No later recorded pit stop for ${input.driverCode} appears after lap ${input.lap}. The cards remain conditional alternatives.`;
  }
  if (/assum|certain|confidence|reliable|safety|rain|traffic/.test(lower)) return `This is a sensitivity exercise, not a probability forecast. It assumes green flags, dry conditions, stable relative pace and no rival stop. The displayed ranges vary pit loss by ±2.5s and fresh tyre gain by ±0.25s/lap. Traffic, rain and safety cars are outside the model.`;
  if (/target|rival|who/.test(lower)) return `The rival is ${input.targetCode}. At this snapshot ${input.driverCode} is ${gapLabel(input.gap, input.targetCode)}. The model keeps ${input.targetCode} on track at roughly ${lapTime(input.targetPace)} per lap while comparing your two stops.`;
  if (/stay|later|wait|extend|overcut/.test(lower)) return `Staying out ${input.stayLaps} laps avoids the pit loss until lap ${input.lap + input.stayLaps + 1}. The model then estimates ${gapLabel(result.later.rejoinGap, input.targetCode)} after the pit lap and ${gapLabel(result.later.finishGap, input.targetCode)} after ${input.horizon} laps. Its benefit depends on whether old-tyre pace holds up.`;
  if (/pit|now|undercut|stop/.test(lower)) return `Pitting on the next lap costs the assumed ${fmt(input.pitLoss)}s, then gains the assumed ${fmt(input.freshGain)}s/lap from fresh tyres before degradation. The estimated rejoin gap is ${gapLabel(result.now.rejoinGap, input.targetCode)}; after ${input.horizon} laps it is ${gapLabel(result.now.finishGap, input.targetCode)}.`;
  return scenarioNarrative(result, input);
}

function addBubble(text, type) {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  div.textContent = text;
  $('conversation').append(div);
  $('conversation').scrollTop = $('conversation').scrollHeight;
}

for (const id of ['lap','driver','target','stay','pit-loss','fresh-gain','horizon','manual-lap','manual-total','manual-driver','manual-target','manual-gap','manual-driver-pace','manual-target-pace','manual-condition']) {
  $(id).addEventListener(['driver', 'target', 'horizon', 'manual-condition'].includes(id) ? 'change' : 'input', render);
}
$('replay-tab').addEventListener('click', () => setMode('replay'));
$('manual-tab').addEventListener('click', () => setMode('manual'));
$('history-race').addEventListener('change', () => renderHistoryRace($('history-race').value));
$('history-stop').addEventListener('change', renderHistoryAnalysis);
$('history-shift').addEventListener('input', renderHistoryAnalysis);
for (const link of document.querySelectorAll('[data-open-strategy]')) link.addEventListener('click', () => { $('strategy-details').open = true; });
for (const link of document.querySelectorAll('a[href="#calendar-panel"]')) link.addEventListener('click', () => { $('calendar-panel').open = true; });
if (location.hash === '#strategy') $('strategy-details').open = true;
if (location.hash === '#calendar-panel') $('calendar-panel').open = true;
$('pin-driver').addEventListener('click', () => { state.favorite = currentDriverCode(); saveSetting('pitwall-favorite', state.favorite); renderCompanion(); });
$('spoiler-toggle').addEventListener('change', () => { state.spoilersHidden = $('spoiler-toggle').checked; saveSetting('pitwall-spoilers-hidden', String(state.spoilersHidden)); $('conversation').innerHTML = '<div class="bubble answer">Viewing mode changed. Ask about the current scenario.</div>'; render(); });
for (const chip of document.querySelectorAll('[data-question]')) chip.addEventListener('click', () => { const q = chip.dataset.question; addBubble(q, 'user'); addBubble(answer(q), 'answer'); });
$('ask-form').addEventListener('submit', (event) => { event.preventDefault(); const q = $('question').value.trim(); if (!q) return; addBubble(q, 'user'); addBubble(answer(q), 'answer'); $('question').value = ''; });

void loadHistory();
void loadForm();
void loadCalendar();
