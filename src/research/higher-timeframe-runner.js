import { ShadowEngine } from '../engine/shadow-engine.js';
import { HigherTimeframeContextEngine, resolveHigherTimeframeDecision } from '../knowledge/higher-timeframe-engine.js';
import { HIGHER_TIMEFRAME_REGISTRY, HIGHER_TIMEFRAME_HORIZON_BARS } from '../knowledge/higher-timeframe-registry.js';
import { estimateResearchRoundTripCostBps } from './research-cost-model.js';
import { playbookOutcomeBps, summarizePlaybookTrades } from './playbook-shadow-runner.js';

export const HIGHER_TIMEFRAME_RUNNER_VERSION='higher-timeframe-runner-0.1';
export const HIGHER_TIMEFRAME_START_INDEX=250;
export const HIGHER_TIMEFRAME_LAG_CONTROLS=Object.freeze([1,2,3,6,9,12,18,24]);
export const HIGHER_TIMEFRAME_FOLDS=3;

const sideFromDecision=decision=>decision==='ENTER_LONG'?'LONG':decision==='ENTER_SHORT'?'SHORT':null;
const round=(value,digits=2)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
function quantile(values,q){const sorted=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;if(sorted.length===1)return round(sorted[0]);const p=(sorted.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p),w=p-lo;return round(sorted[lo]*(1-w)+sorted[hi]*w);}

function buildAnalyses(series,startIndex,safeEnd){
  const engine=new HigherTimeframeContextEngine();
  const map=new Map();
  for(let idx=startIndex;idx<=safeEnd;idx++){
    const analysis=engine.analyze(series,idx);
    if(analysis.status==='complete')map.set(idx,analysis);
  }
  return map;
}

function tradeFromDecision(series,idx,decision,analysis,horizonBars=HIGHER_TIMEFRAME_HORIZON_BARS){
  const side=sideFromDecision(decision);if(!side)return null;
  const exitIndex=idx+horizonBars;if(!series[exitIndex])return null;
  const cost=estimateResearchRoundTripCostBps(series,idx,'BTCUSD');if(!Number.isFinite(Number(cost)))return null;
  const outcome=playbookOutcomeBps(series,idx,exitIndex,side,cost);if(!outcome)return null;
  return {entryIndex:idx,exitIndex,entryTime:Number(series[idx]?.t)||null,exitTime:Number(series[exitIndex]?.t)||null,holdingBars:horizonBars,side,dailyRegime:analysis?.context?.dailyRegime||'unknown',dailyDirection:analysis?.context?.dailyDirection||0,rawContextScore:analysis?.rawContextScore??null,activeComponentIds:(analysis?.components||[]).filter(item=>item.active).map(item=>item.id),estimatedRoundTripCostBps:round(cost,4),...outcome};
}

function runWave3Path({series,analyses,startIndex,endIndex,disabledComponentIds=[]}){
  const trades=[];const decisions={ENTER_LONG:0,ENTER_SHORT:0,NO_ENTRY:0};let nextFree=startIndex;
  for(let idx=startIndex;idx+HIGHER_TIMEFRAME_HORIZON_BARS<=endIndex;idx++){
    if(idx<nextFree)continue;const analysis=analyses.get(idx);if(!analysis)continue;
    const resolved=disabledComponentIds.length?resolveHigherTimeframeDecision({features:analysis.features,alphaComponents:analysis.alphaComponents,disabledComponentIds}):analysis;
    const decision=resolved.entryDecision||'NO_ENTRY';decisions[decision]=(decisions[decision]||0)+1;
    const trade=tradeFromDecision(series,idx,decision,analysis);if(!trade)continue;trades.push({...trade,disabledComponentIds:[...disabledComponentIds]});nextFree=trade.exitIndex+1;
  }
  return {trades,decisionCounts:decisions,summary:summarizePlaybookTrades(trades,startIndex,endIndex,HIGHER_TIMEFRAME_HORIZON_BARS)};
}

