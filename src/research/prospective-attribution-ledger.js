export const PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION='prospective-attribution-ledger-0.1';
const clone=value=>JSON.parse(JSON.stringify(value));
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
const canonical=value=>JSON.stringify(stable(value));
function sortedTimes(values=[]){return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);}

export function emptyProspectiveAttributionLedger(epochId){return {version:PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION,epochId,records:[],mergeConflicts:[],updatedAt:null,methodology:{descriptiveProvenanceOnly:true,causalAttribution:false,futureOutcomeUsed:false,optimizer:false,adaptiveWeights:false,automaticPruning:false,automaticPromotion:false,usedByLiveDecisionEngine:false}};}

export function mergeProspectiveAttributionLedger(existing,snapshot,{epochId,updatedAt=new Date().toISOString()}={}){
  const base=existing?.epochId===epochId?clone(existing):emptyProspectiveAttributionLedger(epochId);const conflicts=[];const map=new Map();
  for(const item of base.records||[])if(item?.attributionKey)map.set(item.attributionKey,clone(item));
  for(const item of snapshot?.records||[]){const key=item?.attributionKey;if(!key)continue;const prior=map.get(key);if(!prior)map.set(key,clone(item));else if(canonical(prior)!==canonical(item))conflicts.push({key,existing:prior,incoming:item});}
  return {...base,version:PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION,epochId,records:[...map.values()].sort((a,b)=>Number(a.candleTime)-Number(b.candleTime)),mergeConflicts:[...(base.mergeConflicts||[]),...conflicts],updatedAt};
}

export function auditProspectiveAttributionLedger({ledger,epochId,observedBarTimes=[]}={}){
  const errors=[];const expected=sortedTimes(observedBarTimes);const records=Array.isArray(ledger?.records)?ledger.records:[];const actual=records.map(item=>Number(item.candleTime)).filter(Number.isFinite).sort((a,b)=>a-b);
  if(ledger?.epochId!==epochId)errors.push('epoch-mismatch');
  if((ledger?.mergeConflicts||[]).length)errors.push('merge-conflict');
  if(new Set(records.map(item=>item.attributionKey)).size!==records.length)errors.push('duplicate-key');
  if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push('coverage-mismatch');
  if(records.some(item=>item.observedProspectively!==true||item.futureOutcomeUsed!==false))errors.push('future-safety-flag-mismatch');
  return {version:'prospective-attribution-audit-0.1',status:errors.length?'fail':'pass',pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)],checked:{expectedBars:expected.length,records:records.length},methodology:{exactObservedBarCoverage:true,semanticRecordImmutability:true,futureOutcomeForbidden:true,descriptiveOnly:true}};
}
