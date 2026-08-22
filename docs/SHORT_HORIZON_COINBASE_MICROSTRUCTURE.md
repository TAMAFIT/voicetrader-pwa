# v0.76 Coinbase trusted microstructure evidence

## Scope

v0.76 converts only integrity-certified Coinbase Advanced Trade public market data into observational microstructure evidence for `BTC-USD` and `ETH-USD`.

It does **not** authorize the new venue as a prediction input, fit thresholds, compare profitability across venues, submit orders, or claim execution performance.

## Official provider semantics reverified

Coinbase Advanced Trade public WebSocket:

- endpoint: `wss://advanced-trade-ws.coinbase.com`
- public unauthenticated channels used: `level2`, `market_trades`, `heartbeats`
- `level2` documents guaranteed delivery and absolute `new_quantity` updates
- `new_quantity=0` removes a level
- `market_trades.side` is the **maker side**
- therefore observational taker direction is the opposite side

## Integrity gate

Book-derived features require all of:

- `TRUSTED_SNAPSHOT` or `TRUSTED_UPDATE`
- local synchronized non-crossed book
- continuous provider sequence evidence
- explicit `derivedMicrostructureAuthorized=true` on both integrity semantics and governance

Failures such as sequence gap, out-of-order delivery, update before snapshot, malformed level, incomplete book, or crossed book remain fail-closed and cannot emit book-derived features.

## Derived evidence

Trusted book events may emit:

- best bid / best ask
- quoted spread and spread bps
- mid
- microprice and microprice-minus-mid
- top-1 imbalance
- depth imbalance across the maintained depth
- continuous top-of-book OFI using the same formula family as the Kraken research path

Market trades may emit:

- maker side as supplied by Coinbase
- derived opposite taker side
- signed quantity
- signed notional

Positive signed flow means aggressive buy pressure on both venue adapters.

## Storage

Derived evidence is append-only NDJSON under:

`derived/coinbase/microstructure/{BTCUSD|ETHUSD}/YYYY/MM/DD/HH.ndjson`

Raw provider wire remains authoritative and is preserved independently under the v0.74 exact-wire archive.

## Validation

Validated with Node 22 without consuming GitHub Actions:

- source syntax checks
- Coinbase L2 integrity regression
- trusted-only derived authorization regression
- OFI / imbalance / microprice deterministic fixtures
- maker-side to taker-side signed-flow fixtures
- mocked recorder integration from subscriptions -> raw -> integrity -> derived evidence -> health state

## Scientific boundary

- `crossVenueComparabilityClaim=false`
- `predictionInputAuthorized=false`
- no outcome-driven fitting
- no automatic promotion
- no real-money routing
- no order submission
- no profitability claim

The next safe research step is to build a venue-neutral normalization/pairing layer and test whether the same preregistered microstructure signs and clock-boundary conditions replicate across Kraken and Coinbase before permitting any cross-venue predictive inference.