function runChampionPath({series,startIndex,endIndex}){
  const engine=new ShadowEngine({seriesProvider:()=>series});const trades=[];const decisions={ENTER_LONG:0,ENTER_SHORT:0,NO_ENTRY:0};let nextFree=startIndex;
  for(let idx=startIndex;idx+HIGHER_TIMEFRAME_HORIZON_BARS<=endIndex;idx++){
    if(idx<nextFree)continue;const analysis=engine.analyze('BTCUSD',idx);const decision=analysis.entryDecision||analysis.action==='BUY'?'ENTER_LONG':analysis.action==='SELL'?'ENTER_SHORT':'NO_ENTRY';decisions[decision]=(decisions[decision]||0)+1;
    const trade=tradeFromDecision(series,idx,decision,{context:{dailyRegime:'benchmark'},rawContextScore:analysis.rawAlphaScore,components:[]});if(!trade)continue;trades.push(trade);nextFree=trade.exitIndex+1;
  }
  return {trades,decisionCounts:decisions,summary:summarizePlaybookTrades(trades,startIndex,endIndex,HIGHER_TIMEFRAME_HORIZON_BARS)};
}

function runLagControls({series,analyses,startIndex,endIndex}){
  const primaryDecisions=new Map([...analyses.entries()].map(([idx,analysis])=>[idx,analysis.entryDecision]));
  const replicates=HIGHER_TIMEFRAME_LAG_CONTROLS.map(lagBars=>{
    const trades=[];let nextFree=startIndex;
    for(let idx=startIndex;idx+HIGHER_TIMEFRAME_HORIZON_BARS<=endIndex;idx++){
      if(idx<nextFree)continue;const signalIndex=idx-lagBars;if(signalIndex<startIndex)continue;const decision=primaryDecisions.get(signalIndex)||'NO_ENTRY';const analysis=analyses.get(idx);if(!analysis)continue;
      const trade=tradeFromDecision(series,idx,decision,analysis);if(!trade)continue;trades.push({...trade,signalIndex,lagBars,futureDecisionUsed:false});nextFree=trade.exitIndex+1;
    }
    return {lagBars,trades,summary:summarizePlaybookTrades(trades,startIndex,endIndex,HIGHER_TIMEFRAME_HORIZON_BARS)};
  });
  const avgValues=replicates.map(item=>item.summary.avgNetBps).filter(Number.isFinite);
  return {method:'past-decision-lag',lags:[...HIGHER_TIMEFRAME_LAG_CONTROLS],replicates,medianAvgNetBps:quantile(avgValues,.5),p95AvgNetBps:quantile(avgValues,.95),formalPValue:false,signalRecomputation:false,futureDecisionUsed:false};
}

function buildFolds(startIndex,endIndex,count=HIGHER_TIMEFRAME_FOLDS){
  const lastEntry=endIndex-HIGHER_TIMEFRAME_HORIZON_BARS;const length=Math.max(0,lastEntry-startIndex+1);if(length<count)return [];
  const base=Math.floor(length/count);const folds=[];let cursor=startIndex;
  for(let fold=1;fold<=count;fold++){
    const entryEnd=fold===count?lastEntry:cursor+base-1;
    folds.push({fold,startIndex:cursor,entryEndIndex:entryEnd,endIndex:Math.min(endIndex,entryEnd+HIGHER_TIMEFRAME_HORIZON_BARS)});cursor=entryEnd+1;
  }
  return folds;
}

function runFolds({series,analyses,startIndex,endIndex}){
  return buildFolds(startIndex,endIndex).map(fold=>{
    const wave3=runWave3Path({series,analyses,startIndex:fold.startIndex,endIndex:fold.endIndex});
    const champion=runChampionPath({series,startIndex:fold.startIndex,endIndex:fold.endIndex});
    return {...fold,wave3:wave3.summary,champion:champion.summary,deltaAvgNetBps:round(wave3.summary.avgNetBps-champion.summary.avgNetBps),wave3Positive:wave3.summary.returnPct>0,beatsChampionAvgNet:wave3.summary.avgNetBps>champion.summary.avgNetBps};
  });
}

