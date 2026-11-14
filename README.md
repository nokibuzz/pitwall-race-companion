# Pitwall Race Companion

[Open the public demo](https://nokibuzz.github.io/pitwall-race-companion/) · [See the historical analysis](https://nokibuzz.github.io/pitwall-race-companion/#history)

An independent, installable race companion that puts a fan in the strategist's seat. It shows the real season calendar, a simple pre-race form watch using real drivers, and recorded race history. In Race Rewind, move a recorded pit stop a few laps and compare the **observed position** with a **conditional model position** at a specified lap. Strategy Lab lets you change pit loss, fresh-tyre gain, driver, rival and comparison horizon.

## What is real and what is modelled?

| Feature | Real source | Model or limit |
| --- | --- | --- |
| Calendar | Jolpica schedule, shown in your local time zone | Dates can change; confirm with the [official calendar](https://www.formula1.com/en/racing). |
| Podium form watch | Current driver standings and last completed race | 70% normalized season points, 30% last race finish. An illustrative ranking, **not** calibrated race odds. |
| Race Rewind | Three recorded Grands Prix, driver names, grid and finish positions, lap times, lap positions and pit stops | Moving a stop uses nearby clean-lap pace. The resulting P position applies to a specified comparison lap, **not** the official finish. |
| Strategy Lab replay | Recorded positions and lap times | Two conditional pit scenarios using adjustable assumptions; no live timing. |
| During a race | Viewer-entered snapshot | Manual entry only; no automatic live feed. |

The included historical races are the **2025 Abu Dhabi Grand Prix**, **2025 Italian Grand Prix** and **2024 Italian Grand Prix**. Real timing data, transformations, retrieval dates and licence details are in [data provenance](docs/DATA.md). Model assumptions and missing inputs are in [model notes](docs/MODEL.md). All data comes from the [Jolpica F1 API](https://api.jolpi.ca/docs/) under its [non-commercial CC BY-NC-SA 4.0 terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md). A commercial or official integration requires separate rights and an authorized timing source.

## Run locally

Node.js 22 or newer; no package installation or API key is needed for the bundled snapshots.

```sh
npm test
npm run build
npm run dev
```

Open `http://localhost:4173`. The calendar, form watch and recorded races are bundled as static snapshots. To refresh completed-race history, run `npm run refresh:history`; to force a new download after a source correction, run `npm run refresh:history -- --fresh`. To refresh the current calendar and form, run `npm run refresh:current`. Then test and build. The history script makes paced API requests and caches responses locally in ignored `.cache/`. The GitHub workflow refreshes current snapshots daily with a named user agent and redeploys the site. The browser itself makes no Jolpica API calls.

The site is a responsive PWA and can be installed from a mobile browser over HTTPS. It is not a native Android or iOS binary.

## Screenshots

[Weekend](docs/preview-weekend.png) · [Calendar](docs/preview-calendar.png) · [Race Rewind](docs/preview-history.png) · [Recorded classification](docs/preview-results.png) · [Strategy Lab](docs/preview-strategy.png) · [Phone](docs/preview-mobile.png)

## Live integration path

The current app has no authorized live timing feed. A later real-time version would need licensed timing access, a timestamped adapter for positions/laps/pit events, source freshness checks, race-control status, tyre and traffic information, safety-aware fallbacks, and backtesting of the counterfactual model. The data adapter can feed the existing `src/strategy.mjs` engine; `src/review.mjs` demonstrates deterministic explanations over recorded inputs. A production model should not turn a conditional scenario into a claim about a race's actual outcome.

Pitwall is an independent fan project, not associated with or endorsed by Formula 1. The checkered icon and car illustration are original; no official logos or official imagery are included.
