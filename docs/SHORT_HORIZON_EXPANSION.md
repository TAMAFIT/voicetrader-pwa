# VoiceTrader Short-Horizon Expansion Contract

Status: v0.40 foundation

## Goal

Add a short-horizon research wing to VoiceTrader without changing the semantics, data, evaluators, or generated branches of the existing v0.39 4H research system.

The first delivery is data collection only. It does not authorize or implement real-money order routing.

## Non-breaking boundary

Protected legacy surfaces remain unchanged:

- BTC 4H Knowledge Forward collector/evidence
- BTC Higher-Timeframe Forward collector/evidence
- ETH 4H Forward collector/evidence
- existing Champion/Challenger, Prospective Evidence, Experience, model-readiness and history-audit contracts
- existing generated data branches

New short-horizon work lives under:

- `src/short-horizon/`
- `scripts/collect-short-horizon-*.mjs`
- `scripts/lib/short-horizon-*.mjs`
- `.github/workflows/short-horizon-*.yml`
- generated branch `short-horizon-data`

Removing those new surfaces must leave legacy VoiceTrader behavior intact.

## Architecture discovery disposition

### REUSE

- generated-data-branch pattern already used by existing VoiceTrader forward collectors
- closed-candle-only market-data discipline
- gap/conflict health semantics and immutable research posture
- branch -> tests -> PR -> exact-head CI -> merge governance

### ADAPT

- Kraken public OHLC feed from the existing 4H usage to BTC/USD and ETH/USD 1m/5m streams
- normalized event identity using venue + instrument + timeframe + source timestamp
- batch catch-up collection suitable for GitHub Actions

### BUILD

- isolated short-horizon MarketEvent contract
- daily UTC NDJSON archive layout
- deterministic deduplication and fail-closed OHLCV conflict detection
- archive manifest with counts, gaps, hashes and collector provenance

### DEFER

- FX provider and USD/JPY collection
- live signal console and Human Canon short-horizon engine
- tick/orderbook/WebSocket persistence
- local 24h PC collector/storage migration
- order submission or real-money execution

## MarketEvent v1

Short-horizon OHLC records use epoch milliseconds for both market/source time and collector receive time. This avoids mixing seconds and milliseconds and preserves the information required for later latency/lead-lag analysis.

A closed OHLC event contains:

- schema/event version
- asset class, instrument, venue
- timeframe in minutes
- `sourceTimestampMs`
- `receivedTimestampMs`
- OHLC, volume, trade count
- source/provider id
- explicit closed/data-quality state

Repeated retrieval of the same candle is a duplicate when economic/source fields are identical. A changed OHLCV payload for the same event key is a conflict and the collector fails rather than silently rewriting prior data.

## Initial streams

- BTCUSD 1m — Kraken spot
- BTCUSD 5m — Kraken spot
- ETHUSD 1m — Kraken spot
- ETHUSD 5m — Kraken spot

Only candles closed at collection time are accepted. Kraken OHLC requests expose a bounded recent window, so scheduled collection is treated as an archive/catch-up feed rather than a millisecond live execution feed.

## Generated storage

The initial GitHub stage uses the existing repository with a dedicated generated branch:

`short-horizon-data`

Daily files:

`data/short-horizon/crypto/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`

Health/provenance:

`data/short-horizon/manifest.json`

Raw short-horizon data is not committed to `main`.

## Manifest requirements

Each successful run records:

- collector/provider versions
- fetched/added/duplicate/conflict counts
- first/last source timestamp per stream
- record/file counts
- gap count and estimated missing bars
- duplicate-key count
- deterministic SHA-256 over canonical stream events
- GitHub run id/attempt when available
- guardrails proving no order submission or real-money routing

## Scheduling

The initial collector runs hourly. An hourly run is intentionally a low-cost archive cadence, not a live 1-minute signal cadence. Kraken's recent-window response is re-read and deduplicated so ordinary missed hourly runs can catch up automatically.

When the project reaches live human/demo signaling, the signal-time feed will be a separate lower-latency adapter. When the operator's home PC becomes a 24h node, the storage/collector adapter can migrate to local DB/archive without changing MarketEvent semantics.

## Capacity migration

GitHub is the first-stage durable buffer. Repository size is monitored operationally; no exact size is treated as a sudden failure boundary. Before high-volume tick/orderbook collection, raw persistence migrates to the 24h local node or another dedicated data store. GitHub then remains code, manifests, evidence, and compact research results.

## Scientific guardrails

- historical/backfilled candles are not represented as predictions made at those historical times
- decision-time evidence will be frozen separately when the Signal Engine is added
- future outcomes may append labels/results but must not rewrite decision-time inputs
- collector conflict never silently mutates a prior event
- data gaps are surfaced rather than synthesized
- this phase makes no profitability claim
