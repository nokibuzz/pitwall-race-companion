export const STANDINGS_URL = 'https://api.jolpi.ca/ergast/f1/current/driverStandings.json?limit=100';
export const LAST_RESULTS_URL = 'https://api.jolpi.ca/ergast/f1/current/last/results.json?limit=100';

export function rankPodiumForm(standingsPayload, resultsPayload) {
  const list = standingsPayload?.MRData?.StandingsTable?.StandingsLists?.[0];
  const race = resultsPayload?.MRData?.RaceTable?.Races?.[0];
  if (!list || !race || !Array.isArray(list.DriverStandings) || !Array.isArray(race.Results) || Number(list.season) !== Number(race.season) || Number(list.round) !== Number(race.round)) throw new Error('The completed-round form inputs do not match.');
  const previous = new Map(race.Results.map((result) => [result.Driver?.driverId, Number(result.position)]));
  const entries = list.DriverStandings.map((entry) => ({
    id: entry.Driver?.driverId,
    code: entry.Driver?.code || '',
    name: `${entry.Driver?.givenName || ''} ${entry.Driver?.familyName || ''}`.trim(),
    points: Number(entry.points),
    lastFinish: previous.get(entry.Driver?.driverId) ?? null
  })).filter((entry) => entry.id && entry.name && Number.isFinite(entry.points) && entry.points >= 0);
  if (entries.length < 3) throw new Error('Too few real drivers for the form preview.');
  const maxPoints = Math.max(...entries.map((entry) => entry.points), 1);
  const fieldSize = race.Results.length;
  const ranked = entries.map((entry) => {
    const seasonScore = 100 * entry.points / maxPoints;
    const recentScore = entry.lastFinish ? 100 * (fieldSize - entry.lastFinish + 1) / fieldSize : 0;
    return { ...entry, score: +(0.7 * seasonScore + 0.3 * recentScore).toFixed(1) };
  }).sort((a, b) => b.score - a.score || b.points - a.points || a.name.localeCompare(b.name));
  return {
    season: Number(list.season),
    throughRound: Number(list.round),
    latestRace: race.raceName,
    latestRaceDate: race.date,
    picks: ranked.slice(0, 3),
    method: '70% normalized season points, 30% last recorded race result; no upcoming qualifying, weather or tyre data.'
  };
}
