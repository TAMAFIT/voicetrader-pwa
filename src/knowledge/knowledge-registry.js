export const HUMAN_KNOWLEDGE_REGISTRY_VERSION = 'human-knowledge-registry-0.1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const KNOWLEDGE_SOURCES = deepFreeze({
  'mop-tsmom': {
    type: 'academic-primary',
    title: 'Time Series Momentum',
    authors: 'Moskowitz, Ooi & Pedersen',
    year: 2012,
    url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2089463',
    note: 'Evidence for return persistence across liquid futures. VoiceTrader does not assume the published horizon transfers directly to BTC 4H.',
  },
  'lo-technical': {
    type: 'academic-primary',
    title: 'Foundations of Technical Analysis: Computational Algorithms, Statistical Inference, and Empirical Implementation',
    authors: 'Lo, Mamaysky & Wang',
    year: 2000,
    url: 'https://www.nber.org/papers/w7613',
    note: 'Supports systematic, machine-readable treatment of chart/technical patterns; not a blanket profitability claim.',
  },
  'lebaron-fx': {
    type: 'academic-primary',
    title: 'Technical Trading Rule Profitability and Foreign Exchange Intervention',
    authors: 'Blake LeBaron',
    year: 1996,
    url: 'https://www.nber.org/papers/w5505',
    note: 'Documents context dependence of simple technical rules in FX; explicitly motivates regime/context separation.',
  },
  'han-crypto-momentum': {
    type: 'academic-primary',
    title: 'Momentum in the Cryptocurrency Market: A Comprehensive Analysis under Realistic Assumptions',
    authors: 'Han, Kang & Ryu',
    year: 2026,
    url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4675565',
    note: 'Crypto-specific momentum evidence with realistic-risk caveats. No direct parameter transfer is assumed.',
  },
  'kraken-ohlc': {
    type: 'official-market-data',
    title: 'Kraken public OHLC market data',
    authors: 'Kraken',
    year: 2026,
    url: 'https://docs.kraken.com/',
    note: 'Market-data provenance only; not evidence that any trading rule has edge.',
  },
  'canonical-indicator': {
    type: 'canonical-heuristic',
    title: 'Canonical technical-indicator rule family',
    authors: 'Industry practice',
    year: null,
    url: null,
    note: 'Implemented as a transparent trading heuristic. Inclusion means codified human practice, not validated persistent profitability.',
  },
});

const common = {
  researchOnly: true,
  activeInChampion: false,
  profitabilityClaim: false,
  optimizerEligible: false,
};

