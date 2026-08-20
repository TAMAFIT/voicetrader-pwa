# VoiceTrader Short-Horizon Expansion Contract

Status: v0.41 FX data foundation

## Goal

Add a short-horizon research wing to VoiceTrader without changing the semantics, data, evaluators, or generated branches of the existing v0.39 4H research system.

The current delivery is data collection only. It does not authorize or implement real-money order routing.

## Non-breaking boundary

Protected legacy surfaces remain unchanged:

- BTC 4H Knowledge Forward collector/evidence
- BTC Higher-Timeframe Forward collector/evidence
- ETH 4H Forward collector/evidence
- existing Champion/Challenger, Prospective Evidence, Experience, model-readiness and history-audit contracts
- existing legacy generated data branches

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
- Dukascopy public historical/datafeed source for USD/JPY 1m research archiving
- normalized event identity using venue + instrument + timeframe + source timestamp
- batch catch-up collection suitable for GitHub Actions
- archive routing by asset class while preserving the existing crypto paths

### BUILD

- isolated short-horizon MarketEvent contract
- daily UTC NDJSON archive layout
- deterministic deduplication and fail-closed OHLCV conflict detection
- per-domain archive manifests with counts, continuity diagnostics, hashes and collector provenance
- session-aware continuity semantics for FX so ordinary market closures are not mislabeled as missing 24/7 bars
- shared single-writer concurrency for the generated short-horizon data branch

### DEFER

- broker-specific live FX quote adapter for human/demo signaling
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

## Active crypto streams

- BTCUSD 1m — Kraken spot
- BTCUSD 5m — Kraken spot
- ETHUSD 1m — Kraken spot
- ETHUSD 5m — Kraken spot

Only candles closed at collection time are accepted. Kraken OHLC requests expose a bounded recent window, so scheduled collection is treated as an archive/catch-up feed rather than a millisecond live execution feed.

## Active FX baseline

The first FX research stream is USD/JPY from Dukascopy public market-data storage through a fixed `dukascopy-node` runtime version.

- USDJPY 1m — Dukascopy BID candles
- USDJPY 5m — deterministically derived from complete aligned groups of five stored 1m candles
- runtime dependency pinned to `dukascopy-node@1.50.0`
- install scripts disabled in GitHub Actions
- no broker credential, trading account token, or order capability is used by this collector
- the adapter is explicitly marked `liveExecutionFeed:false`

The purpose of this source is prospective research data accumulation, not broker-exact executable pricing. A later demo/live signal phase must separately validate a broker-specific quote adapter, spread and execution characteristics.

FX is sessioned rather than 24/7. Therefore the v0.41 archive reports raw time gaps but does not convert every weekend/market-closure gap into `missingBars`. A later market-calendar health layer can classify session-expected versus unexpected gaps without corrupting the stored data.

## Generated storage

The initial GitHub stage uses the existing repository with a dedicated generated branch:

`short-horizon-data`

Daily crypto files:

`data/short-horizon/crypto/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`

Daily FX files:

`data/short-horizon/fx/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`

Health/provenance:

- `data/short-horizon/manifest.json` — crypto collector
- `data/short-horizon/fx-manifest.json` — FX collector

Raw short-horizon data is not committed to `main`.

Separate manifests avoid concurrent collectors rewriting one shared generated metadata file. Both workflows use the same `short-horizon-data-writer` concurrency group so only one workflow writes the generated branch at a time.

## Manifest requirements

Each successful run records:

- collector/provider versions
- fetched/added/duplicate/conflict counts
- first/last source timestamp per stream
- record/file counts
- continuity mode and raw gap diagnostics
- missing-bar estimates only where the stream is legitimately continuous 24/7
- duplicate-key count
- deterministic SHA-256 over canonical stream events
- GitHub run id/attempt when available
- guardrails proving no order submission or real-money routing

## Scheduling

Crypto collection runs hourly with overlapping recent-window catch-up. USD/JPY collection also runs hourly and re-reads a 72-hour overlapping window so routine missed runs can be repaired by deterministic deduplication.

Hourly archive collection is intentionally not the future live signal cadence. When the project reaches live human/demo signaling, signal-time feeds will be separate lower-latency adapters. When the operator's home PC becomes a 24h node, the storage/collector adapter can migrate to local DB/archive without changing MarketEvent semantics.

## Capacity migration

GitHub is the first-stage durable buffer. Repository size is monitored operationally; no exact size is treated as a sudden failure boundary. Before high-volume tick/orderbook collection, raw persistence migrates to the 24h local node or another dedicated data store. GitHub then remains code, manifests, evidence, and compact research results.

## Scientific guardrails

- historical/backfilled candles are not represented as predictions made at those historical times
- decision-time evidence will be frozen separately when the Signal Engine is added
- future outcomes may append labels/results but must not rewrite decision-time inputs
- collector conflict never silently mutates a prior event
- data gaps are surfaced rather than synthesized
- FX source prices are not represented as broker-executable prices
- this phase makes no profitability claim
