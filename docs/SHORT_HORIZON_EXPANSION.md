# VoiceTrader Short-Horizon Expansion Contract

Status: v0.44 prospective outcome maturation

## Goal

Extend VoiceTrader with an isolated short-horizon research wing without changing the semantics, generated branches, evaluators, or execution authority of the existing v0.39 4H research system.

The short-horizon path now covers raw market collection, frozen Human Canon decisions, prospective signal evidence, and separate prospective outcome maturation. It still does not authorize or implement real-money order routing.

## Non-breaking boundary

Protected legacy surfaces remain unchanged:

- BTC 4H Knowledge Forward collector/evidence
- BTC Higher-Timeframe Forward collector/evidence
- ETH 4H Forward collector/evidence
- existing Champion/Challenger, Prospective Evidence, Experience, model-readiness and history-audit contracts
- existing legacy generated data branches

Short-horizon work remains isolated under `src/short-horizon/`, `scripts/collect-short-horizon-*.mjs`, `scripts/lib/short-horizon-*.mjs`, `.github/workflows/short-horizon-*.yml`, and dedicated generated evidence branches. Removing those surfaces must leave legacy VoiceTrader behavior intact.

## Architecture disposition

### REUSE

- closed-candle-only market-data discipline
- immutable prospective evidence and fail-closed conflict semantics
- timeframe-neutral indicator mathematics
- generated-data-branch pattern
- branch -> tests -> PR -> exact-head CI -> merge governance

### ADAPT

- Kraken public OHLC for BTCUSD/ETHUSD 1m and 5m
- Dukascopy public BID M1 for USDJPY 1m plus deterministic complete/aligned 5m aggregation
- textbook/canonical technical concepts into a separately frozen 1m/5m Human Canon benchmark
- current public-provider fetches into best-effort prospective signal and outcome runtimes

### BUILD

- normalized short-horizon MarketEvent contract
- raw market archive and health manifests
- frozen Human Canon Registry/Engine
- LONG / SHORT / WAIT immutable Signal contract
- IANA-time-zone analytical session context
- freshness gate and fixed prospective decision window
- separate prospective-signal archive
- separate primary/secondary outcome contract and archive
- MFE/MAE and raw directional-return evidence

### DEFER

- execution-venue-specific spread/slippage/fee/funding/swap cost models
- broker-specific executable FX quote adapter
- paper execution/fill simulation tied to venue quotes
- live PWA signal console
- tick/orderbook/WebSocket persistence and microstructure lab
- local 24h PC collector/storage migration
- order submission or real-money execution

## Raw market data — v0.40/v0.41

Market events use epoch milliseconds for source and receive time. Repeated retrieval of identical economic/source fields is a duplicate; changed OHLCV for the same event key is a conflict and fails closed.

Active raw streams:

- BTCUSD 1m — Kraken spot
- BTCUSD 5m — Kraken spot
- ETHUSD 1m — Kraken spot
- ETHUSD 5m — Kraken spot
- USDJPY 1m — Dukascopy BID M1
- USDJPY 5m — deterministic complete/aligned aggregation of five M1 bars

Dukascopy uses pinned `dukascopy-node@1.50.0` with install scripts disabled in Actions. It has no broker credentials or order capability and remains `liveExecutionFeed:false`.

Generated raw branch: `short-horizon-data`.

- `data/short-horizon/crypto/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon/fx/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon/manifest.json`
- `data/short-horizon/fx-manifest.json`

Crypto is treated as continuous 24/7. FX is sessioned; raw gaps are surfaced without treating ordinary market closures as missing 24/7 bars.

## Frozen Human Canon — v0.42

The first short-horizon signal model is a preregistered benchmark, not a model fitted to accumulated short-horizon outcomes.

Equal-weight families:

- Trend — SMA alignment/slope, MACD 12/26/9, DMI/ADX
- Momentum — RSI 14, ROC, Stochastic 14
- Mean reversion — Bollinger 20/2, RSI 30/70, Stochastic 20/80
- Structure — Donchian 20 and HH/HL versus LH/LL
- Participation — OBV direction and relative-volume confirmation

The engine reuses indicator mathematics but not the existing BTC 4H Human Knowledge thresholds or 4H Playbook Registry.

Governance remains frozen:

- `optimizedOnObservedShortHorizonData:false`
- `parameterSweep:false`
- `adaptiveWeights:false`
- `selfLearning:false`
- `automaticPromotion:false`
- `confidenceIsCalibratedProbability:false`
- `scoreIsExpectedReturn:false`
- `executionAuthorized:false`

Signals default to `WAIT`. Recent data discontinuity is a hard block; relative volatility remains contextual/CAUTION rather than an unvalidated alpha veto.

Preregistered horizons:

- 1m input: primary 5 minutes, secondary 15 minutes
- 5m input: primary 15 minutes, secondary 30 minutes

These are research horizons, not expiry contracts.

## Prospective signal collection — v0.43

The signal collector runs at minute `2,17,32,47` each hour. GitHub Actions timing is best-effort and is not presented as exchange-grade latency.

Each run fetches current public data directly instead of waiting for the hourly raw archive:

