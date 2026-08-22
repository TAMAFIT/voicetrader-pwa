# VoiceTrader v0.50 — Local Derived Quote Engine

Status: stacked on v0.49 Local Node branch; local tests pass; no GitHub Actions required for runtime.

## Purpose

Turn immutable local GMO USDJPY quote ticks into rebuildable research features without changing or overwriting raw evidence.

Raw remains authoritative under `X:\XVoiceTraderData\raw`. Derived output is explicitly disposable/rebuildable research material under `X:\XVoiceTraderData\derived`.

## Output intervals

- 1 second
- 5 seconds
- 1 minute

Each non-empty bucket records:

- bid / ask / mid OHLC
- spread min / max / mean / close in price units and bps
- quote update count
- bid / ask / mid up/down/flat transition counts
- directional balance for quote changes
- receive latency min / max / mean / close when available
- OPEN/CLOSE quote counts
- UTC and JST bucket context
- 5m / 15m / 60m boundary distance and exact-boundary flags
- raw quote count, first/last quote ID and SHA-256 of source quote IDs

## Scientific semantics

The GMO FX public feed is a best bid/ask ticker, not a full FX order book.

Therefore:

- `quoteDirectionBalanceIsOfi=false`
- `orderBookObserved=false`
- `tradesObserved=false`
- `micropriceAvailable=false`
- derived features are not automatically authorized as decision inputs
- no threshold fitting or automatic promotion is introduced

The quote-direction feature may later be studied as quote pressure/momentum, but must never be presented as true OFI.

## Runtime model

A second Windows startup task, `VoiceTrader-LocalNode-GMO-Derived`, reads only local raw files. It performs no runtime external network calls.

Every 15 seconds it re-processes the most recent five completed minutes. Deterministic bucket IDs make this retry-safe and prevent duplicate derived records. This bounded lookback also repairs short worker outages automatically once raw data is present.

Health:

- `state/derived-gmo-health.json`
- `state/derived-gmo-config.json`

Logs:

- `logs/derived/YYYY-MM-DD.ndjson`

Derived bars:

- `derived/gmo-fx/USDJPY/quote-bars/1s/YYYY/MM/DD/HH.ndjson`
- `derived/gmo-fx/USDJPY/quote-bars/5s/YYYY/MM/DD/HH.ndjson`
- `derived/gmo-fx/USDJPY/quote-bars/1m/YYYY/MM/DD/HH.ndjson`

## Cloud and execution boundary

Runtime policy is fixed:

- Google Cloud: OFF
- cloud upload: OFF
- GitHub Actions required: false
- external network required by derived worker: false
- order submission: false
- real-money routing: false

The one-time Windows upgrader downloads pinned source files from GitHub, then runtime derivation is local-only.

## Next architecture

v0.51 adds a separate Kraken Spot WebSocket v2 raw microstructure collector for BTC/USD and ETH/USD using public `trade` and L2 `book` channels. Raw messages must be preserved before any OFI/microprice derivation. Book synchronization/checksum verification is a mandatory gate before reconstructed-book features are labeled trustworthy.
