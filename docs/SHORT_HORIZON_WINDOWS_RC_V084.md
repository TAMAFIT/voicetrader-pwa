# VoiceTrader Local Edge Lab v0.84 Windows RC

## Purpose

v0.84 packages the stacked Local Edge Lab research runtime for the operator's 24h Windows desktop without weakening the scientific or execution boundaries established through v0.83.

This release candidate is an **installation and observability layer**, not a trading activation release.

## Installation model

The upgrader `scripts/local-node/upgrade-v084-windows.ps1` uses a fail-closed staged switch:

1. require the existing known Local Node installation and Node.js 22+
2. require minimum free disk and public-endpoint TCP/443 reachability
3. download runtime and regression files from one exact immutable Git commit
4. run syntax checks in isolated staging
5. run the local regression suite in staging with no GitHub Actions or cloud runtime dependency
6. scan the staged runtime for forbidden cloud/private-order surfaces and required safety contracts
7. capture existing Scheduled Task XML and stop managed tasks
8. move the current runtime to a timestamped backup
9. switch the staged runtime into place and register/start workers
10. require the live v0.84 health gate to PASS
11. if switch or health fails, restore the prior runtime and prior Scheduled Tasks automatically
12. only after PASS, persist `state/local-edge-lab-v084-config.json` as the installation receipt

Raw and derived research data under the data root are not deleted by rollback.

## New continuously scheduled v0.84 components

- Coinbase public exact-wire + trusted L2/microstructure recorder
- Coinbase provider-time 1s/5s/15s/60s window worker
- Kraken × Coinbase same-time descriptive replication worker
- frozen preregistered cross-venue observation worker
- Learning Stream-only cross-venue scorecard worker

The legacy GMO/Kraken/prospective/evidence/cost/ops/console workers remain present.

## Blind Exam boundary

The following are deliberately **not** Scheduled Tasks:

- Cross-Venue Blind Manifest
- Cross-Venue Blind Reveal
- Cross-Venue Blind Stability

Blind reveal remains a separate manual research gate. The Learning scorecard scans only `derived/cross-venue/preregistered/learning`; it does not read `blind-sealed`.

The v0.84 installation health gate explicitly blocks if the Learning scorecard reports `blindDirectoryRead=true` or `blindResultsConsumed=true`.

## Live health gate

`scripts/local-node/v084-health-gate.mjs` checks the post-switch runtime rather than treating task registration as success.

Required evidence includes:

- Kraken recorder RUNNING and fresh
- Kraken messages received
- at least one trusted checksum with no checksum mismatch
- synchronized Kraken L2 state
- Kraken microprice feature availability
- Kraken provider-time windows written
- Coinbase recorder RUNNING and fresh
- Coinbase messages received
- snapshots for both configured products
- synchronized Coinbase L2 state
- Coinbase derived microstructure availability
- Coinbase provider-time windows written
- cross-venue worker has consumed both Kraken and Coinbase windows
- preregistered worker remains prediction/adaptive-learning disabled
- Learning scorecard remains fresh and blind-isolated
- cloud upload remains disabled throughout

The installation gate does **not** require a cross-venue pair count greater than zero. Pair availability is a research-data property and may legitimately lag even while both pipelines are healthy.

## Safety / scientific state

Always false in this RC:

- `googleCloudEnabled`
- `cloudUploadEnabled`
- `orderSubmission`
- `realMoneyRouting`
- `automaticPromotion`
- cross-venue `predictionInputAuthorized`
- cross-venue adaptive learning authorization
- predictive replication claim
- profitability claim
- `actualNetEvAvailable`

No authenticated Coinbase/GMO private API, exchange order route, actual fill model, observed fee model, or observed slippage model is added.

## Runtime provenance

The final upgrader must pin `RuntimeRef` to one exact 40-hex commit SHA. Branch names are not accepted as runtime pins.

The source branch can continue to advance after a runtime package is pinned; the installation receipt records the exact immutable runtime commit actually installed.

## Status helper

`status-v084-windows.ps1` is read-only. It reports:

- exact installed runtime ref from the installation receipt
- expected Scheduled Task presence/state
- last task result/time when available
- current v0.84 health-gate result
- manual Blind Exam gate status

It never reveals the Blind Exam, places orders, or changes task/runtime state.

## Promotion boundary

At creation of this RC, the durable operator-PC truth remains the previously installed Local Node v0.49 until the v0.84 upgrader is actually executed on that machine and the live health gate passes.

GitHub-side implementation readiness alone is not deployment evidence.

The v0.84 GitHub Actions workflow is `workflow_dispatch` only. It must not be automatically triggered while the operator's Actions-quota hold remains in effect.
