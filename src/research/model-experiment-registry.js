import { LEARNING_PRIMARY_HORIZON_BARS, LEARNING_SPLIT_EMBARGO_BARS, LEARNING_SPLIT_RATIOS } from './learning-readiness-protocol.js';

export const MODEL_EXPERIMENT_REGISTRY_VERSION='model-experiment-registry-0.1';
export const MODEL_EXPERIMENT_SPEC_VERSION='model-experiment-spec-0.1';
export const MODEL_EXPERIMENT_DATA_BRANCH='prospective-experience-data';
export const MODEL_EXPERIMENT_DATA_PATH='data/prospective-experience-v1.json';

const MARKET_BASIC=['inputs.marketAtDecision.o','inputs.marketAtDecision.h','inputs.marketAtDecision.l','inputs.marketAtDecision.c','inputs.marketAtDecision.volume','inputs.marketAtDecision.trades'];
const KNOWLEDGE_CORE=[
  'inputs.channels.knowledge.wave1.knowledgeScore','inputs.channels.knowledge.wave1.familyAgreement',
  'inputs.channels.knowledge.wave1.families.trend.score','inputs.channels.knowledge.wave1.families.momentum.score','inputs.channels.knowledge.wave1.families.meanReversion.score','inputs.channels.knowledge.wave1.families.structure.score','inputs.channels.knowledge.wave1.families.volume.score',
  'inputs.channels.knowledge.wave2.playbookScore','inputs.channels.knowledge.wave2.archetypeAgreement','inputs.channels.knowledge.wave2.activePlaybookCount','inputs.channels.knowledge.wave2.activeArchetypeCount','inputs.channels.knowledge.wave2.maxSetupStrength',
];
const HTF_CORE=[
  'inputs.channels.higherTimeframe.higherTimeframe.rawContextScore','inputs.channels.higherTimeframe.higherTimeframe.activeAlphaCount','inputs.channels.higherTimeframe.higherTimeframe.alphaAgreement','inputs.channels.higherTimeframe.higherTimeframe.candidateDirection',
  'inputs.channels.higherTimeframe.higherTimeframe.context.dailyDirection','inputs.channels.higherTimeframe.higherTimeframe.context.dailyVolatilityShock',
];
const unique=values=>[...new Set(values)];

export const MODEL_FEATURE_SET_REGISTRY=Object.freeze({
  'market-basic-v1':Object.freeze({id:'market-basic-v1',label:'Market OHLCV at decision',supportedInstruments:['BTCUSD','ETHUSD'],paths:Object.freeze([...MARKET_BASIC]),learnedSelection:false}),
  'btc-knowledge-core-v1':Object.freeze({id:'btc-knowledge-core-v1',label:'BTC Knowledge Core',supportedInstruments:['BTCUSD'],paths:Object.freeze(unique([...MARKET_BASIC,...KNOWLEDGE_CORE])),learnedSelection:false}),
  'btc-htf-core-v1':Object.freeze({id:'btc-htf-core-v1',label:'BTC Higher-Timeframe Core',supportedInstruments:['BTCUSD'],paths:Object.freeze(unique([...MARKET_BASIC,...HTF_CORE])),learnedSelection:false}),
  'btc-combined-core-v1':Object.freeze({id:'btc-combined-core-v1',label:'BTC Knowledge + Higher-Timeframe Core',supportedInstruments:['BTCUSD'],paths:Object.freeze(unique([...MARKET_BASIC,...KNOWLEDGE_CORE,...HTF_CORE])),learnedSelection:false}),
});

export const MODEL_TARGET_REGISTRY=Object.freeze({
  'direction-3bar-v1':Object.freeze({id:'direction-3bar-v1',task:'classification',horizonBars:LEARNING_PRIMARY_HORIZON_BARS,labelPath:'labels.3.direction',classes:['UP','DOWN','FLAT'],probabilityCalibrationRequiredForProbabilityClaims:true}),
  'return-bps-3bar-v1':Object.freeze({id:'return-bps-3bar-v1',task:'regression',horizonBars:LEARNING_PRIMARY_HORIZON_BARS,labelPath:'labels.3.forwardReturnBps'}),
});

export const MODEL_ALGORITHM_CONTRACT_REGISTRY=Object.freeze({
  'sklearn-logistic-regression-l2':Object.freeze({id:'sklearn-logistic-regression-l2',task:'classification',provider:'future-python-worker',implementation:'scikit-learn LogisticRegression',installed:false,hyperparameterKeys:['C','max_iter','class_weight','random_state'],searchAllowed:false}),
  'sklearn-ridge-regression':Object.freeze({id:'sklearn-ridge-regression',task:'regression',provider:'future-python-worker',implementation:'scikit-learn Ridge',installed:false,hyperparameterKeys:['alpha','fit_intercept','random_state'],searchAllowed:false}),
});

export const MODEL_EXPERIMENT_TEMPLATES=Object.freeze([
  Object.freeze({templateId:'btc-direction-baseline-template-v1',label:'BTC 3-bar Direction — fixed baseline model',instrumentScope:['BTCUSD'],targetId:'direction-3bar-v1',featureSetId:'btc-combined-core-v1',algorithmId:'sklearn-logistic-regression-l2',defaultHyperparameters:Object.freeze({C:1,max_iter:1000,class_weight:null,random_state:20260817}),mandatoryBaselines:Object.freeze(['majority-class','prior-3bar-direction']),mandatoryNulls:Object.freeze(['label-shift-screen']),metrics:Object.freeze(['balanced-accuracy','macro-f1','brier-score']),executable:false}),
  Object.freeze({templateId:'btc-return-baseline-template-v1',label:'BTC 3-bar Return — fixed baseline model',instrumentScope:['BTCUSD'],targetId:'return-bps-3bar-v1',featureSetId:'btc-combined-core-v1',algorithmId:'sklearn-ridge-regression',defaultHyperparameters:Object.freeze({alpha:1,fit_intercept:true,random_state:20260817}),mandatoryBaselines:Object.freeze(['zero-return','historical-train-mean']),mandatoryNulls:Object.freeze(['label-shift-screen']),metrics:Object.freeze(['mae-bps','median-absolute-error-bps','spearman-correlation']),executable:false}),
]);

export const MODEL_EXPERIMENT_REGISTRY=Object.freeze({
  version:MODEL_EXPERIMENT_REGISTRY_VERSION,
  featureSets:MODEL_FEATURE_SET_REGISTRY,
  targets:MODEL_TARGET_REGISTRY,
  algorithmContracts:MODEL_ALGORITHM_CONTRACT_REGISTRY,
  templates:MODEL_EXPERIMENT_TEMPLATES,
  frozenSpecs:Object.freeze([]),
  governance:Object.freeze({outcomeDrivenSpecGeneration:false,automaticFeatureSelection:false,hyperparameterSearch:false,registryLaunchesJobs:false,trainingImplemented:false,automaticPromotion:false,usedByDecisionEngine:false}),
});

export function buildDefaultExperimentSplitPolicy(){return {chronological:true,shuffle:false,ratios:{...LEARNING_SPLIT_RATIOS},embargoBars:LEARNING_SPLIT_EMBARGO_BARS,labelMustBeAvailableByFrozenCutoff:true};}
