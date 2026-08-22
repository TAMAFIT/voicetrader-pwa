# VoiceTrader v0.49 — 24h Local Node GMO USDJPY Tick Capture

Status: implementation branch; not merged until required CI is available.

## Goal

Replace the capacity-limited GitHub-stage five-minute GMO quote sampler with a persistent operator-PC collector for high-frequency raw quote research, while preserving the existing v0.40-v0.48 short-horizon contracts and keeping all execution authority closed.

Operator storage root for this deployment:

`X:\XVoiceTraderData`

## Hard cloud-cost boundary

The v0.49 runtime is local-only.

- Google Cloud: **not used**
- Cloud Run: **not used**
- Cloud Storage: **not used**
- Cloud Logging / Monitoring: **not used**
- Pub/Sub: **not used**
- BigQuery: **not used**
- Google SDK / credentials: **not used**
- GitHub Actions: **not required by the running Local Node**
- telemetry upload: **disabled**

The only runtime network destination admitted by the v0.49 collector is the existing GMO Coin Foreign Exchange FX public WebSocket endpoint:

`wss://forex-api.coin.z.com/ws/public/v1`

The Windows installer downloads the runtime files from GitHub once. After installation, market collection does not depend on GitHub or Google Cloud.

## Scope

Phase 1 captures every validated `USD_JPY` public ticker message received over one persistent WebSocket connection.

Each raw record preserves the existing v0.48 quote contract:

- provider source timestamp
- local receive timestamp
- bid
- ask
- mid
- observed quoted spread
- market `OPEN` / `CLOSE`
- explicit no-fill / no-slippage / no-fee / no-swap claims
- execution and real-money routing remain false

The Local Node adds only capture provenance:

- local node ID
- process start time
- connection ID
- sequence number
- received-time UTC hourly storage partition
- immutable-raw marker
- local-only runtime-policy ID

## Storage layout

Raw data is append-only and partitioned by **receive timestamp in UTC**, one NDJSON file per hour:

```text
X:\XVoiceTraderData\
  raw\
    gmo-fx\
      USDJPY\
        YYYY\
          MM\
            DD\
              HH.ndjson
  derived\
  candles\
  research\
  state\
    local-node-config.json
    local-node-health.json
    local-node-last-quote.json
  logs\
    local-node\
      YYYY\
        MM\
          DD.ndjson
  runtime\
```

`raw/` is never rewritten by the collector. Derived features, candles, research products and future compression are separate layers and must never replace the raw source archive.

## Reliability behavior

- persistent WebSocket rather than one-shot subscription
- exponential reconnect delay from 1 second up to 60 seconds
- retry-safe duplicate detection for the latest observed quote
- same quote ID with changed economic content fails closed as a conflict
- Windows Scheduled Task runs as `SYSTEM` at startup
- task restart-on-failure enabled
- health state written every 30 seconds
- free-space warning below 20 GiB
- fail-closed shutdown below 2 GiB free space
- startup state restores the most recently persisted quote for reconnect deduplication

## Scientific boundary

This is quote capture, not a broker fill feed.

- public venue quote only
- no account-specific pricing
- no Private API
- no orders
- no observed fills
- no observed slippage
- no verified fee/swap binding
- no actual Net EV claim

The public FX ticker does not expose the full order book required for genuine order-flow imbalance. USDJPY v0.49 therefore enables quote-microstructure research (spread, quote update intensity, quote momentum, time-boundary behavior) but must not label derived quote pressure as true LOB OFI.

A later crypto Local Node phase can add Kraken trades/order book for genuine OFI, microprice, signed flow and depth research.

## GitHub sampler cutover rule

Do **not** remove or disable the existing v0.48 five-minute GitHub sampler merely because the Local Node code exists.

Cutover requires observed Local Node health first:

1. installer completes on the operator PC;
2. scheduled task is running;
3. `local-node-health.json` is healthy;
4. real raw USDJPY records exist under `raw/gmo-fx/USDJPY`;
5. reconnect/reboot recovery is observed;
6. only then may the five-minute GitHub sampler be changed from scheduled fallback to manual/fallback mode.

This prevents a collection gap during migration.

## Installation

The installer is:

`scripts/local-node/install-windows.ps1`

It creates the storage directories, validates Node.js 22+, downloads the bounded runtime files, registers the startup Scheduled Task, starts the collector and writes a local configuration record.

The installer and runtime never request Google Cloud credentials.