export function runHigherTimeframeWave3({series,endIndex,dataSignature='unknown',startIndex=HIGHER_TIMEFRAME_START_INDEX}={}){
  if(!Array.isArray(series)||series.length<=startIndex+HIGHER_TIMEFRAME_HORIZON_BARS)return {version:HIGHER_TIMEFRAME_RUNNER_VERSION,status:'unavailable',reason:'insufficient-series'};
  const sourceBefore=JSON.stringify(series);const safeEnd=Math.min(Number(endIndex??series.length-1),series.length-1);const analyses=buildAnalyses(series,startIndex,safeEnd);
  if(!analyses.size)return {version:HIGHER_TIMEFRAME_RUNNER_VERSION,status:'unavailable',reason:'insufficient-complete-daily-context'};
  const firstAnalysisIndex=Math.min(...analyses.keys());
  const wave3=runWave3Path({series,analyses,startIndex:firstAnalysisIndex,endIndex:safeEnd});
  const champion=runChampionPath({series,startIndex:firstAnalysisIndex,endIndex:safeEnd});
  const ablations=HIGHER_TIMEFRAME_REGISTRY.components.map(component=>{
    const path=runWave3Path({series,analyses,startIndex:firstAnalysisIndex,endIndex:safeEnd,disabledComponentIds:[component.id]});
    return {componentId:component.id,role:component.role,summary:path.summary,deltaAvgNetBpsVsFull:round(path.summary.avgNetBps-wave3.summary.avgNetBps),deltaReturnPctVsFull:round(path.summary.returnPct-wave3.summary.returnPct)};
  });
  const activationCounts=Object.fromEntries(HIGHER_TIMEFRAME_REGISTRY.components.map(component=>[component.id,0]));
  for(const analysis of analyses.values())for(const component of analysis.components||[])if(component.active)activationCounts[component.id]=(activationCounts[component.id]||0)+1;
  const lagControls=runLagControls({series,analyses,startIndex:firstAnalysisIndex,endIndex:safeEnd});
  const folds=runFolds({series,analyses,startIndex:firstAnalysisIndex,endIndex:safeEnd});
  if(JSON.stringify(series)!==sourceBefore)return {version:HIGHER_TIMEFRAME_RUNNER_VERSION,status:'blocked',reason:'source-series-mutated'};
  return {
    version:HIGHER_TIMEFRAME_RUNNER_VERSION,status:'complete',dataSignature,startIndex:firstAnalysisIndex,endIndex:safeEnd,horizonBars:HIGHER_TIMEFRAME_HORIZON_BARS,
    latestAnalysis:analyses.get(Math.max(...analyses.keys())),wave3,benchmark:{id:'champion-001',...champion},activationCounts,ablations,lagControls,folds,
    comparison:{deltaAvgNetBps:round(wave3.summary.avgNetBps-champion.summary.avgNetBps),deltaReturnPct:round(wave3.summary.returnPct-champion.summary.returnPct)},
    promotionEligible:false,
    methodology:{purpose:'research-only-higher-timeframe-context-wave3',sameSeriesDiagnosticOnly:true,fullyClosedDailyContextOnly:true,partialDailyBarForbidden:true,futureFourHourBarsForbidden:true,fixedHorizonBars:HIGHER_TIMEFRAME_HORIZON_BARS,nonOverlappingTrades:true,perEntryDeterministicResearchCost:true,leaveOneComponentOut:true,pastDecisionLagControls:[...HIGHER_TIMEFRAME_LAG_CONTROLS],chronologicalFolds:HIGHER_TIMEFRAME_FOLDS,pristineUntouchedOOS:false,noFittingPerformed:true,rawScoreMinusCost:false,optimizer:false,parameterSweep:false,adaptiveWeights:false,selfLearning:false,automaticPruning:false,automaticPromotion:false,championMutation:false,usedByLiveDecisionEngine:false,usedByForward001:false,usedByKnowledgeForward001:false},
  };
}
