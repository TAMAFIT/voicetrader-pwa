export const HIGHER_TIMEFRAME_REGISTRY_VERSION='higher-timeframe-registry-0.1';
export const HIGHER_TIMEFRAME_COMPONENT_COUNT=6;
export const HIGHER_TIMEFRAME_ALPHA_COUNT=4;
export const HIGHER_TIMEFRAME_GATE_COUNT=2;
export const HIGHER_TIMEFRAME_D1_MIN_BARS=40;
export const HIGHER_TIMEFRAME_HORIZON_BARS=3;

const source=(id,sourceClass,title,locator,scopeNote)=>Object.freeze({id,sourceClass,title,locator,scopeNote});
export const HIGHER_TIMEFRAME_SOURCES=Object.freeze({
  TSM:source('TSM_MOSKOWITZ_OOI_PEDERSEN_2012','academic-primary','Moskowitz, Ooi & Pedersen — Time Series Momentum','SSRN 2089463','Supports general own-return persistence across liquid futures at monthly-scale horizons. VoiceTrader does not transfer published horizons or parameters to BTC 4H/D1.'),
  TECH:source('LO_MAMAYSKY_WANG_2000','academic-primary','Lo, Mamaysky & Wang — Foundations of Technical Analysis','NBER w7613','Supports computational encoding/testing of technical patterns. It does not validate any Wave3 setup or profitability.'),
  BTC_VOL:source('HU_HARDLE_KUO_2019','academic-primary','Hu, Härdle & Kuo — Risk of Bitcoin Market: Volatility, Jumps, and Forecasts','arXiv:1912.05228','Supports treating Bitcoin volatility/jumps as a separate risk process, not a directional forecast.'),
  CANONICAL:source('CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3','canonical-heuristic','Higher-timeframe context with lower-timeframe trigger','transparent practitioner hypothesis','Multi-timeframe construction is a hypothesis to test, not a profitability claim.'),
});

const component=({id,label,role='alpha',archetype,hypothesis,activationSummary,failureModes,sourceIds,gateTarget=null})=>Object.freeze({
  id,label,wave:3,role,archetype,hypothesis,activationSummary,
  failureModes:Object.freeze([...failureModes]),sourceIds:Object.freeze([...sourceIds]),gateTarget,
  instrument:'BTCUSD',decisionTimeframeHours:4,contextTimeframeHours:24,evaluationHorizonBars:HIGHER_TIMEFRAME_HORIZON_BARS,
  contextUsesFullyClosedDailyBarsOnly:true,preRegistered:true,researchOnly:true,activeInChampion:false,activeInLiveForward:false,activeInForward001:false,activeInKnowledgeForward001:false,
  profitabilityClaim:false,optimizedOnObservedSeries:false,scoreIsExpectedReturn:false,scoreIsCalibratedProbability:false,
});

