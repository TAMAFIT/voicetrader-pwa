# VoiceTrader v0.47 — OANDA v20 Hard Read-Only Adapter Foundation

Status: code foundation only; no provider connection attempted  
Provider reference verified: 2026-08-20

## Purpose

v0.46 established that OANDA Japan is a plausible Japan-domestic API execution-provider reference for USDJPY and that the official v20 API exposes account pricing, pricing streams and order resources. v0.47 prepares the **read-only quote side** of that integration so the next authenticated experiment can measure account-specific bid/ask, spread and timing without granting VoiceTrader any order authority.

This phase does not require or contain a real OANDA account ID or personal access token.

## Architecture disposition

- **REUSE** — v0.46 provider registry, Secret boundary, execution guardrails.
- **ADOPT** — official v20 current-pricing and pricing-stream HTTP semantics.
- **BUILD** — a tiny native-JavaScript read-only client and normalized executable-quote observation contract.
- **DEFER** — actual Secret binding, authenticated connection, persistent quote collector, research/quote matching, slippage/fill simulation and every order mutation surface.

No third-party OANDA SDK is added. Native `fetch`, Web Streams and JSON line parsing are sufficient for the current scope and reduce dependency/supply-chain surface.

## Allowed provider surfaces

The adapter has an explicit allowlist:

- `GET /v3/accounts/{accountID}/pricing`
- `GET /v3/accounts/{accountID}/pricing/stream`

Every non-GET method is rejected before a request is built. Paths outside the allowlist are rejected, including order, trade and position mutation surfaces.

The provider itself supports order APIs, but that fact remains metadata only. Provider capability is not VoiceTrader authority.

## Credential handling

The client constructor accepts an account ID and bearer token at runtime. They are captured only inside the client closure needed to make authenticated requests.

The returned metadata object intentionally contains no token value and no account ID value. It records only that an account identifier and in-memory bearer credential are present.

v0.47 adds:

- no GitHub Secret
- no `.env` file
- no token constant
- no scheduled authenticated workflow
- no account identifier in repository data

A real token must never be committed to Git or pasted into ChatGPT, Issues, PRs or CI logs.

## Current pricing observation

`fetchCurrentUsdJpyQuote()` calls the official account pricing endpoint for `USD_JPY` and normalizes the response into `short-horizon-executable-quote-v1`.

For robustness, best bid is selected as the highest bid bucket and best ask as the lowest ask bucket instead of assuming bucket ordering.

The normalized record contains:

- provider/environment/instrument
- provider source timestamp
- local receive timestamp
- receive-minus-source timing observation
- best bid/ask and liquidity
- midpoint
- observed bid/ask spread in price units and bps
- tradeable flag

A practice quote is marked as a practice observation, not a live executable quote. A live account-specific tradeable price may be marked as a live quote observation, but still does not establish a fill, slippage or completed round-trip cost.

## Pricing stream

`streamUsdJpyPrices()` uses the official streaming base URL and consumes newline-delimited JSON from the chunked response. It separates price records and heartbeats, normalizes price records through the same quote contract, and returns only descriptive counts when the stream ends.

There is no reconnect loop, persistence layer or scheduled runtime in v0.47. Those belong after the account/Secret boundary and after a first controlled practice connection succeeds.

The official provider reference notes that the pricing stream delivers at most four prices per second per instrument. This is adequate as an executable-quote reference for 1m/5m research, but it is not a complete tick feed and must not be presented as sub-250ms microstructure evidence.

## What an observed quote does and does not prove

An authenticated OANDA bid/ask observation can eventually remove one major uncertainty from v0.46: the system can know the account-specific OANDA spread at the observation instant instead of relying only on the published 0.8-sen reference.

It still does not prove:

- the price at which an order would fill
- slippage
- latency from signal decision to accepted order
- partial-fill behavior
- financing/swap over longer holds
- realized round-trip transaction cost
- positive Net EV

Therefore the quote contract keeps:

- `fillObserved=false`
- `slippageObserved=false`
- `roundTripCostObserved=false`
- `financingOrSwapObserved=false`
- `netReturnAvailable=false`
- `executionAuthorized=false`
- `orderSubmission=false`

## Test strategy

CI uses only injected mock transport and fake credentials. Tests verify:

- practice current-pricing normalization
- best bid/ask selection
- spread calculation
- stream parsing across arbitrary chunk boundaries
- heartbeat handling
- token omission from metadata and errors
- GET-only/path-allowlist enforcement
- rejection of order/trade/position surfaces
- no scheduled authenticated OANDA collector exists in this phase
- all prior v0.46-v0.39 guardrails remain intact

## Human boundary after v0.47

After this foundation is merged, the next meaningful step requires external account state that VoiceDev cannot manufacture:

1. an OANDA Japan live account exists;
2. API eligibility conditions are actually satisfied;
3. an API personal access token is issued;
4. account ID and token are bound through an approved Secret mechanism outside Git/chat.

Once those conditions are true, the first authenticated run should be **practice read-only pricing only**. No order API should be enabled.

The subsequent evidence sequence is:

1. observe practice account bid/ask and stream timing;
2. verify stable ingestion and Secret hygiene;
3. optionally observe live read-only prices if explicitly authorized;
4. match OANDA quotes to immutable VoiceTrader decision timestamps;
5. quantify Dukascopy-vs-OANDA quote divergence and actual observed spread;
6. add paper-fill assumptions and latency/slippage evidence;
7. only then expose cost-adjusted paper Net EV;
8. order submission remains a separate later gate.

## Official provider reference

- https://www.oanda.jp/platform/api
- https://help.oanda.jp/oanda/faq/show/720?site_domain=default
- https://help.oanda.jp/oanda/faq/show/808?site_domain=default
- https://developer.oanda.com/rest-live-v20/development-guide/
- https://developer.oanda.com/rest-live-v20/pricing-ep/
- https://developer.oanda.com/rest-live-v20/pricing-df/
