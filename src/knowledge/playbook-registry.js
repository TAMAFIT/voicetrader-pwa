export const HUMAN_PLAYBOOK_REGISTRY_VERSION = 'human-playbook-registry-0.1';

const source = (id, sourceClass, title, locator, scopeNote) => Object.freeze({ id, sourceClass, title, locator, scopeNote });

export const HUMAN_PLAYBOOK_SOURCES = Object.freeze({
  TSM: source(
    'TSM_MOSKOWITZ_OOI_PEDERSEN_2012',
    'academic-primary',
    'Moskowitz, Ooi & Pedersen — Time Series Momentum',
    'SSRN 2089463',
    'Supports the general hypothesis that an asset’s own past returns can contain trend/momentum information. It does not validate these BTC/USD 4H thresholds.'
  ),
  TECH_PATTERN: source(
    'LO_MAMAYSKY_WANG_2000',
    'academic-primary',
    'Lo, Mamaysky & Wang — Foundations of Technical Analysis',
    'NBER w7613 / Journal of Finance',
    'Supports systematic computational encoding and testing of technical patterns. It does not validate any individual playbook here.'
  ),
  BTC_VOL: source(
    'HU_HARDLE_KUO_2019',
    'academic-primary',
    'Hu, Härdle & Kuo — Risk of Bitcoin Market: Volatility, Jumps, and Forecasts',
    'arXiv:1912.05228',
    'Supports treating Bitcoin volatility/jumps as a distinct risk/regime process rather than a directional vote.'
  ),
  CANONICAL: source(
    'CANONICAL_TRADING_HEURISTICS_WAVE2',
    'canonical-heuristic',
    'Common trend, breakout, pullback, mean-reversion and rejection heuristics',
    'practitioner canon / explicit rule translation',
    'These are codified hypotheses to test, not claims of profitability or academic validation.'
  ),
});

const item = ({ id, label, archetype, role='alpha', hypothesis, intendedRegimes, requiredInputs, activationSummary, failureModes, sourceIds, scoreMeaning='bounded directional setup-strength score', gateTarget=null }) => Object.freeze({
  id,
  label,
  wave: 2,
  role,
  archetype,
  hypothesis,
  intendedRegimes:Object.freeze([...intendedRegimes]),
  requiredInputs:Object.freeze([...requiredInputs]),
  activationSummary,
  failureModes:Object.freeze([...failureModes]),
  sourceIds:Object.freeze([...sourceIds]),
  scoreMeaning,
  gateTarget,
  preRegistered:true,
  researchOnly:true,
  activeInChampion:false,
  activeInLiveForward:false,
  activeInForwardEvidence:false,
  profitabilityClaim:false,
  optimizedOnObservedSeries:false,
});