export const HIGHER_TIMEFRAME_REGISTRY=Object.freeze({
  version:HIGHER_TIMEFRAME_REGISTRY_VERSION,
  baseMain:'08f12d3ec50ce859337989aa7d4b942cf6a49319',
  instrument:'BTCUSD',decisionTimeframeHours:4,contextTimeframeHours:24,evaluationHorizonBars:HIGHER_TIMEFRAME_HORIZON_BARS,minCompleteDailyBars:HIGHER_TIMEFRAME_D1_MIN_BARS,
  philosophy:Object.freeze({
    fullyClosedDailyContextOnly:true,partialDailyBarForbidden:true,futureFourHourBarsForbidden:true,
    fixedComponentCount:HIGHER_TIMEFRAME_COMPONENT_COUNT,fixedAlphaCount:HIGHER_TIMEFRAME_ALPHA_COUNT,fixedGateCount:HIGHER_TIMEFRAME_GATE_COUNT,
    generatedCombinations:false,equalActiveAlphaWeighting:true,gateIsNotDirectionalVote:true,
    scoreIsExpectedReturn:false,scoreIsCalibratedProbability:false,rawScoreMinusCost:false,
    optimizer:false,parameterSweep:false,adaptiveWeights:false,selfLearning:false,automaticPruning:false,automaticPromotion:false,
  }),
  sources:HIGHER_TIMEFRAME_SOURCES,
  components:Object.freeze([
    component({id:'HTF_D1_TREND_PULLBACK_001',label:'D1 Trend Pullback + 4H Recovery',archetype:'continuation',hypothesis:'A controlled 4H retracement and recovery may be more informative when it occurs inside a fully closed D1 trend than when the same lower-timeframe shape occurs without higher-timeframe direction.',activationSummary:'Strong D1 trend direction + 4H price near fast MA after retracement + directional recovery candle + non-extreme oscillator.',failureModes:['daily trend transition','deep reversal disguised as pullback','slow daily trend lag','short-horizon trigger noise'],sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','LO_MAMAYSKY_WANG_2000','CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3']}),
    component({id:'HTF_D1_BREAKOUT_ALIGN_001',label:'D1-aligned 4H Breakout',archetype:'breakout',hypothesis:'A fresh 4H structural breakout aligned with fully closed D1 trend direction may be a higher-quality continuation hypothesis than a lower-timeframe breakout against D1 context.',activationSummary:'D1 trend + 4H Donchian break in same direction + adequate 4H trend/participation quality.',failureModes:['false breakout','daily trend exhaustion','venue-volume distortion','late continuation'],sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','LO_MAMAYSKY_WANG_2000','CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3']}),
    component({id:'HTF_D1_MOMENTUM_ALIGN_001',label:'D1 + 4H Momentum Alignment',archetype:'continuation',hypothesis:'Agreement between own-return momentum measured on fully closed D1 bars and current 4H momentum may contain more persistent directional context than either horizon alone.',activationSummary:'D1 ROC6/ROC24 agreement + 4H ROC6/MACD agreement + no severe 4H oscillator extension.',failureModes:['momentum reversal','horizon-transfer risk','correlated indicator redundancy','jump-driven overshoot'],sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3']}),
    component({id:'HTF_D1_RANGE_REVERSION_001',label:'D1 Range + 4H Mean Reversion',archetype:'reversion',hypothesis:'A 4H distribution/oscillator extreme may be a cleaner reversion hypothesis when fully closed D1 context is range-like rather than strongly directional.',activationSummary:'Low D1 ADX/range context + 4H Bollinger stretch + RSI extreme + reversal-side close location.',failureModes:['daily range breaks into trend','structural repricing','persistent crypto momentum','volatility expansion'],sourceIds:['LO_MAMAYSKY_WANG_2000','CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3']}),
    component({id:'HTF_D1_COUNTERTREND_VETO_001',label:'Strong D1 Countertrend Veto',role:'gate',archetype:'context-gate',gateTarget:'entry-opposed-to-strong-d1-trend',hypothesis:'A short-horizon candidate directly opposing a strong fully closed D1 trend should be suppressible as a context gate rather than counted as another directional vote.',activationSummary:'Proposed 4H side directly opposes strong D1 MA/DMI trend.',failureModes:['early major reversal','daily trend lag','countertrend snapback edge'],sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3']}),
    component({id:'HTF_D1_VOL_SHOCK_GATE_001',label:'D1 Volatility Shock Gate',role:'gate',archetype:'risk-gate',gateTarget:'all-wave3-entry',hypothesis:'Extreme fully closed D1 volatility context should be treated as execution/risk uncertainty rather than an automatic directional signal.',activationSummary:'D1 ATR percentile and realized-volatility percentile simultaneously extreme.',failureModes:['profitable high-volatility trend suppressed','percentile-window dependence','jump already completed'],sourceIds:['HU_HARDLE_KUO_2019','CANONICAL_MULTI_TIMEFRAME_CONTEXT_WAVE3']}),
  ]),
});

export function getHigherTimeframeRegistrySnapshot(){return JSON.parse(JSON.stringify(HIGHER_TIMEFRAME_REGISTRY));}
