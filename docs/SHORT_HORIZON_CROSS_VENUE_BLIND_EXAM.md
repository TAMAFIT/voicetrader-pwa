# v0.81-v0.82 Cross-venue Blind Exam protocol

## Before exposure: fixed manifest

The Blind Exam cannot be opened record-by-record. Before any result access, the manifest requires four fixed strata:

- BTCUSD / BOUNDARY_PRIMARY: 100 sealed observations
- BTCUSD / PHASE_CONTROL: 100
- ETHUSD / BOUNDARY_PRIMARY: 100
- ETHUSD / PHASE_CONTROL: 100

Selection is chronological then observation ID within each stratum. The selected 400 observation IDs are hashed into an immutable selection fingerprint. Selection uses no venue decisions, sign agreement, returns, or other result values.

If any stratum is short, status is `NOT_READY` and no examination selection is produced.

## Exposure

Once a READY manifest is deliberately examined, v0.82 reconstructs all 400 observations from immutable source pair evidence in one batch.

There is no sequential peek and no top-up after seeing results.

Every selected record is immediately marked `RETIRED_EXPOSED` and becomes permanently ineligible for future Blind Exam use.

## Minimum directional evidence

The frozen post-reveal descriptive gate requires at least 200 directional pairs across the fixed 400-record cohort.

If fewer than 200 directional pairs exist, the batch status is `BLIND_INSUFFICIENT_DIRECTIONAL_PAIRS`. The same cohort still remains exposed and retired; the system does not add more observations to rescue the result.

## After exposure

Exposed records may be used for postmortem analysis, but they do not automatically become adaptive training inputs. This preserves separation between examination, explanation, and any future learning-policy decision.

The reveal report remains descriptive only:

- no IID significance claim
- no predictive-performance claim
- no profitability claim
- no automatic promotion
- no execution authorization
- no real-money routing
- no order submission
- actual Net EV unavailable

The operator PC deployment state remains independent from GitHub RC state.
