export const PROSPECTIVE_OBSERVATORY_VERSION='prospective-observatory-0.1';
const clone=value=>JSON.parse(JSON.stringify(value));
const num=value=>Number.isFinite(Number(value))?Number(value):null;
const sortedUnique=values=>[...new Set((values||[]).map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);

function healthFor(document,kind){
  if(!document)return {kind,status:'unavailable',healthy:false,reasons:['remote-unavailable'],collector:null,replayAudit:null,attributionAudit:null,observedBars:0,attributionRecords:0,evidenceRecords:0};
  const reasons=[];const collector=document.collector||{};const replay=document.audit||{};const attribution=document.attributionAudit||{};const ledger=document.attributionLedger||{};const archive=document.evidenceArchive||{};
  if(collector.status!=='success')reasons.push(`collector:${collector.status||'missing'}`);
  if(replay.pass!==true)reasons.push(`replay:${replay.status||'missing'}`);
  if(attribution.pass!==true)reasons.push(`attribution:${attribution.status||'missing'}`);
  if((ledger.mergeConflicts||[]).length)reasons.push(`attribution-conflicts:${ledger.mergeConflicts.length}`);
  const observed=sortedUnique(archive.observedBarTimes);
  if(Number(attribution?.checked?.expectedBars??observed.length)!==Number(attribution?.checked?.records??ledger.records?.length??0))reasons.push('attribution-coverage-mismatch');
  return {kind,status:reasons.length?'blocked':'healthy',healthy:reasons.length===0,reasons,collector:{version:collector.version||null,lastRunAt:collector.lastRunAt||null,totalMarketBars:num(collector.totalMarketBars),archivedDecisionRecords:num(collector.archivedDecisionRecords),archivedEvidenceRecords:num(collector.archivedEvidenceRecords),archivedAttributionRecords:num(collector.archivedAttributionRecords)},replayAudit:{version:replay.version||null,status:replay.status||null,pass:replay.pass===true,errorCount:num(replay.errorCount)},attributionAudit:{version:attribution.version||null,status:attribution.status||null,pass:attribution.pass===true,errorCount:num(attribution.errorCount)},observedBars:observed.length,attributionRecords:Array.isArray(ledger.records)?ledger.records.length:0,evidenceRecords:Array.isArray(archive.evidence)?archive.evidence.length:0};
}

function marketBarAt(document,candleTime){return (document?.market?.bars||[]).find(bar=>Number(bar?.t)===Number(candleTime))||null;}
function decisionsAt(document,candleTime){return (document?.evidenceArchive?.decisions||[]).filter(item=>Number(item?.candleTime)===Number(candleTime)).map(item=>({sourceId:item.sourceId,role:item.role,decision:item.decision,regime:item.regime||null,riskGate:item.riskGate||null}));}
function evidenceForEntry(document,candleTime){return (document?.evidenceArchive?.evidence||[]).filter(item=>Number(item?.entryTime)===Number(candleTime)).map(item=>({sourceId:item.sourceId,side:item.side,entryTime:item.entryTime,exitTime:item.exitTime,netReturnBps:num(item.netReturnBps),grossReturnBps:num(item.grossReturnBps),estimatedRoundTripCostBps:num(item.estimatedRoundTripCostBps)}));}

export function getProspectiveObservatoryTimes(document){return sortedUnique(document?.attributionLedger?.records?.map(item=>item.candleTime));}
export function getProspectiveObservatoryRecord(document,candleTime){return clone((document?.attributionLedger?.records||[]).find(item=>Number(item?.candleTime)===Number(candleTime))||null);}

export function buildProspectiveObservatoryStream(document,kind){
  const health=healthFor(document,kind);const times=getProspectiveObservatoryTimes(document);const latestTime=times.at(-1)||null;return {version:PROSPECTIVE_OBSERVATORY_VERSION,kind,health,times,latestTime,latest:latestTime?buildProspectiveObservatoryBar(document,kind,latestTime):null};
}

export function buildProspectiveObservatoryBar(document,kind,candleTime){
  const record=getProspectiveObservatoryRecord(document,candleTime);if(!record)return null;return {kind,candleTime:Number(candleTime),marketBar:clone(marketBarAt(document,candleTime)),decisions:decisionsAt(document,candleTime),completedEvidence:evidenceForEntry(document,candleTime),attribution:record,methodology:{remoteDurableArchiveOnly:true,descriptiveOnly:true,causalAttribution:false,futureOutcomeUsedByAttribution:false,readOnly:true,changesDecisionEngine:false}};
}

export function buildProspectiveObservatoryModel({knowledgeDocument=null,htfDocument=null}={}){
  return {version:PROSPECTIVE_OBSERVATORY_VERSION,knowledge:buildProspectiveObservatoryStream(knowledgeDocument,'knowledge'),htf:buildProspectiveObservatoryStream(htfDocument,'htf'),governance:{remoteDurableArchiveOnly:true,readOnly:true,descriptiveOnly:true,causalAttribution:false,optimizer:false,adaptiveWeights:false,automaticPruning:false,automaticPromotion:false,usedByLiveDecisionEngine:false}};
}
