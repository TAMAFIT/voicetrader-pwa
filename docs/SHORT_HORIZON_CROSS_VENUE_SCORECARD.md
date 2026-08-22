# v0.80 Learning-only cross-venue scorecard

## Scope

v0.80 evaluates only preregistered `LEARNING_STREAM` cross-venue observations. It does not inspect the Blind result directory.

The worker source root is fixed to:

`derived/cross-venue/preregistered/learning`

The sibling `blind-sealed` directory is not traversed by the normal scorecard worker.

## Metrics

For each instrument and preregistered sample role (`BOUNDARY_PRIMARY`, `PHASE_CONTROL`), the scorecard tracks:

- eligible observations
- directional-pair count and rate
- all-decision agreement rate
- directional-decision agreement rate
- mean feature-sign agreement rate
- mean directional-feature-sign agreement rate

The frozen primary descriptive comparison is boundary minus phase-control directional-decision agreement. Secondary deltas include all-decision agreement, feature-sign agreement, and directional-pair rate.

Missing values remain missing. `null` is not coerced to zero.

## Blind safety

The scorecard core rejects a `BLIND_EXAM` observation if full `venueDecisions` or `replication` results are present. Sealed Blind references are counted only by the standalone core if explicitly supplied, but the production worker does not read the Blind directory at all.

Normal scorecard output states:

- `learningStreamOnly=true`
- `blindResultsConsumed=false`
- `blindResultsExposed=false`
- `descriptiveOnly=true`
- `noIidSignificanceClaim=true`
- `noPredictivePerformanceClaim=true`
- `noProfitabilityClaim=true`

## Research boundary

This scorecard cannot authorize:

- threshold changes
- adaptive learning
- promotion of a model/strategy
- prediction-input use of Coinbase
- execution
- real-money routing
- order submission
- actual Net EV claims

Blind evaluation requires a separate explicit examination protocol with irreversible retirement of exposed Blind records.
