import assert from 'node:assert/strict';
import {
  CHAMPION_PROMOTION_CANDIDATE_IDS,
  CHAMPION_PROMOTION_CONFIRMATION_EPOCH_ID,
  CHAMPION_PROMOTION_LAG_CONTROLS,
  CHAMPION_PROMOTION_PROTOCOL,
  CHAMPION_PROMOTION_STAGE_A,
  CHAMPION_PROMOTION_STAGE_B,
  assertChampionPromotionProtocol,
} from '../src/research/champion-promotion-protocol.js';
import {
  buildProspectiveLagControls,
  buildProspectivePromotionFolds,
  evaluateChampionPromotionQualification,
  inspectChampionPromotionIntegrity,
} from '../src/research/champion-promotion-evaluator.js';
import {
  FOUR_HOURS_SECONDS,
  FROZEN_KNOWLEDGE_EVALUATOR_COMMIT,
  emptyKnowledgeForwardRemoteDocument,
} from '../src/research/knowledge-forward-remote.js';
import { KNOWLEDGE_FORWARD_FREEZE_UNIX } from '../src/research/knowledge-forward-epoch.js';

assert.equal(assertChampionPromotionProtocol(),true);
assert.equal(CHAMPION_PROMOTION_CANDIDATE_IDS.length,4);
assert.deepEqual(CHAMPION_PROMOTION_LAG_CONTROLS,[1,2,3,6,9,12,18,24]);
assert.equal(CHAMPION_PROMOTION_STAGE_A.minElapsedCalendarDays,90);
assert.equal(CHAMPION_PROMOTION_STAGE_A.minObservedBars,540);
assert.equal(CHAMPION_PROMOTION_STAGE_A.minCandidateTrades,30);
assert.equal(CHAMPION_PROMOTION_STAGE_A.directPromotionForbidden,true);
assert.equal(CHAMPION_PROMOTION_STAGE_A.resultCanOnlyBe,'confirmationReviewReady');
assert.equal(CHAMPION_PROMOTION_CONFIRMATION_EPOCH_ID,'knowledge-confirm-001');
assert.equal(CHAMPION_PROMOTION_STAGE_B.preNominationDataForbidden,true);
assert.equal(CHAMPION_PROMOTION_STAGE_B.automaticPromotion,false);
assert.equal(CHAMPION_PROMOTION_PROTOCOL.governance.qualificationDataCannotBeConfirmationData,true);
assert.equal(CHAMPION_PROMOTION_PROTOCOL.governance.automaticSelection,false);
assert.equal(CHAMPION_PROMOTION_PROTOCOL.governance.automaticPromotion,false);
assert.equal(CHAMPION_PROMOTION_PROTOCOL.governance.championMutation,false);

const empty=emptyKnowledgeForwardRemoteDocument();
const emptyEval=evaluateChampionPromotionQualification(empty);
assert.equal(emptyEval.status,'complete');
assert.equal(emptyEval.promotionEligible,false);
assert.equal(emptyEval.anyConfirmationReviewReady,false);
assert.equal(emptyEval.selectedCandidateId,null);
assert.equal(emptyEval.candidates.length,4);
assert.ok(emptyEval.candidates.every(item=>item.promotionEligible===false));
assert.ok(emptyEval.candidates.every(item=>item.blockers.includes('archive-integrity-not-clean')));
assert.equal(emptyEval.methodology.directChampion002PromotionForbidden,true);
assert.equal(emptyEval.methodology.qualificationDataCannotBeConfirmationData,true);

