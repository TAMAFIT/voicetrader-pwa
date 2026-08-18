import { evaluateLearningReadiness, LEARNING_PRIMARY_HORIZON_BARS } from './learning-readiness-protocol.js';

export const PROSPECTIVE_COLLECTION_HEALTH_VERSION='prospective-collection-health-0.1';
export const PROSPECTIVE_COLLECTION_STALE_AFTER_HOURS=12;
export const PROSPECTIVE_COLLECTION_FUTURE_SKEW_SECONDS=15*60;
export const PROSPECTIVE_COLLECTION_HEALTH_GOVERNANCE=Object.freeze({
  readOnly:true,
  stalenessIsNotCorruption:true,
  noEtaClaim:true,
  noEdgeClaim:true,
  noProbabilityClaim:true,
  automaticTraining:false,
  automaticApproval:false,
  automaticPromotion:false,
  executionAuthorized:false,
  writesProspectiveExperience:false,
  writesLifecycle:false,
  writesEvidence:false,
  usedByDecisionEngine:false,
});

const HOURS=60*60;
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>Number.isFinite(Number(value));
const isoToSeconds=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed/1000:null;};
const round2=value=>Math.round(Number(value)*100)/100;

function labelCounts(rows){
  const horizons=new Set();for(const row of rows)for(const key of Object.keys(row?.labels||{}))horizons.add(String(key));
  const result={};for(const horizon of [...horizons].sort((a,b)=>Number(a)-Number(b))){const byInstrument={},totals={matured:0,pending:0,other:0};for(const row of rows){const instrument=String(row?.instrument||'UNKNOWN'),label=row?.labels?.[horizon],status=label?.status||'missing';const slot=byInstrument[instrument]??={matured:0,pending:0,other:0};if(status==='matured'){slot.matured++;totals.matured++;}else if(status==='pending'){slot.pending++;totals.pending++;}else {slot.other++;totals.other++;}byInstrument[instrument]=slot;}result[horizon]={totals,byInstrument};}return result;
}
function directionCounts(rows,horizon=LEARNING_PRIMARY_HORIZON_BARS){const total={UP:0,DOWN:0,FLAT:0,OTHER:0},byInstrument={};for(const row of rows){const label=row?.labels?.[horizon];if(label?.status!=='matured')continue;const direction=String(label?.direction||'OTHER'),bucket=['UP','DOWN','FLAT'].includes(direction)?direction:'OTHER',slot=byInstrument[row.instrument]??={UP:0,DOWN:0,FLAT:0,OTHER:0};slot[bucket]++;total[bucket]++;byInstrument[row.instrument]=slot;}return {horizonBars:horizon,total,byInstrument};}
function timeCoverage(rows){const byInstrument={};for(const row of rows){const instrument=String(row?.instrument||'UNKNOWN'),t=Number(row?.decisionBarOpenTime),available=Number(row?.decisionAvailableTime),slot=byInstrument[instrument]??={rows:0,firstDecisionBarOpenTime:null,lastDecisionBarOpenTime:null,lastDecisionAvailableTime:null};slot.rows++;if(Number.isFinite(t)){slot.firstDecisionBarOpenTime=slot.firstDecisionBarOpenTime===null?t:Math.min(slot.firstDecisionBarOpenTime,t);slot.lastDecisionBarOpenTime=slot.lastDecisionBarOpenTime===null?t:Math.max(slot.lastDecisionBarOpenTime,t);}if(Number.isFinite(available))slot.lastDecisionAvailableTime=slot.lastDecisionAvailableTime===null?available:Math.max(slot.lastDecisionAvailableTime,available);byInstrument[instrument]=slot;}return byInstrument;}
function storageOrderDiagnostics(rows){const last={},anomalies=[];for(const row of rows){const instrument=String(row?.instrument||'UNKNOWN'),time=Number(row?.decisionBarOpenTime);if(Number.isFinite(time)&&Number.isFinite(last[instrument])&&time<last[instrument])anomalies.push({instrument,previousDecisionBarOpenTime:last[instrument],decisionBarOpenTime:time,experienceKey:row?.experienceKey??null});if(Number.isFinite(time))last[instrument]=time;}return {nonMonotonicPairs:anomalies.length,samples:anomalies.slice(0,10)};}
function sourceFreshness(sourceBranches,nowSeconds,staleAfterSeconds){return (sourceBranches||[]).map(source=>{const committed=isoToSeconds(source?.committedAt),ageHours=committed===null?null:round2((nowSeconds-committed)/HOURS);return {name:String(source?.name||''),commitSha:String(source?.commitSha||''),committedAt:source?.committedAt??null,ageHours,stale:ageHours!==null&&ageHours>staleAfterSeconds/HOURS};});}