- Kraken BTCUSD/ETHUSD 1m/5m
- Dukascopy USDJPY M1 with `ignoreFlats:false` for signal-time continuity, plus deterministic 5m aggregation

Prospective decisions use exactly the latest 160 closed bars. A deterministic SHA-256 fingerprint is calculated over the fixed economic/source input window with receive timestamps excluded.

Freshness requires at least 160 closed bars and a latest closed bar no older than `max(5 minutes, 2 x timeframe)`. Stale/weekend FX therefore produces `SKIPPED`, not a false current signal.

Each signal also receives UTC/JST and analytical Tokyo/London/New York session context via IANA time zones. Session buckets are research labels and explicitly do not claim that decentralized FX has one centralized exchange-open state.

Generated signal branch: `short-horizon-signal-data`.

- `data/short-horizon-signals/<ASSET_CLASS>/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon-signals/manifest.json`

Signal records are immutable prospective evidence. Retry-only receive/generated timestamps do not create semantic conflicts; changes to economic, decision, or provenance fields fail closed. Outcomes never rewrite signals.

## Prospective outcome maturation — v0.44

v0.44 reads only prospective records from `short-horizon-signal-data` and writes outcomes to a third isolated generated branch: `short-horizon-outcome-data`.

The outcome collector runs at minute `7,22,37,52` each hour, approximately five minutes after the signal collector. It never writes to the signal branch.

For every signal, two independently keyed outcomes are eligible:

- `primary` — the preregistered primary horizon
- `secondary` — the preregistered secondary horizon

The outcome ID binds the immutable signal ID, horizon kind, and horizon minutes.

### Exact horizon semantics

The decision entry price is the close frozen in the signal record. The future path begins at the first bar whose source timestamp equals the decision bar close timestamp. Every expected future bar must be present at the exact timeframe interval through the target horizon.

If the target time has not arrived, the state is `PENDING_TIME` and no outcome record is written.

If the target time has arrived but one or more exact aligned bars are missing, the state is `MISSING_DATA` and no terminal outcome is frozen. A later collector run may reconcile it when data becomes available.

Only a complete future window becomes `MATURED` evidence.

### Raw return and excursions

For a matured outcome:

- `marketReturnPct` = simple price return from frozen entry close to exact target close
- LONG directional return = market return
- SHORT directional return = negative market return
- WAIT has no directional return and is stored as `WAIT_OBSERVATION`
- LONG/SHORT receive MFE and MAE using the same simple entry-price return convention
- WAIT still records market max-up/max-down path statistics but no directional MFE/MAE

This phase deliberately does **not** calculate a deployable Net EV.

- `transactionCostsModeled:false`
- `netReturnPct:null`
- `executionFillModeled:false`

That separation is required because Dukascopy BID research candles are not broker-executable bid/ask quotes, and crypto execution fees/slippage/funding have not yet been bound to a specific executable venue/account tier.

### Outcome provenance and immutability

Each matured outcome stores:

- SHA-256 of the exact frozen signal record
- SHA-256 of the exact future economic/source bar window, excluding receive timestamps
- exact-aligned-closed-bars assertion
- target close time and path bar count

Repeated observation of the same outcome may differ only in `maturedAtMs`; the first stored record is retained. Any changed economic/result/provenance content for the same outcome ID fails closed as an immutability conflict.

### Outcome storage and descriptive manifest

Daily evidence:

`data/short-horizon-outcomes/<ASSET_CLASS>/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`

Manifest:

`data/short-horizon-outcomes/manifest.json`

The manifest groups by instrument/timeframe/horizon and reports:

- record counts
- LONG/SHORT/WAIT counts
- raw WIN/LOSS/FLAT counts for directional signals
- mean raw directional return
- mean MFE and MAE
- content hashes
- pending/missing/provider health
- explicit `transactionCostsModeled:false` and `netReturnAvailable:false`

These are descriptive research metrics, not a profitability claim.

## Capacity migration

GitHub remains the first-stage durable buffer for candle, signal, and compact outcome evidence. Before high-volume tick/orderbook collection, raw persistence migrates to the operator's 24h local node or another dedicated store without changing MarketEvent semantics.

## Scientific and execution guardrails

- historical/backfilled candles are never represented as predictions made in the past
- only genuinely prospective v0.43 signals can enter v0.44 outcomes
- future outcomes never rewrite decision-time inputs
- missing future data never becomes a fabricated terminal result
- collector, signal, and outcome semantic conflicts fail closed
- stale market data cannot create a current prospective signal
- FX research prices are not represented as broker-executable prices
- signal strength is not a calibrated win probability
- raw outcome return is not Net EV
- no v0.44 parameter optimization or automatic promotion occurs
- `executionAuthorized=false`
- `realMoneyRouting=false`
- `orderSubmission=false`
- this phase makes no profitability claim

## Next phase

After enough prospective outcomes accumulate, the next phase should add explicit asset/venue cost envelopes and counterfactual execution assumptions before any ranking by deployable Net EV. FX requires bid/ask/spread and eventual broker-specific execution evidence; crypto requires executable venue fees, spread/slippage, and funding where derivatives are studied. Those cost layers must remain separate from the frozen v0.42 decisions and v0.43 prospective signal evidence.