function makeRemote(barCount=620){
  const doc=emptyKnowledgeForwardRemoteDocument();
  const bars=[];
  const start=KNOWLEDGE_FORWARD_FREEZE_UNIX-80*FOUR_HOURS_SECONDS;
  let price=30000;
  for(let i=0;i<barCount+80;i++){
    const post=i>=80;
    const phase=post?(i-80)%30:-1;
    let ret=0.00005;
    if(phase===1||phase===2||phase===3)ret=0.012;
    if(phase===4)ret=-0.0345;
    const o=price,c=Math.max(100,price*(1+ret));
    bars.push({t:start+i*FOUR_HOURS_SECONDS,o,h:Math.max(o,c)*1.002,l:Math.min(o,c)*.998,c,volume:100+i%17,trades:40+i%11});
    price=c;
  }
  const observed=bars.slice(80).map(bar=>bar.t);
  const decisions=[];
  for(const candidateId of CHAMPION_PROMOTION_CANDIDATE_IDS){
    for(let i=10;i<observed.length-30;i+=30){
      const candleTime=observed[i];
      decisions.push({decisionKey:`knowledge-forward-001:${candidateId}:${candleTime}`,epochId:'knowledge-forward-001',sourceId:candidateId,candleTime,decision:'ENTER_LONG'});
    }
  }
  doc.market.bars=bars;
  doc.market.continuity={barCount:bars.length,gapCount:0,missingBarTimes:[]};
  doc.market.closedBarCount=bars.length;
  doc.market.firstBarTime=bars[0].t;
  doc.market.lastBarTime=bars.at(-1).t;
  doc.evidenceArchive.observedBarTimes=observed;
  doc.evidenceArchive.decisions=decisions;
  doc.evidenceArchive.evidence=[];
  doc.collector.status='success';
  doc.collector.lastRunAt='2026-11-30T00:23:00Z';
  doc.collector.sourceFetchedAt='2026-11-30T00:23:00Z';
  doc.collector.evaluatorCommit=FROZEN_KNOWLEDGE_EVALUATOR_COMMIT;
  doc.collector.marketConflicts=[];
  return doc;
}

const mature=makeRemote();
const integrity=inspectChampionPromotionIntegrity(mature);
assert.equal(integrity.clean,true,'clean remote archive without completed trades should still pass structural integrity');
const folds=buildProspectivePromotionFolds(mature);
assert.equal(folds.length,3);
assert.ok(folds.every((fold,index)=>index===0||fold.startTime>folds[index-1].endTime));
const lag=buildProspectiveLagControls({remoteDocument:mature,sourceId:CHAMPION_PROMOTION_CANDIDATE_IDS[0]});
assert.deepEqual(lag.lags,[1,2,3,6,9,12,18,24]);
assert.equal(lag.archivedPastDecisionsOnly,true);
assert.equal(lag.futureDecisionUsed,false);
assert.equal(lag.formalPValue,false);
assert.ok(lag.replicates.some(item=>item.trades.length>0));
for(const replicate of lag.replicates)for(const trade of replicate.trades){
  assert.ok(trade.signalTime<trade.entryTime,'lag control signal must always be strictly earlier than entry');
  assert.equal(trade.futureDecisionUsed,false);
}
const matureEval=evaluateChampionPromotionQualification(mature);
assert.equal(matureEval.promotionEligible,false);
assert.equal(matureEval.selectedCandidateId,null);
assert.equal(matureEval.automaticNomination,false);
assert.equal(matureEval.automaticPromotion,false);
assert.ok(matureEval.elapsedCalendarDays>=90);
assert.ok(matureEval.observedBars>=540);
assert.ok(matureEval.candidates.every(item=>item.blockers.includes('candidate-trades-below-minimum')));

const bad={...mature,frozenEvaluatorCommit:'deadbeef'};
const badEval=evaluateChampionPromotionQualification(bad);
assert.equal(badEval.integrity.clean,false);
assert.ok(badEval.integrity.reasons.includes('frozen-evaluator-mismatch'));
assert.ok(badEval.candidates.every(item=>item.confirmationReviewReady===false));
assert.ok(badEval.candidates.every(item=>item.promotionEligible===false));

console.log('Two-stage Champion-002 Promotion Protocol v0.17 regression tests passed.');
