# v0.79 Cross-venue preregistration and Blind sealing

## Frozen hypothesis

Before any operator-PC Coinbase capture or cross-venue predictive outcome evaluation, v0.79 freezes:

- hypothesis ID: `CROSS_VENUE_BOUNDARY_SIGNAL_REPLICATION_V1`
- input window: 5 seconds
- instruments: BTCUSD, ETHUSD
- feature families: normalized OFI, depth imbalance, microprice-minus-mid, signed taker flow
- per-venue decision rule: frozen 3-of-4 directional concordance
- boundary eligibility: existing 10 seconds before / 5 seconds after 5m, 15m, or 60m boundaries
- phase controls: fixed 5-minute interior offsets 140, 145, 150, 155 seconds
- Blind Exam assignment: existing deterministic 20% epoch partition
- minimum Blind directional pairs before descriptive Blind evaluation: 200

The spec has a SHA-256 fingerprint so later code can prove which rule generated an observation.

## Primary comparison

The preregistered primary comparison is:

`BOUNDARY_MINUS_PHASE_CONTROL_DIRECTIONAL_DECISION_AGREEMENT`

This is a replication test of signal structure, not yet a profitability test.

## Blind behavior

Partition assignment depends only on the canonical instrument, fixed window size, and window start identifier through the existing deterministic Blind epoch. It does not depend on feature signs or later outcomes.

For `LEARNING_STREAM` observations, the worker may persist the full contemporaneous replication observation.

For `BLIND_EXAM` observations, the normal worker persists only a sealed record:

- pair identity and provenance remain;
- evaluation partition remains;
- sample role remains;
- `venueDecisions=null`;
- `replication=null`;
- `blindState.status=SEALED`;
- result exposure is false;
- learning eligibility is false.

The preregistration worker does not persist or aggregate Blind results. A later explicit examination phase must reread immutable source evidence, reveal the designated Blind records, and retire those exposed questions from future Blind use.

## Governance

- existing Kraken frozen experiment is unchanged;
- no threshold fitting;
- no feature-weight fitting;
- no adaptive learning from cross-venue observations;
- no prediction-input authorization;
- no automatic promotion;
- no execution authorization;
- no real-money routing;
- no order submission;
- actual Net EV unavailable.

The operator PC remains a separate deployment truth. GitHub RC availability does not mean v0.79 is installed or collecting live data.
