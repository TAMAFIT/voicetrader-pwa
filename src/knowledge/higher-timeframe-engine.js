import { clamp } from '../engine/indicators.js';
import { buildHigherTimeframeFeatures } from './higher-timeframe-features.js';
import { HIGHER_TIMEFRAME_REGISTRY, HIGHER_TIMEFRAME_REGISTRY_VERSION } from './higher-timeframe-registry.js';

export const HIGHER_TIMEFRAME_ENGINE_VERSION='higher-timeframe-engine-0.1';
export const HIGHER_TIMEFRAME_ENTRY_THRESHOLD=55;

const round=(value,digits=2)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const signed=(direction,magnitude)=>round(Math.sign(direction)*clamp(Number(magnitude)||0,0,100));
const inactive=(id,role,reason='inactive-context')=>({id,role,active:false,direction:0,score:0,magnitude:0,reasons:[reason]});

function alpha(id,direction,magnitude,reasons){return {id,role:'alpha',active:true,direction:Math.sign(direction),score:signed(direction,magnitude),magnitude:round(clamp(magnitude,0,100)),reasons};}
function gate(id,active,target,reasons){return {id,role:'gate',active:Boolean(active),direction:0,score:0,magnitude:0,gateTarget:target,reasons:active?reasons:[]};}

function trendPullback(features){
  const d=features.daily,f=features.fourHour,dir=d.direction;
  if(d.regime!=='trend'||dir===0)return inactive('HTF_D1_TREND_PULLBACK_001','alpha');
  const distance=Number(f.priceToFastAtr||0),rsi=Number(f.rsi14||50),loc=Number(f.anatomy?.closeLocation??.5),rocSign=Math.sign(Number(f.roc6Pct||0));
  const nearFast=dir>0?(distance>=-1.25&&distance<=.6):(distance>=-.6&&distance<=1.25);
  const recovery=dir>0?(loc>=.55&&rsi>=38&&rsi<=72&&rocSign>=0):(loc<=.45&&rsi>=28&&rsi<=62&&rocSign<=0);
  if(!nearFast||!recovery)return inactive('HTF_D1_TREND_PULLBACK_001','alpha','trigger-not-confirmed');
  const magnitude=58+clamp((Number(d.dmi?.adx||0)-22)*1.1,0,12)+clamp(Math.abs(Number(d.maSeparationPct||0))*3,0,8)+clamp(Math.abs(loc-.5)*20,0,8);
  return alpha('HTF_D1_TREND_PULLBACK_001',dir,magnitude,['fully-closed-d1-trend','four-hour-near-fast-ma','four-hour-recovery-trigger']);
}

function breakoutAlignment(features){
  const d=features.daily,f=features.fourHour,dir=d.direction,breakDir=Number(f.donchianBreakSign||0);
  if(d.regime!=='trend'||dir===0||breakDir!==dir)return inactive('HTF_D1_BREAKOUT_ALIGN_001','alpha');
  if(Number(f.dmi?.adx||0)<18||Number(f.volumeZScore||0)<-.75||Number(f.efficiencyRatio20||0)<.2)return inactive('HTF_D1_BREAKOUT_ALIGN_001','alpha','breakout-quality-insufficient');
  const magnitude=62+clamp((Number(f.dmi?.adx||0)-18)*.6,0,10)+clamp((Number(f.volumeZScore||0)+.75)*4,0,8)+clamp(Number(f.efficiencyRatio20||0)*12,0,10);
  return alpha('HTF_D1_BREAKOUT_ALIGN_001',dir,magnitude,['fully-closed-d1-trend','four-hour-fresh-donchian-break','breakout-quality-confirmed']);
}

function momentumAlignment(features){
  const d=features.daily,f=features.fourHour,dir=Number(d.momentumDirection||0);
  if(dir===0)return inactive('HTF_D1_MOMENTUM_ALIGN_001','alpha');
  if(d.strongTrend&&d.direction!==dir)return inactive('HTF_D1_MOMENTUM_ALIGN_001','alpha','daily-trend-opposes-daily-momentum');
  const roc6=Math.sign(Number(f.roc6Pct||0)),macd=Math.sign(Number(f.macd?.histogram||0)),rsi=Number(f.rsi14||50);
  const aligned=roc6===dir&&macd===dir;
  const notExtreme=dir>0?(rsi>=42&&rsi<=75):(rsi>=25&&rsi<=58);
  if(!aligned||!notExtreme)return inactive('HTF_D1_MOMENTUM_ALIGN_001','alpha','four-hour-momentum-not-aligned');
  const dailyMomentum=Math.abs(Number(d.roc6Pct||0))+Math.abs(Number(d.roc24Pct||0))*.35;
  const fourMomentum=Math.abs(Number(f.roc6Pct||0));
  const magnitude=60+clamp(dailyMomentum*3,0,12)+clamp(fourMomentum*4,0,10);
  return alpha('HTF_D1_MOMENTUM_ALIGN_001',dir,magnitude,['fully-closed-d1-momentum-agreement','four-hour-roc-macd-agreement']);
}