export function evaluateProspectiveCollectionHealth(dataset,{nowSeconds=Date.now()/1000,staleAfterHours=PROSPECTIVE_COLLECTION_STALE_AFTER_HOURS,futureSkewSeconds=PROSPECTIVE_COLLECTION_FUTURE_SKEW_SECONDS,sourceBranches=[]}={}){
  const errors=[],warnings=[],rows=Array.isArray(dataset?.rows)?dataset.rows:[];
  if(dataset?.schemaVersion!=='prospective-experience-dataset-0.1')errors.push('dataset-schema-mismatch');
  if(dataset?.audit?.pass!==true)errors.push('persisted-audit-not-pass');
  if((dataset?.mergeConflicts||[]).length)errors.push('merge-conflicts-present');
  if(!Array.isArray(dataset?.rows))errors.push('rows-not-array');
  const seen=new Set(),duplicateKeys=[];for(const row of rows){const key=String(row?.experienceKey||'');if(!key)errors.push('experience-key-missing');else if(seen.has(key))duplicateKeys.push(key);else seen.add(key);if(!finite(row?.decisionBarOpenTime))errors.push(`decision-time-invalid:${key||'unknown'}`);if(!finite(row?.decisionAvailableTime))errors.push(`decision-available-time-invalid:${key||'unknown'}`);const decisionTime=Number(row?.decisionBarOpenTime),decisionAvailable=Number(row?.decisionAvailableTime);if(Number.isFinite(decisionTime)&&decisionTime>nowSeconds+futureSkewSeconds)errors.push(`decision-time-in-future:${key}`);if(Number.isFinite(decisionAvailable)&&decisionAvailable>nowSeconds+futureSkewSeconds)errors.push(`decision-available-time-in-future:${key}`);for(const [horizon,label] of Object.entries(row?.labels||{})){if(label?.status==='matured'){const availableAt=Number(label?.availableAtTime);if(!Number.isFinite(availableAt))errors.push(`matured-label-available-time-invalid:${key}:${horizon}`);else if(availableAt>nowSeconds+futureSkewSeconds)errors.push(`matured-label-in-future:${key}:${horizon}`);}}}
  if(duplicateKeys.length)errors.push(`duplicate-experience-keys:${duplicateKeys.length}`);
  const updateSeconds=isoToSeconds(dataset?.updatedAt),coverage=timeCoverage(rows),latestDecisionAvailable=Math.max(-Infinity,...Object.values(coverage).map(item=>Number(item.lastDecisionAvailableTime)).filter(Number.isFinite)),latestEvidenceSeconds=Math.max(updateSeconds??-Infinity,Number.isFinite(latestDecisionAvailable)?latestDecisionAvailable:-Infinity);const freshnessAgeHours=Number.isFinite(latestEvidenceSeconds)?round2((nowSeconds-latestEvidenceSeconds)/HOURS):null,stale=freshnessAgeHours===null||freshnessAgeHours>staleAfterHours;if(stale)warnings.push('prospective-collection-stale');const sourceHealth=sourceFreshness(sourceBranches,nowSeconds,staleAfterHours*HOURS);for(const source of sourceHealth)if(source.stale)warnings.push(`source-branch-stale:${source.name}`);
  const order=storageOrderDiagnostics(rows);if(order.nonMonotonicPairs)warnings.push('storage-order-non-monotonic');
  const readiness=evaluateLearningReadiness(dataset),ready=readiness.gates.btcResearchModelReady===true||readiness.gates.crossMarketResearchModelReady===true;
  const state=errors.length?'DATA_INTEGRITY_BLOCKED':ready?'READY_HUMAN_ACTION_REQUIRED':stale?'STALE':'COLLECTING';
  const nextAction=state==='DATA_INTEGRITY_BLOCKED'?'repair-prospective-data-integrity':state==='READY_HUMAN_ACTION_REQUIRED'?'human-review-register-and-freeze-model-experiment':state==='STALE'?'inspect-collector-and-builder-freshness':'continue-prospective-collection';
  return {version:PROSPECTIVE_COLLECTION_HEALTH_VERSION,state,healthy:errors.length===0,readyForHumanExperimentAction:ready,executionAuthorized:false,nextAction,errors:[...new Set(errors)],warnings:[...new Set(warnings)],counts:{rows:rows.length,labelStatusByHorizon:labelCounts(rows),primaryDirection:directionCounts(rows)},coverage,freshness:{datasetUpdatedAt:dataset?.updatedAt??null,latestEvidenceSeconds:Number.isFinite(latestEvidenceSeconds)?latestEvidenceSeconds:null,ageHours:freshnessAgeHours,staleAfterHours,stale,sourceBranches:sourceHealth},diagnostics:{duplicateExperienceKeys:[...new Set(duplicateKeys)].slice(0,50),storageOrder:order,persistedAudit:clone(dataset?.audit||null)},learningReadiness:readiness,governance:{...PROSPECTIVE_COLLECTION_HEALTH_GOVERNANCE}};
}
