import assert from 'node:assert/strict';
import {
  DAY_SECONDS,
  FOUR_HOURS_SECONDS,
  buildClosedDailySeries,
  buildHigherTimeframeFeatures,
} from '../src/knowledge/higher-timeframe-features.js';
import { HigherTimeframeContextEngine } from '../src/knowledge/higher-timeframe-engine.js';
import {
  HIGHER_TIMEFRAME_ALPHA_COUNT,
  HIGHER_TIMEFRAME_COMPONENT_COUNT,
  HIGHER_TIMEFRAME_GATE_COUNT,
  HIGHER_TIMEFRAME_REGISTRY,
} from '../src/knowledge/higher-timeframe-registry.js';
import { HIGHER_TIMEFRAME_FOLDS, HIGHER_TIMEFRAME_LAG_CONTROLS, runHigherTimeframeWave3 } from '../src/research/higher-timeframe-runner.js';

const start=Date.UTC(2025,0,1)/1000;
const series=[];let price=42000;
for(let i=0;i<430;i++){
  const day=Math.floor(i/6);
  const phase=day<22?.0022:day<40?-.0016:day<55?.0003:.0017;
  const cycle=Math.sin(i/9)*.0018;
  const shock=i%73===0?.012:i%91===0?-.01:0;
  const ret=phase+cycle+shock;
  const o=price,c=Math.max(100,price*(1+ret));
  series.push({t:start+i*FOUR_HOURS_SECONDS,o,h:Math.max(o,c)*(1.003+Math.abs(Math.sin(i/7))*.002),l:Math.min(o,c)*(0.997-Math.abs(Math.cos(i/8))*.001),c,volume:180+(i%19)*13+(i%47===0?420:0),trades:60+i%17});
  price=c;
}

assert.equal(HIGHER_TIMEFRAME_REGISTRY.components.length,HIGHER_TIMEFRAME_COMPONENT_COUNT);
assert.equal(HIGHER_TIMEFRAME_REGISTRY.components.filter(item=>item.role==='alpha').length,HIGHER_TIMEFRAME_ALPHA_COUNT);
assert.equal(HIGHER_TIMEFRAME_REGISTRY.components.filter(item=>item.role==='gate').length,HIGHER_TIMEFRAME_GATE_COUNT);
assert.equal(HIGHER_TIMEFRAME_COMPONENT_COUNT,6);assert.equal(HIGHER_TIMEFRAME_ALPHA_COUNT,4);assert.equal(HIGHER_TIMEFRAME_GATE_COUNT,2);
assert.ok(HIGHER_TIMEFRAME_REGISTRY.components.every(item=>item.researchOnly&&item.activeInChampion===false&&item.activeInKnowledgeForward001===false));
assert.equal(HIGHER_TIMEFRAME_REGISTRY.philosophy.partialDailyBarForbidden,true);assert.equal(HIGHER_TIMEFRAME_REGISTRY.philosophy.generatedCombinations,false);assert.equal(HIGHER_TIMEFRAME_REGISTRY.philosophy.rawScoreMinusCost,false);

const targetDay=50;
const beforeDailyCloseIdx=targetDay*6+4;
const closingFourHourIdx=targetDay*6+5;
const before=buildClosedDailySeries(series,beforeDailyCloseIdx);
const after=buildClosedDailySeries(series,closingFourHourIdx);
assert.equal(before.daily.at(-1).t,start+(targetDay-1)*DAY_SECONDS,'partial current UTC day must not enter D1 context');
assert.equal(after.daily.at(-1).t,start+targetDay*DAY_SECONDS,'20:00 UTC 4H bar close should complete the UTC D1 candle');
assert.equal(after.daily.at(-1).sourceBars,6);assert.equal(after.daily.at(-1).sourceStartTime,start+targetDay*DAY_SECONDS);assert.equal(after.daily.at(-1).sourceEndTime,start+targetDay*DAY_SECONDS+5*FOUR_HOURS_SECONDS);

