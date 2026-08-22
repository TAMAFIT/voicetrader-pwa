# Short-Horizon Signal / Paper Console v0.49

## Goal
Expose the already-running short-horizon prospective research loop in the PWA without changing the frozen Human Canon, collectors, generated-data contracts, provider authority, or execution boundary.

## Reused architecture
v0.49 reuses the existing VoiceTrader remote-read pattern used by research UI modules: browser-side read-only `GET` requests to public generated-data branches with `cache: no-store`, schema checks, and fail-closed rendering.

No new API, Secret, database, provider account, order route, or background writer is introduced.

## Read sources
- `short-horizon-signal-data/data/short-horizon-signals/manifest.json`
- latest USDJPY 1m/5m prospective signal NDJSON inferred from each manifest stream's last source timestamp
- `short-horizon-gmo-quote-data/data/short-horizon-gmo-quotes/manifest.json`
- `short-horizon-gmo-paper-data/data/short-horizon-gmo-paper/manifest.json`
- latest and previous USDJPY paper NDJSON days for compact recent-outcome display

## Current-vs-last-recorded rule
The latest archived USDJPY signal is not automatically a current signal.

The Console treats USDJPY as current only when the latest signal collector run reports both 1m and 5m as `RECORDED` with fresh data. If the provider is stale, the market is closed, or the collector skips the stream, the UI shows `NO CURRENT FX SIGNAL` and labels the archived signal as `Last recorded`.

This prevents a Friday signal from being presented as a live Saturday decision.

## Paper semantics
Directional paper records are displayed only when the existing v0.48 archive marks them `SIMULATED_EXECUTED` using side-correct public bid/ask quotes. WAIT remains `NO_TRADE`.

The Console preserves the v0.48 scientific boundary:
- actual fill not observed
- fees not modeled
- slippage not modeled
- financing/swap not modeled
- `actualNetEvAvailable=false`
- `profitabilityClaim=false`
- no optimizer
- no Human Canon threshold/weight change
- no automatic promotion

## Authority
The Console is observation-only. It has no repository/data write path, provider credential surface, Private API method, order method, real-money routing, or decision-engine dependency.
