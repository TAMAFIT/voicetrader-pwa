# VoiceTrader Short-Horizon Deployability Discovery — v0.46

Status: provider-reference architecture receipt  
Verified public facts: 2026-08-20  
Target: USDJPY short-horizon research -> Japan-usable executable venue path

## Decision goal

VoiceTrader already has immutable prospective signals, matured outcomes and non-binding break-even cost evidence. The next question is not whether a strategy looks good on research candles, but whether the same research can eventually be evaluated against a venue that a Japan-resident operator can actually use programmatically.

v0.46 deliberately stops before account authentication, executable quote collection or order submission. It establishes an official-provider reference and a safe cost/readiness bridge only.

## Architecture discovery receipt

Architecture significance: **required** — new external provider interface and future execution trust boundary.

Searched source classes:

1. `existing_voicetrader` — no existing provider/deployability registry or executable-venue cost binding was found.
2. `provider_reference` — OANDA Japan official product/API pages and OANDA official v20 developer reference were reviewed.
3. `custom_build` — used only for the small VoiceTrader-specific immutable bridge between existing v0.45 evidence and the official provider reference.

Disposition:

- **REUSE** — immutable outcome/cost evidence, generated-data-branch pattern, fail-closed identity/immutability rules, execution guardrails.
- **ADOPT** — OANDA v20 REST/pricing-stream/order resource model as the provider reference architecture rather than inventing a proprietary broker protocol.
- **ADAPT** — v0.45 break-even evidence into a published-spread reference comparison while preserving `netReturnAvailable=false`.
- **BUILD** — a small frozen deployability registry, reference assessment contract, generated archive and manifest.
- **DEFER** — authenticated provider connection, live/practice quote capture, observed spread/slippage, Secret binding, order routing and real-money execution.

Rejected approaches:

- Treating Dukascopy BID research candles as executable OANDA prices — rejected because venue and bid/ask semantics differ.
- Subtracting the published 0.8-sen spread and calling the remainder Net EV — rejected because actual OANDA bid/ask, slippage, fills and financing/swap are not observed.
- Adding an OANDA access token to GitHub Actions or repository configuration — rejected by Secret boundary.
- Using a third-party OANDA SDK as a new runtime dependency in v0.46 — unnecessary; the official HTTP/stream API is sufficient as the reference architecture.
- Enabling order submission merely because the provider API supports orders — provider capability is not VoiceTrader execution authority.

## Official provider facts frozen for this reference

The following facts are mutable provider facts and must be reverified before any authenticated integration or actual-cost binding.

### Japan provider / regulation reference

OANDA証券株式会社 publicly identifies itself as a Japanese financial instruments business operator with registration `関東財務局長（金商）第2137号`.

Official evidence:

- https://www.oanda.jp/company/disclosure

This project records that as a provider-reference fact. It is not a general legal opinion about any future strategy or account use.

### Japan REST API eligibility reference

OANDA Japan states that its offered API is REST API and currently requires all of the following for use:

- Gold membership status or higher
- NY-server account balance of at least JPY 250,000
- pro course
- agreement to the API contract
- sufficient programming knowledge

OANDA Japan also states that API use on a demo account still requires a live OANDA Japan account and the API eligibility conditions.

Official evidence:

- https://www.oanda.jp/platform/api
- https://help.oanda.jp/oanda/faq/show/720?site_domain=default
- https://help.oanda.jp/oanda/faq/show/808?site_domain=default

VoiceTrader does not know whether the operator currently satisfies these conditions. v0.46 therefore freezes `operatorEligibilityStatus=UNVERIFIED`.

### USDJPY pro-course product reference

OANDA Japan currently publishes for the NY-server pro course:

- USD/JPY spread reference: 0.8 sen, fixed in principle with exceptions
- API trading available
- minimum trade size: 1 currency unit
- maximum order-size reference: 3,000,000 units, subject to instrument/product conditions

Official evidence:

- https://www.oanda.jp/fx/pro
- https://www.oanda.jp/account_type