const fixedIdx=365;
const featuresFull=buildHigherTimeframeFeatures(series,fixedIdx);
const featuresPrefix=buildHigherTimeframeFeatures(series.slice(0,fixedIdx+1),fixedIdx);
assert.equal(featuresFull.status,'complete');assert.deepEqual(featuresFull,featuresPrefix,'future appended bars must not alter historical HTF features');
const futureMutated=structuredClone(series);for(let i=fixedIdx+1;i<futureMutated.length;i++){futureMutated[i].o*=3;futureMutated[i].h*=4;futureMutated[i].l*=.2;futureMutated[i].c*=3;futureMutated[i].volume*=9;}
assert.deepEqual(buildHigherTimeframeFeatures(futureMutated,fixedIdx),featuresFull,'future value mutation must not affect historical HTF features');
assert.ok(featuresFull.lastDailyBarCloseTime<=featuresFull.decisionInfoTime);assert.equal(featuresFull.causality.fullyClosedUtcDailyBarsOnly,true);assert.equal(featuresFull.causality.futureFourHourBarsForbidden,true);

const engine=new HigherTimeframeContextEngine();
const analysisFull=engine.analyze(series,fixedIdx);const analysisPrefix=engine.analyze(series.slice(0,fixedIdx+1),fixedIdx);const analysisFutureMutated=engine.analyze(futureMutated,fixedIdx);
assert.equal(analysisFull.status,'complete');assert.deepEqual(analysisFull,analysisPrefix,'append-future invariant failed for Wave3 decision');assert.deepEqual(analysisFull,analysisFutureMutated,'future mutation changed Wave3 decision');
assert.equal(analysisFull.components.length,6);assert.equal(analysisFull.alphaComponents.length,4);assert.ok(analysisFull.components.filter(item=>item.role==='gate').every(item=>item.score===0&&item.direction===0));
assert.equal(analysisFull.governance.gateIsDirectionalVote,false);assert.equal(analysisFull.governance.rawScoreMinusCost,false);assert.equal(analysisFull.governance.activeInKnowledgeForward001,false);

const sourceBefore=JSON.stringify(series);
const evaluation=runHigherTimeframeWave3({series,dataSignature:'wave3-causality-test'});
assert.equal(evaluation.status,'complete');assert.equal(JSON.stringify(series),sourceBefore,'Wave3 research evaluation mutated source series');
assert.equal(evaluation.ablations.length,6);assert.deepEqual(evaluation.lagControls.lags,[1,2,3,6,9,12,18,24]);assert.equal(evaluation.lagControls.replicates.length,8);assert.equal(evaluation.lagControls.formalPValue,false);assert.equal(evaluation.lagControls.futureDecisionUsed,false);
assert.equal(evaluation.folds.length,HIGHER_TIMEFRAME_FOLDS);for(let i=0;i<evaluation.folds.length;i++){assert.equal(evaluation.folds[i].exitCrossesFoldBoundary,false);if(i>0)assert.ok(evaluation.folds[i].startIndex>evaluation.folds[i-1].endIndex,'chronological fold outcome windows must not overlap');}
assert.equal(evaluation.promotionEligible,false);assert.equal(evaluation.methodology.pristineUntouchedOOS,false);assert.equal(evaluation.methodology.noFittingPerformed,true);assert.equal(evaluation.methodology.rawScoreMinusCost,false);assert.equal(evaluation.methodology.usedByKnowledgeForward001,false);assert.equal(evaluation.methodology.foldOutcomeOverlap,false);
for(const replicate of evaluation.lagControls.replicates)for(const trade of replicate.trades){assert.ok(trade.signalIndex<trade.entryIndex);assert.equal(trade.futureDecisionUsed,false);}

console.log('Higher-Timeframe Context Wave 3 v0.19 causality/regression tests passed.');
