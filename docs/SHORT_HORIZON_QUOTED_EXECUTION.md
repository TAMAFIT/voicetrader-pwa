# VoiceTrader v0.61 Quoted Execution Evidence

v0.61 preserves trusted best bid/ask at the close of each checksum-gated Kraken boundary window and freezes the entry bid/ask inside every prospective signal.

For directional outcomes, the future trusted 1-second window supplies the exit quote:

- LONG: enter at observed ask, exit at observed bid.
- SHORT: enter at observed bid, exit at observed ask.

`quotedDirectionalReturnBps` therefore embeds the observed quoted spread at entry and exit. It is not actual net EV: trading fees, slippage, queue position, fill probability, latency and market impact remain unobserved. Midpoint directional return remains separately available for research comparison.

Quoted and midpoint scorecards are stored separately. A midpoint WIN may therefore be a quoted LOSS.

Safety remains unchanged: public market data only, no credentials, no order submission, no real-money routing, no automatic promotion, no Google Cloud upload and no GitHub Actions runtime dependency.