function rangeReversion(features){
  const d=features.daily,f=features.fourHour;
  if(d.regime!=='range')return inactive('HTF_D1_RANGE_REVERSION_001','alpha');
  const z=Number(f.bollinger?.z||0),rsi=Number(f.rsi14||50),loc=Number(f.anatomy?.closeLocation??.5);
  let dir=0;
  if(z<=-1.4&&rsi<=40&&loc>=.48)dir=1;
  if(z>=1.4&&rsi>=60&&loc<=.52)dir=-1;
  if(!dir)return inactive('HTF_D1_RANGE_REVERSION_001','alpha','four-hour-extreme-not-confirmed');
  const magnitude=60+clamp((Math.abs(z)-1.4)*12,0,14)+clamp(Math.abs(rsi-50)*.45,0,10)+clamp(Math.abs(loc-.5)*18,0,7);
  return alpha('HTF_D1_RANGE_REVERSION_001',dir,magnitude,['fully-closed-d1-range','four-hour-distribution-stretch','four-hour-reversal-location']);
}

function evaluateAlphaComponents(features){return [trendPullback(features),breakoutAlignment(features),momentumAlignment(features),rangeReversion(features)];}

export function resolveHigherTimeframeDecision({features,alphaComponents,disabledComponentIds=[]}={}){
  const disabled=new Set(disabledComponentIds||[]);
  const active=(alphaComponents||[]).filter(item=>item.role==='alpha'&&item.active&&!disabled.has(item.id));
  const rawScore=active.length?active.reduce((sum,item)=>sum+Number(item.score||0),0)/active.length:0;
  const direction=Math.abs(rawScore)>=HIGHER_TIMEFRAME_ENTRY_THRESHOLD?Math.sign(rawScore):0;
  const sameDirection=direction?active.filter(item=>Math.sign(Number(item.score||0))===direction).length:0;
  const agreement=active.length?sameDirection/active.length:0;
  const countertrendActive=!disabled.has('HTF_D1_COUNTERTREND_VETO_001')&&direction!==0&&features?.daily?.strongTrend===true&&Number(features.daily.direction)!==direction;
  const volShockActive=!disabled.has('HTF_D1_VOL_SHOCK_GATE_001')&&direction!==0&&features?.daily?.volatilityShock===true;
  const gates=[
    gate('HTF_D1_COUNTERTREND_VETO_001',countertrendActive,'entry-opposed-to-strong-d1-trend',countertrendActive?['candidate-opposes-strong-fully-closed-d1-trend']:[]),
    gate('HTF_D1_VOL_SHOCK_GATE_001',volShockActive,'all-wave3-entry',volShockActive?['fully-closed-d1-volatility-shock']:[]),
  ];
  const blockingGates=gates.filter(item=>item.active);
  const entryDecision=direction===0||blockingGates.length?'NO_ENTRY':direction>0?'ENTER_LONG':'ENTER_SHORT';
  return {
    rawContextScore:round(rawScore),
    activeAlphaCount:active.length,
    alphaAgreement:round(agreement,4),
    candidateDirection:direction,
    entryDecision,
    gateReason:blockingGates.map(item=>item.id).join('|')||null,
    gates,
    disabledComponentIds:[...disabled],
  };
}

export class HigherTimeframeContextEngine{
  analyze(series,idx=series?.length-1){
    const sourceBefore=JSON.stringify(series);
    const features=buildHigherTimeframeFeatures(series,idx);
    if(features.status!=='complete')return {engineVersion:HIGHER_TIMEFRAME_ENGINE_VERSION,registryVersion:HIGHER_TIMEFRAME_REGISTRY_VERSION,status:features.status,reason:features.reason||features.status,dailyBarCount:features.dailyBarCount||0};
    const alphaComponents=evaluateAlphaComponents(features);
    const resolved=resolveHigherTimeframeDecision({features,alphaComponents});
    const components=[...alphaComponents,...resolved.gates];
    if(JSON.stringify(series)!==sourceBefore)return {engineVersion:HIGHER_TIMEFRAME_ENGINE_VERSION,status:'blocked',reason:'source-series-mutated'};
    return {
      engineVersion:HIGHER_TIMEFRAME_ENGINE_VERSION,
      registryVersion:HIGHER_TIMEFRAME_REGISTRY_VERSION,
      status:'complete',
      wave:3,
      features,
      components,
      alphaComponents,
      ...resolved,
      context:{dailyRegime:features.daily.regime,dailyDirection:features.daily.direction,dailyMomentumDirection:features.daily.momentumDirection,dailyStrongTrend:features.daily.strongTrend,dailyVolatilityShock:features.daily.volatilityShock,lastDailyBarCloseTime:features.lastDailyBarCloseTime},
      governance:{
        researchOnly:true,activeInChampion:false,activeInLiveForward:false,activeInForward001:false,activeInKnowledgeForward001:false,
        fixedComponentCount:HIGHER_TIMEFRAME_REGISTRY.components.length,equalActiveAlphaWeighting:true,gateIsDirectionalVote:false,
        scoreIsExpectedReturn:false,scoreIsCalibratedProbability:false,rawScoreMinusCost:false,
        optimizer:false,parameterSweep:false,adaptiveWeights:false,selfLearning:false,automaticPruning:false,automaticPromotion:false,
      },
    };
  }
}

export function analyzeHigherTimeframeContext(series,idx){return new HigherTimeframeContextEngine().analyze(series,idx);}
