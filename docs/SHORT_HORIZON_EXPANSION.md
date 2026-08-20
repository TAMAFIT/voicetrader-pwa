# VoiceTrader Short-Horizon Expansion Contract

Status: v0.45 non-binding cost break-even analysis

## Goal

Extend VoiceTrader with an isolated short-horizon research wing without changing the semantics, generated branches, evaluators, or execution authority of the existing v0.39 4H research system.

The short-horizon path now covers raw market collection, frozen Human Canon decisions, prospective signal evidence, separate prospective outcome maturation, and non-binding transaction-cost break-even analysis. It still does not authorize or implement real-money order routing.

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
- matured raw outcomes into a cost break-even evidence layer that makes no provider-cost claim

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
- separate break-even-cost analysis records and descriptive scorecards

### DEFER

- verified provider/broker-specific spread, fee, slippage, funding and swap binding
- broker-specific executable FX quote adapter
- paper execution/fill simulation tied to executable venue quotes
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

Each signal receives UTC/JST and analytical Tokyo/London/New York session context via IANA time zones. Session buckets are research labels and explicitly do not claim that decentralized FX has one centralized exchange-open state.

Generated signal branch: `short-horizon-signal-data`.

- `data/short-horizon-signals/<ASSET_CLASS>/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon-signals/manifest.json`

Signal records are immutable prospective evidence. Retry-only receive/generated timestamps do not create semantic conflicts; changes to economic, decision, or provenance fields fail closed. Outcomes never rewrite signals.

## Prospective outcome maturation — v0.44

v0.44 reads only prospective records from `short-horizon-signal-data` and writes outcomes to `short-horizon-outcome-data`.

The outcome collector runs at minute `7,22,37,52` each hour, approximately five minutes after the signal collector. It never writes to the signal branch.

For every signal, two independently keyed outcomes are eligible:

- `primary` — the preregistered primary horizon
- `secondary` — the preregistered secondary horizon

The decision entry price is the close frozen in the signal record. Every expected future bar must be present at the exact timeframe interval through the target horizon.

- target not reached => `PENDING_TIME`, no outcome record
- target reached but exact bars missing => `MISSING_DATA`, no fabricated terminal record
- complete future window => immutable `MATURED` record

For matured outcomes:

- `marketReturnPct` = simple entry-to-target market return
- LONG directional return = market return
- SHORT directional return = negative market return
- WAIT = `WAIT_OBSERVATION`, no directional return
- LONG/SHORT receive simple-return MFE/MAE
- WAIT records market path extremes but no directional MFE/MAE

v0.44 deliberately does not calculate deployable Net EV:

- `transactionCostsModeled:false`
- `netReturnPct:null`
- `executionFillModeled:false`

Outcome provenance binds the exact signal record SHA-256 and exact future economic/source-window SHA-256. Repeated maturation may differ only in observation time; changed economic/result/provenance content fails closed.

Generated outcome branch: `short-horizon-outcome-data`.

- `data/short-horizon-outcomes/<ASSET_CLASS>/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon-outcomes/manifest.json`

## Non-binding cost break-even analysis — v0.45

v0.45 adds a fourth isolated generated domain, `short-horizon-cost-analysis-data`, derived only from immutable v0.44 outcomes.

The collector runs at minute `12,27,42,57` each hour, approximately five minutes after outcome maturation. It reads `short-horizon-outcome-data` without modifying it and writes only the cost-analysis branch.

### Why break-even first

An actual round-trip cost cannot be claimed yet because:

- Dukascopy BID research candles are not broker-executable bid/ask quotes
- an actual Japan-usable FX broker and API/execution path has not yet been bound to this experiment
- crypto trading fee tier, spread, slippage and derivative funding depend on the executable venue/product/account

Therefore v0.45 does **not** invent a broker spread or an arbitrary cost scenario and does not claim net profitability.

### Per-outcome break-even evidence

For directional matured outcomes only:

`grossDirectionalReturnBps = rawDirectionalReturnPct x 100`

The nonnegative round-trip break-even budget is:

`breakEvenRoundTripCostBps = max(0, grossDirectionalReturnBps)`

Interpretation:

- positive gross directional outcome: strict positive net requires actual all-in round-trip cost to be **below** the break-even value
- zero/negative gross directional outcome: no positive nonnegative cost budget exists
- WAIT: observation-only, so directional gross return and break-even cost are both `null`

Every record remains explicitly unbound:

- `costBindingStatus:'UNBOUND'`
- `actualRoundTripCostBps:null`
- `transactionCostsModeled:false`
- `providerCostClaim:false`
- `netReturnAvailable:false`
- `netReturnPct:null`

The analysis record stores the SHA-256 of its source outcome. `analyzedAtMs` is retry metadata; changes to the underlying outcome-derived economics for the same analysis ID fail closed.

### Descriptive scorecard

The generated manifest groups evidence by:

- instrument
- input timeframe
- primary/secondary horizon
- analytical session
- regime

For directional samples it reports descriptive values such as:

- WIN/LOSS/FLAT counts
- positive-cost-budget count/rate
- mean/median gross directional return in bps
- mean, p25, median, p75 and maximum observed break-even round-trip cost in bps

WAIT counts remain visible rather than being silently excluded from research coverage.

These statistics are **not** optimization inputs in v0.45. They do not change Human Canon thresholds, weights, signal gating, or promotion status.

Generated cost-analysis branch: `short-horizon-cost-analysis-data`.

- `data/short-horizon-cost-analysis/<ASSET_CLASS>/<INSTRUMENT>/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`
- `data/short-horizon-cost-analysis/manifest.json`

## Capacity migration

GitHub remains the first-stage durable buffer for candle, signal, outcome, and compact cost-analysis evidence. Before high-volume tick/orderbook collection, raw persistence migrates to the operator's 24h local node or another dedicated store without changing MarketEvent semantics.

## Scientific and execution guardrails

- historical/backfilled candles are never represented as predictions made in the past
- only genuinely prospective v0.43 signals can enter v0.44 outcomes
- v0.45 derives only from immutable v0.44 outcomes
- future outcomes never rewrite decision-time inputs
- missing future data never becomes a fabricated terminal result
- market, signal, outcome and analysis semantic conflicts fail closed
- stale market data cannot create a current prospective signal
- FX research prices are not represented as broker-executable prices
- signal strength is not a calibrated win probability
- raw return is not Net EV
- break-even cost is not an actual provider cost
- no arbitrary cost scenario grid is used in v0.45
- no v0.45 parameter optimization or automatic promotion occurs
- `executionAuthorized=false`
- `realMoneyRouting=false`
- `orderSubmission=false`
- this phase makes no profitability claim

## Next phase

The next deployability phase should identify and explicitly verify one or more Japan-usable executable providers before binding an actual cost model. For FX that means broker bid/ask, spread behavior, swap where relevant, API/order support and execution/slippage semantics. For crypto it means the exact Japan-available venue/product, fee tier, spread/slippage and funding where derivatives are used. Only after such binding should a separate layer expose cost-adjusted net return or Net EV; the frozen v0.42 decisions, v0.43 signals, v0.44 outcomes and v0.45 break-even evidence must remain immutable.
