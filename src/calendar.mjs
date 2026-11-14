export const CALENDAR_URL = 'https://api.jolpi.ca/ergast/f1/current.json?limit=100';

function parseSession(label, value) {
  if (!value?.date || !value?.time) return null;
  const date = new Date(`${value.date}T${value.time}`);
  return Number.isFinite(date.getTime()) ? { label, startsAt: date.toISOString() } : null;
}

export function normalizeCalendar(payload) {
  const table = payload?.MRData?.RaceTable;
  const season = Number(table?.season);
  if (!Number.isInteger(season) || season < 1950 || !Array.isArray(table?.Races)) throw new Error('Invalid calendar response.');
  const races = table.Races.map((race) => {
    const round = Number(race.round);
    const start = parseSession('Race', race);
    if (!Number.isInteger(round) || round < 1 || !start || typeof race.raceName !== 'string') return null;
    const sessions = [
      parseSession('Practice 1', race.FirstPractice),
      parseSession('Sprint qualifying', race.SprintQualifying),
      parseSession('Sprint', race.Sprint),
      parseSession('Qualifying', race.Qualifying),
      start
    ].filter(Boolean).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
      id: `${season}-${round}`,
      season,
      round,
      name: race.raceName.trim(),
      locality: String(race.Circuit?.Location?.locality || '').trim(),
      startsAt: start.startsAt,
      sessions
    };
  }).filter(Boolean).sort((a, b) => a.round - b.round);
  if (!races.length) throw new Error('Calendar has no valid races.');
  return { season, races };
}

export function upcomingRaces(calendar, now = Date.now()) {
  return calendar.races.filter((race) => Date.parse(race.startsAt) > now);
}

export function formatLocalDate(iso, options = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
}