const items = [
  { id:'TREND_MA_ALIGNMENT_001', name:'MA Alignment', family:'trend', role:'alpha', sourceIds:['canonical-indicator','lo-technical'], inputs:['close'], intendedRegime:['trend'], failureModes:['whipsaw-in-range'], definition:'Fast/slow moving-average separation gives directional trend pressure.' },
  { id:'TREND_MA_SLOPE_001', name:'MA Slope', family:'trend', role:'alpha', sourceIds:['canonical-indicator','lo-technical'], inputs:['close'], intendedRegime:['trend'], failureModes:['late-after-reversal'], definition:'Slope of fast and slow moving averages measures trend persistence.' },
  { id:'TREND_MACD_001', name:'MACD Histogram', family:'trend', role:'alpha', sourceIds:['canonical-indicator'], inputs:['close'], intendedRegime:['trend'], failureModes:['lag','range-whipsaw'], definition:'EMA spread and signal-line divergence encode directional trend acceleration.' },
  { id:'TREND_DMI_ADX_001', name:'DMI Direction with ADX', family:'trend', role:'alpha', sourceIds:['canonical-indicator','lebaron-fx'], inputs:['high','low','close'], intendedRegime:['trend'], failureModes:['late-regime-change'], definition:'Directional Movement difference is conditioned by trend-strength magnitude.' },
  { id:'MOM_ROC_001', name:'Rate of Change', family:'momentum', role:'alpha', sourceIds:['mop-tsmom','han-crypto-momentum'], inputs:['close'], intendedRegime:['trend','neutral'], failureModes:['momentum-crash','horizon-transfer-risk'], definition:'Signed trailing return is a compact time-series momentum proxy.' },
  { id:'MOM_RSI_002', name:'RSI Momentum', family:'momentum', role:'alpha', sourceIds:['canonical-indicator'], inputs:['close'], intendedRegime:['trend','neutral'], failureModes:['overbought-can-stay-overbought'], definition:'RSI displacement from 50 is treated as momentum, distinct from RSI reversal logic.' },
  { id:'MOM_STOCH_001', name:'Stochastic Momentum', family:'momentum', role:'alpha', sourceIds:['canonical-indicator'], inputs:['high','low','close'], intendedRegime:['trend','neutral'], failureModes:['extreme-pinning'], definition:'Close location inside the recent high-low range represents short-horizon momentum.' },
  { id:'MR_BOLLINGER_Z_001', name:'Bollinger Z Reversion', family:'meanReversion', role:'alpha', sourceIds:['canonical-indicator'], inputs:['close'], intendedRegime:['range'], failureModes:['trend-runaway','volatility-expansion'], definition:'Large standardized deviation from a rolling mean creates an opposing mean-reversion score.' },
  { id:'MR_RSI_EXTREME_001', name:'RSI Extreme Reversion', family:'meanReversion', role:'alpha', sourceIds:['canonical-indicator'], inputs:['close'], intendedRegime:['range'], failureModes:['strong-trend'], definition:'Only RSI extremes create reversal pressure; neutral RSI produces no reversal vote.' },
  { id:'MR_STOCH_EXTREME_001', name:'Stochastic Extreme Reversion', family:'meanReversion', role:'alpha', sourceIds:['canonical-indicator'], inputs:['high','low','close'], intendedRegime:['range'], failureModes:['strong-trend'], definition:'Only stochastic extremes create reversal pressure.' },
  { id:'STRUCT_DONCHIAN_001', name:'Donchian Breakout', family:'structure', role:'alpha', sourceIds:['canonical-indicator','lebaron-fx'], inputs:['high','low','close'], intendedRegime:['trend','compression'], failureModes:['false-breakout'], definition:'Break beyond the prior channel is treated as directional structural information.' },
  { id:'STRUCT_HHHL_001', name:'Higher-High / Higher-Low Structure', family:'structure', role:'alpha', sourceIds:['lo-technical','canonical-indicator'], inputs:['high','low'], intendedRegime:['trend','neutral'], failureModes:['noisy-pivots'], definition:'Recent high/low progression is encoded as bullish or bearish market structure.' },
  { id:'STRUCT_RANGE_LOCATION_001', name:'Range Location', family:'structure', role:'alpha', sourceIds:['canonical-indicator'], inputs:['high','low','close'], intendedRegime:['range','neutral'], failureModes:['breakout-transition'], definition:'Location relative to recent structural midpoint is directional context, not a breakout claim.' },
  { id:'VOL_OBV_CONFIRM_001', name:'OBV Direction Confirmation', family:'volume', role:'alpha', sourceIds:['canonical-indicator'], inputs:['close','volume'], intendedRegime:['trend','neutral'], failureModes:['exchange-volume-fragmentation'], definition:'Signed cumulative volume trend is used as confirmation rather than a standalone price forecast.' },
  { id:'VOL_SPIKE_CONFIRM_001', name:'Volume Spike Confirmation', family:'volume', role:'alpha', sourceIds:['canonical-indicator'], inputs:['close','volume'], intendedRegime:['trend','breakout'], failureModes:['news-spike-reversal','exchange-volume-fragmentation'], definition:'Abnormal volume amplifies the sign of short-horizon price movement.' },
  { id:'REGIME_ADX_001', name:'ADX Trend Regime', family:'regime', role:'regime', sourceIds:['canonical-indicator','lebaron-fx'], inputs:['high','low','close'], intendedRegime:['all'], failureModes:['lag'], definition:'ADX is used to classify trend strength, not to vote up or down by itself.' },
  { id:'REGIME_BB_WIDTH_001', name:'Bollinger Width Compression', family:'regime', role:'regime', sourceIds:['canonical-indicator'], inputs:['close'], intendedRegime:['all'], failureModes:['percentile-window-dependence'], definition:'Low rolling band-width percentile marks volatility compression.' },
  { id:'RISK_ATR_001', name:'ATR Volatility Risk', family:'risk', role:'risk', sourceIds:['canonical-indicator'], inputs:['high','low','close'], intendedRegime:['all'], failureModes:['gap-risk-understatement'], definition:'ATR percentile measures current range risk; it never determines trade direction.' },
  { id:'RISK_REALIZED_VOL_001', name:'Realized Volatility Risk', family:'risk', role:'risk', sourceIds:['canonical-indicator'], inputs:['close'], intendedRegime:['all'], failureModes:['backward-looking'], definition:'Rolling log-return dispersion measures realized price risk.' },
  { id:'LIQ_VOLUME_PARTICIPATION_001', name:'Volume Participation Proxy', family:'liquidity', role:'risk', sourceIds:['kraken-ohlc','canonical-indicator'], inputs:['volume'], intendedRegime:['all'], failureModes:['single-venue-proxy'], definition:'Abnormally weak venue volume is treated as a liquidity-quality warning, not direction.' },
].map(item => ({ ...common, validationState:'implemented-wave1', ...item }));

export const HUMAN_KNOWLEDGE_REGISTRY = deepFreeze({
  version: HUMAN_KNOWLEDGE_REGISTRY_VERSION,
  philosophy: {
    codifyHumanKnowledge: true,
    separateRoles: true,
    familyNormalization: true,
    regimeConditionedLearning: false,
    adaptiveWeights: false,
    selfLearning: false,
    automaticPromotion: false,
    scoreIsExpectedReturn: false,
    scoreIsCalibratedProbability: false,
  },
  sources: KNOWLEDGE_SOURCES,
  items,
});

export function getKnowledgeRegistrySnapshot() {
  return JSON.parse(JSON.stringify(HUMAN_KNOWLEDGE_REGISTRY));
}

export function getKnowledgeItemsByRole(role) {
  return HUMAN_KNOWLEDGE_REGISTRY.items.filter(item => item.role === role);
}
