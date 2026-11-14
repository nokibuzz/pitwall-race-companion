# Recorded data and licence

The bundled `src/history.json`, `src/calendar.json` and `src/form.json` were derived from the [Jolpica F1 API](https://api.jolpi.ca/docs/), initially on **14 November 2026**. Each JSON file records its generation time. Jolpica makes the API data available for non-commercial use under [CC BY-NC-SA 4.0](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md). These derived data files remain subject to those terms; this repository does not claim to relicense the source data. Commercial use needs a separate agreement with the provider and any other necessary rights.

The historical snapshot contains:

- [2025 Abu Dhabi GP results](https://api.jolpi.ca/ergast/f1/2025/24/results.json), [lap times and positions](https://api.jolpi.ca/ergast/f1/2025/24/laps.json), [pit stops](https://api.jolpi.ca/ergast/f1/2025/24/pitstops.json)
- [2025 Italian GP results](https://api.jolpi.ca/ergast/f1/2025/16/results.json), [lap times and positions](https://api.jolpi.ca/ergast/f1/2025/16/laps.json), [pit stops](https://api.jolpi.ca/ergast/f1/2025/16/pitstops.json)
- [2024 Italian GP results](https://api.jolpi.ca/ergast/f1/2024/16/results.json), [lap times and positions](https://api.jolpi.ca/ergast/f1/2024/16/laps.json), [pit stops](https://api.jolpi.ca/ergast/f1/2024/16/pitstops.json)

The form preview uses [current driver standings](https://api.jolpi.ca/ergast/f1/current/driverStandings.json) and the [last completed race result](https://api.jolpi.ca/ergast/f1/current/last/results.json). The calendar uses the [current schedule](https://api.jolpi.ca/ergast/f1/current.json). `scripts/refresh-current.mjs` requests these sources with a named user agent and writes static snapshots; the scheduled GitHub workflow runs it daily. The browser reads the published JSON and does not call Jolpica directly. The bundled form snapshot states the season and round it covers.

`scripts/build-history.mjs` reconstructs cumulative elapsed time by summing recorded lap times, keeps the provider's recorded lap positions and finishing order, computes recent clean-lap median pace, and estimates a typical pit-lane loss from two laps around recorded stops. Pit entry and exit often affect different laps, so both are included in that estimate. It excludes those laps from clean-pace estimates. The script checks reconstructed finish times against the classified results before writing the snapshot, recording any whole-five-second classification adjustment separately because penalties are absent from lap times.

**Unavailable in these endpoints:** tyre compounds, tyre inventory, race-control phases, on-track traffic, and exact team strategy intent. The counterfactual model does not invent those facts. Race Rewind shows an observed lap position beside a conditional model position and never labels the latter an official result.
