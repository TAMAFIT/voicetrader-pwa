# VoiceTrader Short-Horizon Expansion Contract

Status: v0.43 prospective signal collection

## Goal

Add a short-horizon research wing to VoiceTrader without changing the semantics, data, evaluators, or generated branches of the existing v0.39 4H research system.

The current delivery adds prospective Human Canon signal collection. It does not authorize or implement real-money order routing.

## Non-breaking boundary

Protected legacy surfaces remain unchanged:

- BTC 4H Knowledge Forward collector/evidence
- BTC Higher-Timeframe Forward collector/evidence
- ETH 4H Forward collector/evidence
- existing Champion/Challenger, Prospective Evidence, Experience, model-readiness and history-audit contracts
- existing legacy generated data branches

Short-horizon work remains isolated under `src/short-horizon/`, `scripts/collect-short-horizon-*.mjs`, `scripts/lib/short-horizon-*.mjs`, `.github/workflows/short-horizon-*.yml`, and dedicated generated data/evidence branches. Removing those surfaces must leave legacy VoiceTrader behavior intact.

## Architecture discovery disposition

### REUSE

- generated-data-branch pattern already used by existing VoiceTrader forward collectors
- closed-candle-only market-data discipline
- immutable prospective evidence and fail-closed conflict philosophy
- timeframe-neutral indicator primitives from `src/knowledge/knowledge-indicators.js`
- branch -> tests -> PR -> exact-head CI -> merge governance

### ADAPT

- Kraken public OHLC to BTC/USD and ETH/USD 1m/5m
- Dukascopy public BID M1 to USD/JPY 1m plus deterministic 5m aggregation
- normalized MarketEvent identity
- session-aware FX continuity
- textbook/canonical technical concepts into a separately frozen short-horizon benchmark
- current public provider fetches into a best-effort prospective signal runtime

### BUILD

- isolated MarketEvent contract and daily raw NDJSON archive
- short-horizon Human Canon Registry and engine
- explicit LONG / SHORT / WAIT research signal contract
- prospective immutable signal ledger whose outcomes are stored separately
- IANA-time-zone analytical session context
- deterministic freshness gate and fixed analysis window
- separate prospective-signal generated branch, archive and health manifest

### DEFER

- prospective outcome maturation and cost-adjusted scorecard
- broker-specific live FX quote adapter for human/demo signaling
- live PWA signal console
- tick/orderbook/WebSocket persistence and microstructure lab
- local 24h PC collector/storage migration
- order submission or real-money execution

## MarketEvent v1 and active raw streams

Market events use epoch milliseconds for both market/source time and collector receive time. Repeated retrieval of identical economic/source fields is a duplicate; changed OHLCV for the same event key is a conflict and fails closed.

Active crypto streams:

- BTCUSD 1m — Kraken spot
- BTCUSD 5m — Kraken spot
- ETHUSD 1m — Kraken spot
- ETHUSD 5m — Kraken spot

Active FX baseline:

- USDJPY 1m — Dukascopy BID candles
- USDJPY 5m — complete aligned groups of five stored 1m candles
- `dukascopy-node@1.50.0`, install scripts disabled
- no broker credential/order capability
- `liveExecutionFeed:false`

Dukascopy is a research baseline, not broker-executable pricing. A later human/demo phase must separately validate broker quotes, spread and execution characteristics.

## Generated raw storage

Generated raw data branch: `short-horizon-data`.

- `data/short-horizon/crypto/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon/fx/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon/manifest.json` — crypto health/provenance
- `data/short-horizon/fx-manifest.json` — FX health/provenance

Crypto and FX raw workflows share the `short-horizon-data-writer` concurrency group, serializing generated-branch writes. Raw short-horizon data is never committed to `main`.

Crypto is assessed as continuous 24/7. FX is `sessioned`; raw gaps are surfaced but ordinary market-closure gaps are not automatically labeled missing 24/7 bars.

## v0.42 Frozen Human Canon benchmark

The first short-horizon signal model is intentionally not fitted to accumulated short-horizon outcomes. It is a benchmark representation of widely used technical-analysis concepts. Its purpose is to test whether canonical knowledge has prospective net value, not to assume that it does.

The frozen registry uses 1m and 5m inputs with equal family weight:

- Trend — SMA alignment/slope, MACD 12/26/9, DMI/ADX
- Momentum — RSI 14, ROC, Stochastic 14
- Mean reversion — Bollinger 20/2 stretch, RSI 30/70, Stochastic 20/80
- Structure — Donchian 20 and HH/HL versus LH/LL structure
- Participation — OBV direction and relative volume-spike confirmation

The engine reuses indicator mathematics, not the existing BTC 4H Human Knowledge Engine thresholds or 4H Playbook Registry. Short-horizon thresholds are separately frozen before prospective outcome testing.

Governance remains explicit:

- `optimizedOnObservedShortHorizonData:false`
- `parameterSweep:false`
- `adaptiveWeights:false`
- `selfLearning:false`
- `automaticPromotion:false`
- `confidenceIsCalibratedProbability:false`
- `scoreIsExpectedReturn:false`
- `executionAuthorized:false`

Signals default to `WAIT`. LONG/SHORT requires a minimum composite score, at least three meaningful directional families, sufficient family agreement, and a non-blocked risk gate. Recent data discontinuity is a hard block. Relative volatility is contextual/CAUTION rather than an unvalidated directional-alpha veto.

Initial intended horizons remain preregistered:

- 1m input: primary 5 minutes, secondary 15 minutes
- 5m input: primary 15 minutes, secondary 30 minutes

These horizons are research labels, not expiry contracts.

## Signal immutability contract

A signal record freezes the latest market event, engine/registry versions, direction, horizons, family scores, regime/risk context, supporting/opposing reasons and decision-time features.

Two observation modes are distinguished:

- `historical-replay` — deterministic testing only; never represented as a prospective prediction
- `prospective` — may enter the prospective ledger only after the decision bar has actually closed

The prospective ledger accepts only `observedProspectively:true` and `futureOutcomeUsed:false`. First-observation metadata is retained. Retry-only receive/generated timestamps are ignored when deciding whether an already-seen signal is semantically identical. Any change to decision/economic/provenance fields fails closed as an immutability conflict. Future outcomes are stored separately and never rewrite the signal.

## v0.43 Prospective signal runtime

The v0.43 collector creates a separate prospective evidence stream rather than treating hourly raw archive commits as signal-time input.

### Runtime cadence

GitHub Actions runs at minute `2,17,32,47` of every hour, approximately every 15 minutes. The scheduler is best-effort; GitHub Actions timing is not presented as exchange-grade latency.

Each run directly obtains current public data from:

- Kraken public OHLC — BTCUSD 1m/5m and ETHUSD 1m/5m
- Dukascopy public BID M1 — USDJPY 1m, with complete aligned 5m derivation

For the signal path only, Dukascopy is requested with flat candles retained (`ignoreFlats:false`) so a no-price-change minute is not confused with a missing minute. The v0.41 raw collector keeps its prior default behavior unless explicitly changed.

### Fixed decision window

Prospective Human Canon decisions use exactly the latest 160 closed bars. This prevents repeated provider fetches with different historical lookback lengths from subtly changing EMA/MACD initialization for the same decision bar. A deterministic SHA-256 fingerprint is calculated from the fixed economic/source input window; receive timestamps are excluded from that fingerprint.

### Freshness gate

A current prospective signal requires:

- at least 160 closed bars
- latest bar already closed at observation time
- latest closed bar no older than the preregistered freshness limit (`max(5 minutes, 2 x timeframe)`)

Stale FX/weekend data therefore produces `SKIPPED`, not a false current signal. Data discontinuity within the Human Canon continuity window still flows through the engine as a risk block/WAIT rather than being synthesized.

### Analytical time/session context

Every recorded signal gets deterministic UTC/JST context plus analytical Tokyo, London and New York session buckets using IANA time zones. Daylight-saving changes are therefore resolved by the runtime time-zone database. These buckets are research labels only; they are explicitly not claims that decentralized FX has one centralized exchange open/close state.

### Generated prospective storage

Generated signal branch: `short-horizon-signal-data`.

Daily evidence:

`data/short-horizon-signals/<ASSET_CLASS>/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`

Health/provenance:

`data/short-horizon-signals/manifest.json`

The signal manifest records LONG/SHORT/WAIT counts, first/last source timestamps, analytical session counts, deterministic content hashes, collector run status, provider failures/skips, freshness diagnostics and GitHub run provenance.

The signal writer uses its own `short-horizon-signal-data-writer` concurrency group and never writes the raw `short-horizon-data` branch.

## Capacity migration

GitHub is the first-stage durable buffer for compact candle and signal evidence. Before high-volume tick/orderbook collection, raw persistence migrates to the operator's 24h local node or another dedicated store without changing MarketEvent semantics.

## Scientific and execution guardrails

- historical/backfilled candles are not represented as predictions made at those historical times
- future outcomes never rewrite decision-time inputs
- collector conflicts never silently mutate prior market events
- signal conflicts never silently mutate prior prospective decisions
- stale market data cannot create a current prospective signal
- data gaps are surfaced rather than synthesized
- FX research prices are not represented as broker-executable prices
- analytical session buckets are not exchange-open claims
- signal strength is not presented as calibrated win probability
- no parameter optimization occurs in v0.43
- `executionAuthorized=false`
- `realMoneyRouting=false`
- `orderSubmission=false`
- this phase makes no profitability claim

## Next phase

v0.44 should mature each immutable signal at its preregistered primary and secondary horizons in a separate outcome ledger, adding raw return, MFE/MAE, and later explicit spread/slippage/funding-or-swap cost models without rewriting v0.43 decisions.