The 0.8-sen value is a published product reference, not an observed executable spread. OANDA also warns that spreads can widen under market conditions.

### Official v20 API architecture reference

OANDA's official v20 developer reference provides:

- practice REST base: `https://api-fxpractice.oanda.com`
- live REST base: `https://api-fxtrade.oanda.com`
- corresponding practice/live streaming bases
- account pricing stream with bid/ask liquidity buckets
- pricing stream capped at at most four prices per second per requested instrument, with heartbeats every five seconds
- M1 and M5 candlestick granularities
- bid, ask and midpoint candle components
- account order creation through `POST /v3/accounts/{accountID}/orders`, including market and limit order examples

Official evidence:

- https://developer.oanda.com/rest-live-v20/development-guide/
- https://developer.oanda.com/rest-live-v20/pricing-ep/
- https://developer.oanda.com/rest-live-v20/instrument-df/
- https://developer.oanda.com/rest-live-v20/order-ep/

For 1m/5m research this is a credible provider-reference data/execution architecture. The documented pricing stream is **not** a full tick feed and therefore should not be treated as suitable evidence for sub-250ms microstructure/HFT research.

## v0.46 reference cost semantics

The current USDJPY outcome uses a Dukascopy BID research entry close. v0.46 converts the published OANDA pro spread from sen to price units:

`0.8 sen = 0.008 JPY per USD`

For descriptive comparison only:

`publishedReferenceSpreadCostBps = 0.008 / frozenResearchEntryPrice * 10,000`

This is a static single-spread-equivalent reference. It is useful for answering whether a positive gross directional outcome had even enough magnitude to cover the *published reference spread alone*.

It does **not** establish actual round-trip cost because:

1. the research venue is Dukascopy while the candidate execution venue is OANDA;
2. OANDA executable bid/ask was not captured at the decision/exit timestamps;
3. actual spread can differ from the published reference;
4. slippage and fill behavior are unknown;
5. overnight financing/swap is not modeled where relevant.

Therefore all v0.46 assessments retain:

- `bindingStatus=PUBLISHED_REFERENCE_ONLY`
- `actualSpreadObserved=false`
- `actualRoundTripCostBps=null`
- `slippageModeled=false`
- `financingOrSwapModeled=false`
- `executionFillModeled=false`
- `netReturnAvailable=false`
- `profitabilityClaim=false`

## Provider capability versus VoiceTrader authority

The registry may truthfully record that OANDA's official API supports programmatic orders. That does **not** authorize VoiceTrader to submit one.

v0.46 remains:

- `providerConnectionAttempted=false`
- `credentialsPresent=false`
- `executionAuthorized=false`
- `realMoneyRouting=false`
- `orderSubmission=false`

## Generated evidence

Generated branch: `short-horizon-deployability-data`.

Daily assessments:

`data/short-horizon-deployability/fx/USDJPY/<TIMEFRAME>m/YYYY/MM/YYYY-MM-DD.ndjson`

Manifest:

`data/short-horizon-deployability/manifest.json`

The collector reads `short-horizon-outcome-data` and `short-horizon-cost-analysis-data` read-only and runs hourly. It evaluates USDJPY only in v0.46; BTC/ETH execution-provider selection remains unresolved rather than being silently mapped to OANDA.

## Human boundary and next stage

No human action is required to complete v0.46.

A later authenticated OANDA stage has a genuine provider/account boundary: the operator must actually have an eligible OANDA Japan account/API entitlement and a personal access token must be stored through an approved Secret mechanism. The token must never be pasted into chat, Git, Issues, PRs or logs.

After that boundary is satisfied, the safe sequence is:

1. authenticated read-only practice pricing connection;
2. capture account-specific OANDA USD_JPY bid/ask and timestamps;
3. compare research signal time to executable-venue quote time and measure quote divergence/latency;
4. derive observed spread and paper-fill evidence;
5. only then expose actual cost-adjusted paper Net EV;
6. keep order submission disabled until a separate explicit execution gate.