export const HUMAN_PLAYBOOK_REGISTRY = Object.freeze({
  version: HUMAN_PLAYBOOK_REGISTRY_VERSION,
  frozenAtBaseMain: '973d1da9a4354ebd743691197152b2870d092ca7',
  instrument: 'BTCUSD',
  timeframeHours: 4,
  evaluationHorizonBars: 3,
  philosophy: Object.freeze({
    setupNotIndicatorZoo: true,
    regimeRouted: true,
    inactiveOutsideIntendedContext: true,
    equalArchetypeNormalization: true,
    scoreIsExpectedReturn:false,
    scoreIsCalibratedProbability:false,
    optimizer:false,
    parameterSweep:false,
    adaptiveWeights:false,
    selfLearning:false,
    automaticPruning:false,
    automaticPromotion:false,
  }),
  sources: HUMAN_PLAYBOOK_SOURCES,
  items: Object.freeze([
    item({
      id:'PB_TREND_PULLBACK_001', label:'Trend Pullback Continuation', archetype:'continuation',
      hypothesis:'In an established, reasonably efficient trend, a controlled retracement toward the fast trend reference followed by renewed directional pressure may offer better continuation timing than chasing an extended price.',
      intendedRegimes:['trend'],
      requiredInputs:['MA alignment/slope','ATR distance','RSI','ROC6','efficiency ratio','close location'],
      activationSummary:'Trend regime + directional MA structure + price near fast MA + non-extreme momentum + directional candle recovery.',
      failureModes:['trend transition','deep reversal disguised as pullback','high-volatility liquidation cascade','slow MA lag'],
      sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_TREND_BREAKOUT_001', label:'Trend Breakout Continuation', archetype:'breakout',
      hypothesis:'A Donchian-style range break aligned with an existing directional trend and sufficient trend strength may contain continuation information.',
      intendedRegimes:['trend'], requiredInputs:['Donchian channel','DMI/ADX','MA alignment','market structure','efficiency ratio'],
      activationSummary:'Fresh channel break + ADX/trend alignment + structure/efficiency confirmation.',
      failureModes:['false breakout','late trend exhaustion','thin participation','violent mean reversion'],
      sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','LO_MAMAYSKY_WANG_2000','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_VOLUME_BREAKOUT_001', label:'Volume-confirmed Breakout', archetype:'breakout',
      hypothesis:'A fresh range break with above-normal participation and confirming OBV direction may be more informative than an unconfirmed price-only break.',
      intendedRegimes:['trend','range','compression'], requiredInputs:['Donchian channel','volume z-score','OBV slope','ROC6'],
      activationSummary:'Channel break + positive participation shock + OBV aligned with break direction.',
      failureModes:['exchange-specific volume distortion','news spike reversal','wash activity','delayed volume response'],
      sourceIds:['LO_MAMAYSKY_WANG_2000','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_SQUEEZE_EXPANSION_001', label:'Volatility Squeeze Expansion', archetype:'breakout',
      hypothesis:'A transition from unusually compressed Bollinger width into expanding width with directional return pressure may identify the beginning of a volatility expansion rather than the compression itself predicting direction.',
      intendedRegimes:['compression','range','trend'], requiredInputs:['Bollinger width percentile','width expansion ratio','ROC6','MACD histogram','close location'],
      activationSummary:'Recent compression + material width expansion + directional momentum confirmation.',
      failureModes:['one-bar news spike','expansion without directional persistence','microstructure noise','late expansion entry'],
      sourceIds:['CANONICAL_TRADING_HEURISTICS_WAVE2','BTC_VOL_HU_HARDLE_KUO_2019'],
    }),
    item({
      id:'PB_RANGE_MEAN_REVERSION_001', label:'Range Mean Reversion', archetype:'reversion',
      hypothesis:'When the market is classified as range-like rather than trending, statistically stretched price location plus momentum extremes may favor reversion toward the local mean.',
      intendedRegimes:['range'], requiredInputs:['Bollinger z-score','RSI','Stochastic','Donchian position','ADX'],
      activationSummary:'Range regime + outer distribution stretch + oscillator extreme + edge-of-range location.',
      failureModes:['range breaks into trend','structural repricing','persistent crypto momentum','volatility regime shift'],
      sourceIds:['LO_MAMAYSKY_WANG_2000','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_FAILED_BREAKOUT_REVERSAL_001', label:'Failed Breakout Reversal', archetype:'reversal',
      hypothesis:'A prior channel escape that is rapidly rejected back inside the range with rejection-wick evidence may contain reversal information.',
      intendedRegimes:['range','volatile','trend'], requiredInputs:['prior Donchian break','current channel re-entry','candle wick anatomy','close location','volume'],
      activationSummary:'Prior bar outside channel + current re-entry + rejection wick/close-location confirmation.',
      failureModes:['temporary retest before continuation','large spreads/slippage','weak wick semantics on aggregated candles','news-driven whipsaw'],
      sourceIds:['LO_MAMAYSKY_WANG_2000','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_STRUCTURE_CONTINUATION_001', label:'Structure Continuation', archetype:'continuation',
      hypothesis:'Repeated HH/HL or LH/LL structure aligned with moving-average direction may encode trend persistence more directly than a single moving-average spread.',
      intendedRegimes:['trend'], requiredInputs:['HH/HL structure score','MA alignment','ROC6','ADX'],
      activationSummary:'Directional market structure + MA trend + non-conflicting short momentum.',
      failureModes:['late-cycle structure','small alternating bars counted as structure','trend shock reversal'],
      sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','LO_MAMAYSKY_WANG_2000'],
    }),
    item({
      id:'PB_MOMENTUM_CONTINUATION_001', label:'Multi-horizon Momentum Continuation', archetype:'continuation',
      hypothesis:'Agreement between short and medium own-return momentum plus MACD direction may be more robust than a single oscillator reading.',
      intendedRegimes:['trend','volatile'], requiredInputs:['ROC6','ROC24','MACD histogram','RSI','efficiency ratio'],
      activationSummary:'ROC6 and ROC24 same sign + MACD same sign + not severely overextended.',
      failureModes:['momentum crash/reversal','high-volatility overshoot','correlated indicator redundancy'],
      sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012'],
    }),
    item({
      id:'PB_OBV_TREND_CONFIRM_001', label:'OBV-confirmed Trend', archetype:'continuation',
      hypothesis:'Trend direction accompanied by similarly signed OBV flow and acceptable participation may be more credible than price trend without volume confirmation.',
      intendedRegimes:['trend'], requiredInputs:['MA alignment','OBV normalized slope','volume z-score','ADX'],
      activationSummary:'Trend direction + OBV sign confirmation + no severe participation deficit.',
      failureModes:['venue-specific volume','spot/futures flow divergence','price leads volume','wash activity'],
      sourceIds:['CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_VOL_EXPANSION_MOMENTUM_001', label:'Volatility Expansion Momentum', archetype:'continuation',
      hypothesis:'During elevated but not blocked volatility, directional momentum confirmed by MACD/close location may persist for a short horizon.',
      intendedRegimes:['volatile','trend'], requiredInputs:['ATR percentile','realized-vol percentile','ROC6','MACD histogram','close location','risk gate'],
      activationSummary:'Elevated volatility + directional momentum + risk gate not blocked + directional close.',
      failureModes:['jump reversal','extreme volatility beyond execution assumptions','liquidation cascade','cost underestimation'],
      sourceIds:['BTC_VOL_HU_HARDLE_KUO_2019','TSM_MOSKOWITZ_OOI_PEDERSEN_2012'],
    }),
    item({
      id:'PB_EXHAUSTION_REVERSAL_001', label:'Volatility Exhaustion Reversal', archetype:'reversion',
      hypothesis:'Extreme distribution stretch during elevated volatility combined with oscillator exhaustion and a rejection wick may indicate short-horizon snapback rather than continuation.',
      intendedRegimes:['volatile','range'], requiredInputs:['Bollinger z-score','RSI','ATR percentile','realized-vol percentile','wick anatomy'],
      activationSummary:'High-volatility stretch + oscillator extreme + rejection wick in the reversal direction.',
      failureModes:['true breakout continuation','liquidation trend','wick created by illiquidity','fat-tail continuation'],
      sourceIds:['BTC_VOL_HU_HARDLE_KUO_2019','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_TREND_QUALITY_001', label:'Efficient Trend Continuation', archetype:'continuation',
      hypothesis:'Trend signals may be more useful when price path efficiency is high, reducing the influence of choppy directional noise.',
      intendedRegimes:['trend'], requiredInputs:['efficiency ratio','MA alignment/slope','ADX','ROC24'],
      activationSummary:'High path efficiency + directional trend structure + sustained medium-horizon return.',
      failureModes:['efficient move already exhausted','single jump inflates efficiency','regime change after measurement'],
      sourceIds:['TSM_MOSKOWITZ_OOI_PEDERSEN_2012','CANONICAL_TRADING_HEURISTICS_WAVE2'],
    }),
    item({
      id:'PB_LOW_QUALITY_BREAKOUT_GATE_001', label:'Low-quality Breakout Chase Gate', archetype:'breakout', role:'gate', gateTarget:'same-direction-breakout-entry',
      hypothesis:'A fresh range break occurring with weak participation and low path efficiency/compression should not automatically be chased merely because price crossed the range boundary.',
      intendedRegimes:['compression','range','trend'], requiredInputs:['Donchian break','volume z-score','efficiency ratio','Bollinger width percentile'],
      activationSummary:'Fresh break + weak volume/efficiency under compressed or low-quality conditions; suppresses only same-direction chase candidate.',
      failureModes:['quiet institutional accumulation','volume feed distortion','legitimate low-volume trend'],
      sourceIds:['CANONICAL_TRADING_HEURISTICS_WAVE2'],
      scoreMeaning:'non-directional execution/entry veto for the matching breakout direction',
    }),
  ]),
});

export function getHumanPlaybookRegistrySnapshot() {
  return JSON.parse(JSON.stringify(HUMAN_PLAYBOOK_REGISTRY));
}
