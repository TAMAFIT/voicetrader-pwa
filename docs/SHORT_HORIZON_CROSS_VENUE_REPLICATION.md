# v0.78 Kraken × Coinbase descriptive replication

## Purpose

v0.78 adds a second-venue replication layer for the Short-Horizon Edge Lab. It does not create a new trading rule. It asks a narrower question first:

> When Kraken and Coinbase observe the same BTC/USD or ETH/USD 5-second provider-time window, do independently derived microstructure signs agree often enough to justify a later preregistered predictive replication test?

## Inputs

The layer consumes finalized 5-second windows only:

- Kraken: `derived/kraken/windows/{BTCUSD|ETHUSD}/5s/...`
- Coinbase: `derived/coinbase/windows/{BTCUSD|ETHUSD}/5s/...`

Both inputs must use provider timestamps and retain receive time only for latency/integrity audit.

## Pair key

A pair requires the same:

- canonical instrument (`BTCUSD` or `ETHUSD`)
- `windowSec=5`
- start timestamp
- end timestamp

No nearest-neighbor or look-ahead matching is allowed.

## Descriptive eligibility

A paired record is descriptively eligible only when:

- both venue time-integrity states are `PASS` and prospectively eligible;
- both have book coverage;
- their clock-boundary context is aligned;
- at least three of the four preregistered feature families are present on both venues.

Missing values are missing. `null` is never coerced to zero.

## Compared feature signs

The first replication layer compares only sign agreement for definitions already frozen in the research program:

1. normalized OFI
2. depth imbalance
3. microprice-minus-mid
4. signed taker notional flow

The layer records both all-value sign agreement and directional-only sign agreement. Zero values remain zero and are excluded from directional-only counts.

## Evidence storage

Pairs are append-only NDJSON under:

`derived/cross-venue/replication/{BTCUSD|ETHUSD}/5s/YYYY/MM/DD/HH.ndjson`

The local worker reads finalized Kraken/Coinbase windows incrementally. Duplicate protection is bounded by the relevant output-hour file rather than a forever-growing global pair-ID set.

A compact summary is written to:

`state/cross-venue-replication-summary.json`

## Scientific boundary

This stage is deliberately descriptive:

- `descriptiveOnly=true`
- `crossVenueComparabilityClaim=false`
- `predictiveReplicationClaim=false`
- `predictionInputAuthorized=false`
- no outcome fitting
- no threshold tuning
- no automatic promotion
- no order submission
- no real-money routing
- `actualNetEvAvailable=false`
- no IID significance claim

Observed sign agreement is not evidence of tradable edge by itself. A later phase must preregister the replication hypothesis and preserve Blind Exam separation before examining predictive outcomes.

## Validation

The deterministic fixture suite covers:

- exact same-clock pairing;
- four-feature sign agreement accounting;
- missing-value handling (`null` is unavailable, not zero);
- time-integrity exclusion;
- sparse-feature exclusion;
- instrument/time mismatch rejection;
- append-only worker output;
- replay duplicate suppression without unbounded in-memory pair-ID state.
