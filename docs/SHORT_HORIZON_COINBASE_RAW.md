# v0.74 Coinbase Public Raw Capture

## Purpose
Add a second independent crypto venue to the Local Edge Lab for later cross-venue robustness checks without changing any frozen prediction rule or promoting cross-venue data into decision inputs.

## Architecture discovery
Official Coinbase Advanced Trade WebSocket documentation was reverified on 2026-08-22 before implementation.

Adopted public endpoint:
- `wss://advanced-trade-ws.coinbase.com`

Unauthenticated public subscriptions used:
- `level2` for BTC-USD and ETH-USD
- `market_trades` for BTC-USD and ETH-USD
- `heartbeats` to keep subscriptions alive

Coinbase documents these channels as not requiring authentication. Coinbase also documents `level2` as the easiest synchronized-book channel and says it guarantees delivery of updates. v0.74 deliberately does **not** convert that provider statement into a VoiceTrader claim that local reconstruction has been verified.

## v0.74 boundary
This phase stores provider messages before interpretation:
- exact provider text preserved byte-for-byte inside RFC 7464 JSON Text Sequence framing
- parallel NDJSON metadata stores local receive time, connection ID, local message sequence, SHA-256, channel classification, products, provider timestamp and observed `sequence_num`
- hourly UTC partitions under `raw/coinbase/advanced-trade/YYYY/MM/DD/`
- health state under `state/coinbase-microstructure-health.json`
- exponential reconnect 1s -> 60s
- disk warning below 50 GiB free and fail-closed stop below 10 GiB free

Explicitly deferred:
- local Coinbase L2 reconstruction
- provider sequence continuity certification
- OFI, imbalance, microprice or signed-flow derivation
- Kraken/Coinbase normalization or cross-venue comparability claims
- use as prediction input
- outcome-driven fitting
- authenticated channels, user data or orders

## Scientific role
Kraken remains the existing microstructure feature source. Coinbase v0.74 is an independent raw evidence source only. Any later cross-venue robustness test must first define venue-specific integrity semantics and preregister the comparison before looking at prospective outcome differences.

## Runtime / safety
- no API key or JWT
- public market data only
- Google Cloud OFF
- cloud upload OFF
- GitHub Actions not required by runtime
- `predictionInputAuthorized=false`
- `orderSubmission=false`
- `realMoneyRouting=false`
- `automaticPromotion=false`
- no profitability claim
