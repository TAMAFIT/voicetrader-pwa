# VoiceTrader v0.51-v0.53 — Local Kraken Microstructure Lab

Status: stacked development branch; runtime is local-only; no GitHub Actions required.

## Goal

Extend the 24h Local Node from GMO USDJPY quote observation into public crypto microstructure capture and checksum-gated derived evidence for BTC/USD and ETH/USD.

## v0.51 Raw wire capture

Provider: Kraken Spot WebSocket v2 public endpoint `wss://ws.kraken.com/v2`.

Subscriptions:

- `trade` — BTC/USD, ETH/USD
- `book` — BTC/USD, ETH/USD, L2 depth 10 with snapshots

No authentication, private channel, account data or order method is used.

Every inbound provider JSON message is preserved exactly using RFC 7464 JSON Text Sequence framing. A parallel metadata file stores local sequence, connection ID, receive time, byte length and SHA-256 of the exact provider text.

Raw paths:

- `raw/kraken/spot-v2/YYYY/MM/DD/HH.wire.jsonseq`
- `raw/kraken/spot-v2/YYYY/MM/DD/HH.meta.ndjson`

This preserves source number tokens for later checksum replay instead of reserializing floats.

## v0.52 Book integrity gate

Kraken L2 book messages carry a CRC32 checksum over the top 10 asks and bids. VoiceTrader maintains the local depth-10 book and checks the provider checksum after each snapshot/update.

The implementation is validated against Kraken's official v2 checksum example; expected and locally calculated checksum are both `3310070434`.

On checksum mismatch:

- the raw message is retained;
- mismatch evidence is written;
- the book is marked untrusted;
- the WebSocket connection is closed and reconnected to force a fresh snapshot;
- no OFI/microprice feature is emitted from the failed message.

Integrity evidence:

- `derived/kraken/book-integrity/YYYY/MM/DD/HH.ndjson`

## v0.53 Trusted microstructure evidence

Only book messages that pass the checksum gate may produce book microstructure records.

Book features:

- best bid / ask and quantities
- spread and spread bps
- mid price
- microprice
- microprice minus mid
- top-1 book imbalance
- depth-10 aggregate book imbalance
- top-of-book event OFI using the Cont-style bid/ask event contribution rule

OFI sign convention:

- positive = buy pressure
- negative = sell pressure

Trade features use Kraken's public trade channel, whose side represents the taker side:

- trade price and quantity
- signed quantity: taker BUY positive, taker SELL negative
- notional and signed notional
- provider trade ID and timestamp

Microstructure output:

- `derived/kraken/microstructure/BTCUSD/YYYY/MM/DD/HH.ndjson`
- `derived/kraken/microstructure/ETHUSD/YYYY/MM/DD/HH.ndjson`

## Research boundary

These features are observational evidence only.

- `predictionInputAuthorized=false`
- no Human Canon thresholds are changed
- no optimization or parameter sweep
- no automatic promotion
- no real-money routing
- no profitability claim

The next research phase should aggregate trusted event evidence into fixed 1s/5s/15s/60s windows, add clock-boundary context, and preregister prospective boundary × OFI hypotheses before testing future outcomes.

## Capacity and cloud boundary

Local storage root: `X:\XVoiceTraderData`.

Kraken recorder disk policy:

- warning below 50 GiB free
- fail-closed stop below 10 GiB free

Runtime policy:

- Google Cloud: OFF
- cloud upload: OFF
- GitHub Actions required: false
- public Kraken WebSocket only for Kraken runtime
- public GMO FX WebSocket only for GMO raw runtime
- derived GMO worker has no runtime external network dependency
