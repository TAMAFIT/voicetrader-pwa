# VoiceTrader v0.48 — GMO FX Public Quote / Paper Execution

Status: architecture-discovery-approved implementation scope

## Architecture discovery

Task facts: new external interface, new generated persistence domains, new paper-execution evidence path.

Disposition:

- REUSE: immutable prospective signal records, v0.47 quote-time/spread concepts, generated-data branch pattern, fail-closed archive conflicts, short-horizon governance.
- ADOPT: GMO Coin Foreign Exchange FX official Public WebSocket v1 protocol for USD_JPY ticker observations.
- ADAPT: account-specific executable-quote concepts into a distinct public-venue quote contract; public quotes are never labeled account-specific or observed fills.
- BUILD: bounded public WebSocket sampler, public quote archive, signal-to-quote paper matcher and paper archive.
- DEFER: continuous 24h WebSocket capture until Local Node, authenticated GMO Private API, real order routing, observed fill/slippage evidence, fee/swap binding.

## Official provider contract verified 2026-08-20

Official GMO Coin Foreign Exchange FX API documentation states:

- Public API is authentication-free.
- Public WebSocket base endpoint is `wss://forex-api.coin.z.com/ws/public`, current version `v1`.
- USD_JPY ticker subscription uses `{ "command":"subscribe", "channel":"ticker", "symbol":"USD_JPY" }`.
- Ticker response contains `ask`, `bid`, `timestamp`, and FX `status` (`OPEN` / `CLOSE`).
- Public WebSocket subscribe/unsubscribe requests are limited to one per second per IP.

Evidence: https://api.coin.z.com/fxdocs/

## Scientific boundary

GMO public ticker is a venue quote observation and a stronger paper-execution proxy than a Dukascopy candle close, but it is not an observed fill.

- `accountSpecificPricing=false`
- `fillObserved=false`
- `slippageObserved=false`
- `roundTripFeeObserved=false`
- `financingOrSwapObserved=false`
- `actualNetEvAvailable=false`

Paper execution uses side-correct quotes:

- LONG entry = ask, LONG exit = bid
- SHORT entry = bid, SHORT exit = ask

This embeds observed quoted spread into the simulated return. It does not add unobserved slippage, API-order fees, swap, rejection or queue/fill effects.

## GitHub-stage collection

Until the operator's 24h Local Node exists, GitHub Actions samples one current USD_JPY public WebSocket ticker every five minutes. The provider sends a latest rate after subscription, so each run disconnects after one validated ticker.

This is sampling, not continuous tick capture. Source and receive timestamps are both retained. The Local Node can later replace the sampler with a persistent WebSocket process without changing the quote contract.

Generated branches:

- `short-horizon-gmo-quote-data`
- `short-horizon-gmo-paper-data`

## Paper matching

Only genuinely prospective USDJPY signals are eligible. For each signal/horizon:

- choose the first OPEN GMO quote at or after `signal.generatedAtMs`, within the entry tolerance;
- choose the first OPEN GMO quote at or after the target timestamp, within the exit tolerance;
- if either quote is unavailable, do not fabricate a paper result;
- WAIT remains observation-only;
- results are immutable and keyed by signal + horizon.

The record retains entry/exit quote timestamps and delays so GitHub scheduler latency is visible.

## Safety

- no account required
- no API key or Secret
- no Private API
- no POST/order route
- no real-money routing
- no automatic strategy promotion
- no profitability claim
