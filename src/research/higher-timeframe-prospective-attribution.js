import { ShadowEngine } from '../engine/shadow-engine.js';
import { HigherTimeframeContextEngine } from '../knowledge/higher-timeframe-engine.js';
import { HIGHER_TIMEFRAME_FORWARD_EPOCH_ID } from './higher-timeframe-forward-epoch.js';
import { PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION } from './prospective-attribution-ledger.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const round=(value,digits=4)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
function sortedTimes(values=[]){return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);}
function indexByTime(series=[]){return new Map(series.map((bar,idx)=>[Number(bar?.t),idx]).filter(([time])=>Number.isFinite(time)));}
function compactHtfComponents(items=[]){return items.map(item=>({id:item.id,role:item.role,active:Boolean(item.active),direction:Number(item.direction||0),score:round(item.score),magnitude:round(item.magnitude),gateTarget:item.gateTarget||null,reasons:Array.isArray(item.reasons)?[...item.reasons]:[]}));}

export function buildHigherTimeframeProspectiveAttributionSnapshot({series,observedBarTimes=[]}={}){
  const byTime=indexByTime(series);const htfEngine=new HigherTimeframeContextEngine();const championEngine=new ShadowEngine({seriesProvider:()=>series});const records=[];
  for(const candleTime of sortedTimes(observedBarTimes)){
    const idx=byTime.get(candleTime);if(!Number.isInteger(idx))continue;const htf=htfEngine.analyze(series,idx);const champion=championEngine.analyze('BTCUSD',idx);if(htf.status!=='complete')continue;
    records.push({attributionKey:`${HIGHER_TIMEFRAME_FORWARD_EPOCH_ID}:${candleTime}`,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,candleTime,barIndex:idx,observedProspectively:true,futureOutcomeUsed:false,
      higherTimeframe:{engineVersion:htf.engineVersion,registryVersion:htf.registryVersion,entryDecision:htf.entryDecision,rawContextScore:round(htf.rawContextScore),activeAlphaCount:Number(htf.activeAlphaCount||0),alphaAgreement:round(htf.alphaAgreement),candidateDirection:Number(htf.candidateDirection||0),gateReason:htf.gateReason||null,context:clone(htf.context||{}),components:compactHtfComponents(htf.components),features:{daily:clone(htf.features?.daily||{}),fourHour:clone(htf.features?.fourHour||{}),lastDailyBarCloseTime:htf.features?.lastDailyBarCloseTime??null}},
      champion:{engineVersion:champion.engineVersion||null,entryDecision:champion.entryDecision||null,rawAlphaScore:round(champion.rawAlphaScore),decisionScore:round(champion.decisionScore),confidenceScore:round(champion.conf)},
      governance:{researchOnly:true,changesFrozenDecision:false,causalAttribution:false,automaticLearning:false,usedByLiveDecisionEngine:false}});
  }
  return {version:PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION,epochId:HIGHER_TIMEFRAME_FORWARD_EPOCH_ID,records};
}
