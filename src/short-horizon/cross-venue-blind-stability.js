import {CROSS_VENUE_BLIND_REVEAL_SCHEMA} from './cross-venue-blind-reveal.js';
import {CROSS_VENUE_BLIND_PROTOCOL} from './cross-venue-blind-manifest.js';

export const CROSS_VENUE_BLIND_STABILITY_SCHEMA='voicetrader-cross-venue-blind-stability-v1';
export const CROSS_VENUE_BLIND_STABILITY_BLOCKS=4;
const round=(v,d=8)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};
function directionalAgreementRate(rows){const directional=rows.filter((o)=>o?.replication?.directionalPair===true);return {selected:rows.length,directionalPairs:directional.length,rate:directional.length?round(directional.filter((o)=>o?.replication?.directionalAgreement===true).length/directional.length,6):null};}
function blockRows(rows,blockIndex){const sorted=[...rows].sort((a,b)=>Number(a.startTimestampMs)-Number(b.startTimestampMs)||String(a.observationId).localeCompare(String(b.observationId))),a=Math.floor(blockIndex*sorted.length/CROSS_VENUE_BLIND_STABILITY_BLOCKS),b=Math.floor((blockIndex+1)*sorted.length/CROSS_VENUE_BLIND_STABILITY_BLOCKS);return sorted.slice(a,b);}
function delta(a,b){return Number.isFinite(Number(a))&&a!==null&&Number.isFinite(Number(b))&&b!==null?round(Number(a)-Number(b),6):null;}
function sign(v){const n=Number(v);return !Number.isFinite(n)||n===0?0:n>0?1:-1;}

export function buildCrossVenueBlindStability(reveal,{generatedAtMs=Date.now()}={}){
  if(reveal?.schemaVersion!==CROSS_VENUE_BLIND_REVEAL_SCHEMA||!Array.isArray(reveal?.revealedObservations)||reveal?.governance?.allSelectedRetired!==true||reveal?.governance?.noTopUpAfterReveal!==true)throw new Error('cross-venue-blind-stability-reveal-invalid');
  const instruments=[];
  for(const instrument of CROSS_VENUE_BLIND_PROTOCOL.instruments){
    const primary=reveal.revealedObservations.filter((o)=>o.canonicalInstrument===instrument&&o.sampleRole==='BOUNDARY_PRIMARY'),control=reveal.revealedObservations.filter((o)=>o.canonicalInstrument===instrument&&o.sampleRole==='PHASE_CONTROL');
    const primaryAll=directionalAgreementRate(primary),controlAll=directionalAgreementRate(control),blocks=[];
    for(let i=0;i<CROSS_VENUE_BLIND_STABILITY_BLOCKS;i++){const p=directionalAgreementRate(blockRows(primary,i)),c=directionalAgreementRate(blockRows(control,i)),d=delta(p.rate,c.rate);blocks.push({block:i+1,boundary:p,phaseControl:c,directionalAgreementDeltaBoundaryMinusPhase:d,deltaSign:d==null?null:sign(d)});}
    const valid=blocks.filter((x)=>x.directionalAgreementDeltaBoundaryMinusPhase!=null),positive=valid.filter((x)=>x.deltaSign>0).length,negative=valid.filter((x)=>x.deltaSign<0).length,zero=valid.filter((x)=>x.deltaSign===0).length,overallDelta=delta(primaryAll.rate,controlAll.rate);let temporalStatus='INSUFFICIENT_BLOCKS';if(valid.length===CROSS_VENUE_BLIND_STABILITY_BLOCKS){temporalStatus='MIXED';if(overallDelta>0&&positive>=3)temporalStatus='POSITIVE_CONSISTENT';else if(overallDelta<0&&negative>=3)temporalStatus='NEGATIVE_CONSISTENT';else if(overallDelta===0&&zero>=3)temporalStatus='FLAT_CONSISTENT';}
    instruments.push({canonicalInstrument:instrument,boundary:primaryAll,phaseControl:controlAll,overallDirectionalAgreementDeltaBoundaryMinusPhase:overallDelta,temporalBlocks:blocks,positiveBlocks:positive,negativeBlocks:negative,zeroBlocks:zero,temporalStatus});
  }
  const deltas=instruments.map((x)=>x.overallDirectionalAgreementDeltaBoundaryMinusPhase).filter((x)=>x!=null),signs=deltas.map(sign);let crossInstrumentStatus='INSUFFICIENT';if(deltas.length===CROSS_VENUE_BLIND_PROTOCOL.instruments.length){if(signs.every((x)=>x>0))crossInstrumentStatus='POSITIVE_SAME_SIGN';else if(signs.every((x)=>x<0))crossInstrumentStatus='NEGATIVE_SAME_SIGN';else if(signs.every((x)=>x===0))crossInstrumentStatus='FLAT_SAME_SIGN';else crossInstrumentStatus='MIXED_SIGN';}
  return {schemaVersion:CROSS_VENUE_BLIND_STABILITY_SCHEMA,manifestId:reveal.manifestId,revealId:reveal.revealId,generatedAtMs:Number(generatedAtMs),instruments,crossInstrumentStatus,governance:{descriptiveOnly:true,temporalBlocksPreregisteredAfterProtocolButBeforeLiveExamExposure:true,noIidSignificanceClaim:true,noPValueClaim:true,noPredictivePerformanceClaim:true,noProfitabilityClaim:true,blindAlreadyRetired:true,noTopUpAfterReveal:true,adaptiveLearningAuthorized:false,predictionInputAuthorized:false,automaticPromotion:false,executionAuthorized:false,actualNetEvAvailable:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
