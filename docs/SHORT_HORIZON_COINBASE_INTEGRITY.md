# v0.75 Coinbase L2 Integrity

## Goal
Turn v0.74 Coinbase raw evidence into a locally verifiable order-book integrity state without yet producing microstructure features or prediction inputs.

## Official semantics reverified 2026-08-22
Coinbase Advanced Trade documents `level2` as a public unauthenticated market-data channel and states that it guarantees delivery of updates. Level2 messages use `l2_data` responses with `sequence_num`, `snapshot` / `update` events, product ID, and absolute quantity updates. `new_quantity` is the replacement quantity at a price level, not a delta; zero removes the level.

The implementation also follows Coinbase's documented sequence-number guidance: a gap indicates dropped data and requires recovery rather than silently continuing a local book.

## Trust contract
A local Coinbase book becomes trusted only after:
1. a valid snapshot for the product;
2. valid bid and offer sides with positive prices and nonnegative quantities;
3. non-crossed best bid / offer;
4. subsequent `l2_data` sequence numbers remain strictly consecutive.

Fail-closed states include:
- malformed JSON or invalid sequence;
- update before snapshot;
- sequence gap;
- sequence out of order;
- unsupported L2 event type;
- malformed level;
- incomplete book;
- crossed book.

Any fail-closed integrity state requires reconnect. The recorder discards the in-memory tracker on reconnect so a new snapshot is required.

## Storage
Raw v0.74 wire remains immutable and authoritative. v0.75 adds derived integrity evidence under:
- `derived/coinbase/book-integrity/YYYY/MM/DD/HH.ndjson`

Health may claim `orderBookSynchronizationVerified=true` only when **both** configured products (`BTC-USD`, `ETH-USD`) currently have trusted books. It may claim provider sequence continuity only after at least one trusted update and no observed gap/out-of-order event in the active runtime state.

## Deliberately not implemented
- OFI
- depth imbalance
- microprice
- signed taker flow
- Coinbase/Kraken feature normalization
- cross-venue replication score
- prediction input authorization
- fitting or threshold changes

## Governance
- exact raw provider text preserved
- observation only
- `derivedMicrostructureAuthorized=false`
- `predictionInputAuthorized=false`
- automatic promotion false
- order submission false
- real-money routing false
- Google Cloud / cloud upload false
