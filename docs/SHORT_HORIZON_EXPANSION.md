# VoiceTrader Short-Horizon Expansion Contract

Status: v0.42 Human Canon / Signal foundation

## Goal

Add a short-horizon research wing to VoiceTrader without changing the semantics, data, evaluators, or generated branches of the existing v0.39 4H research system.

The current delivery adds a frozen research signal benchmark. It does not authorize or implement real-money order routing.

## Non-breaking boundary

Protected legacy surfaces remain unchanged:

- BTC 4H Knowledge Forward collector/evidence
- BTC Higher-Timeframe Forward collector/evidence
- ETH 4H Forward collector/evidence
- existing Champion/Challenger, Prospective Evidence, Experience, model-readiness and history-audit contracts
- existing legacy generated data branches

New short-horizon work lives under `src/short-horizon/`, `scripts/collect-short-horizon-*.mjs`, `scripts/lib/short-horizon-*.mjs`, `.github/workflows/short-horizon-*.yml`, and generated short-horizon data/evidence domains. Removing those surfaces must leave legacy VoiceTrader behavior intact.

## Architecture discovery disposition

### REUSE

- generated-data-branch pattern already used by existing VoiceTrader forward collectors
- closed-candle-only market-data discipline
- immutable prospective evidence and fail-closed conflict philosophy
- timeframe-neutral indicator primitives from `src/knowledge/knowledge-indicators.js`
- branch -> tests -> PR -> exact-head CI -> merge governance

### ADAPT

- Kraken public OHLC to BTC/USD and ETH/USD 1m/5m
- Dukascopy public BID M1 source to USD/JPY 1m plus deterministic 5m aggregation
- normalized MarketEvent identity
- archive routing and session-aware FX continuity
- textbook/canonical technical concepts into a separately frozen short-horizon benchmark

### BUILD

- isolated MarketEvent contract and daily NDJSON archive
- short-horizon Human Canon Registry and engine
- explicit LONG / SHORT / WAIT research signal contract
- prospective immutable signal ledger whose outcomes are stored separately

### DEFER

- scheduled prospective signal collection and outcome maturation
- broker-specific live FX quote adapter for human/demo signaling
- live PWA signal console
- tick/orderbook/WebSocket persistence and microstructure lab
- local 24h PC collector/storage migration
- order submission or real-money execution

## MarketEvent v1 and active data streams

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

Dukascopy is a research archive baseline, not broker-executable pricing. A later human/demo phase must separately validate broker quotes, spread and execution characteristics.

## Generated storage

Generated raw data branch: `short-horizon-data`.

- `data/short-horizon/crypto/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon/fx/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon/manifest.json` — crypto health/provenance
- `data/short-horizon/fx-manifest.json` — FX health/provenance

Crypto and FX workflows share the `short-horizon-data-writer` concurrency group, serializing generated-branch writes. Raw short-horizon data is never committed to `main`.

Crypto is assessed as continuous 24/7. FX is `sessioned`; raw gaps are surfaced but ordinary market-closure gaps are not automatically labeled missing 24/7 bars.

## v0.42 Frozen Human Canon benchmark

The first short-horizon signal model is intentionally not fitted to accumulated short-horizon outcomes. It is a benchmark representation of widely used technical-analysis concepts. Its purpose is to test whether canonical knowledge has prospective net value, not to assume that it does.

The frozen registry uses 1m and 5m inputs and the following families with equal family weight:

- Trend — SMA alignment/slope, MACD 12/26/9, DMI/ADX
- Momentum — RSI 14, ROC, Stochastic 14
- Mean reversion — Bollinger 20/2 stretch, RSI 30/70, Stochastic 20/80
- Structure — Donchian 20 and HH/HL versus LH/LL structure
- Participation — OBV direction and relative volume-spike confirmation

The engine reuses indicator mathematics, not the existing BTC 4H Human Knowledge Engine thresholds or 4H Playbook Registry. Short-horizon thresholds are separately frozen before prospective outcome testing.

Governance is explicit:

- `optimizedOnObservedShortHorizonData:false`
- `parameterSweep:false`
- `adaptiveWeights:false`
- `selfLearning:false`
- `automaticPromotion:false`
- `confidenceIsCalibratedProbability:false`
- `scoreIsExpectedReturn:false`
- `executionAuthorized:false`

Signals default to `WAIT`. LONG/SHORT requires a minimum composite score, at least three meaningful directional families, sufficient family agreement, and a non-blocked risk gate. Recent data discontinuity is a hard block. Volatility is intentionally contextual in v0.42: high/extreme relative volatility produces `CAUTION` rather than becoming an arbitrary directional-alpha veto before prospective evidence exists.

Initial intended horizons are preregistered in bar-independent clock time:

- 1m input: primary 5 minutes, secondary 15 minutes
- 5m input: primary 15 minutes, secondary 30 minutes

These horizons are research labels, not expiry contracts.

## Signal immutability contract

A signal record freezes the latest market event, engine/registry versions, generated time, direction, horizons, family scores, regime/risk context, supporting/opposing reasons and decision-time features.

Two observation modes are distinguished:

- `historical-replay` — useful for deterministic testing but never represented as a prospective prediction
- `prospective` — may enter the prospective ledger only after the decision bar has actually closed

The prospective signal ledger accepts only records with `observedProspectively:true` and `futureOutcomeUsed:false`. The same `signalId` may be re-seen only if every decision-time field is identical; any mutation is an immutability conflict. Future outcomes will be stored in a separate outcome ledger rather than modifying the signal record.

## Scheduling and next runtime stage

Raw BTC/ETH and USDJPY collection runs hourly with overlapping catch-up. That cadence is an archive cadence, not the eventual interactive signal cadence.

The v0.42 engine/contract is deliberately deterministic and runtime-independent. The next phase may add a prospective signal collector at a cadence appropriate to the input horizon and a separate PWA/demo console. A later broker-specific live adapter remains necessary before treating any FX signal as executable.

## Capacity migration

GitHub is the first-stage durable buffer. Repository size is monitored operationally; no exact size is treated as a sudden failure boundary. Before high-volume tick/orderbook collection, raw persistence migrates to the operator's 24h local node or another dedicated store without changing MarketEvent semantics.

## Scientific guardrails

- historical/backfilled candles are not represented as predictions made at those historical times
- future outcomes never rewrite decision-time inputs
- collector conflicts never silently mutate prior market events
- signal conflicts never silently mutate prior prospective decisions
- data gaps are surfaced rather than synthesized
- FX archive prices are not represented as broker-executable prices
- signal strength is not presented as calibrated win probability
- this phase makes no profitability claim
