export const KRAKEN_MICROSTRUCTURE_FEATURE_SCHEMA='voicetrader-kraken-microstructure-event-v1';

const round=(value,digits=10)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
function sorted(map,side){const values=[...map.values()].map((l)=>({price:Number(l.price),qty:Number(l.qty)})).filter((l)=>l.price>0&&l.qty>=0);values.sort((a,b)=>side==='ask'?a.price-b.price:b.price-a.price);return values;}

export function snapshotKrakenBookState(state,{depth=10}={}){
  if(!state)return {trusted:false,bids:[],asks:[]};
  return {trusted:state.trusted===true,snapshotSeen:state.snapshotSeen===true,bids:sorted(state.bids,'bid').slice(0,depth),asks:sorted(state.asks,'ask').slice(0,depth)};
}

function topMetrics(snapshot){
  const bid=snapshot?.bids?.[0],ask=snapshot?.asks?.[0];
  if(!bid||!ask||!(ask.price>=bid.price))return null;
  const spread=ask.price-bid.price,mid=(ask.price+bid.price)/2,sum=bid.qty+ask.qty;
  const microprice=sum>0?(ask.price*bid.qty+bid.price*ask.qty)/sum:null;
  const bidDepth=snapshot.bids.reduce((a,l)=>a+l.qty,0),askDepth=snapshot.asks.reduce((a,l)=>a+l.qty,0),depthSum=bidDepth+askDepth;
  return {bestBid:bid,bestAsk:ask,spread:round(spread),spreadBps:round(spread/mid*10000,6),mid:round(mid),microprice:round(microprice),micropriceMinusMid:round(microprice==null?null:microprice-mid),top1Imbalance:sum>0?round((bid.qty-ask.qty)/sum,8):null,depthImbalance:depthSum>0?round((bidDepth-askDepth)/depthSum,8):null,bidDepth:round(bidDepth),askDepth:round(askDepth)};
}

export function calculateTopOfBookOfi(previous,current){
  const pb=previous?.bids?.[0],pa=previous?.asks?.[0],cb=current?.bids?.[0],ca=current?.asks?.[0];
  if(!pb||!pa||!cb||!ca)return null;
  let bidEvent=0,askEvent=0;
  if(cb.price>=pb.price)bidEvent+=cb.qty;
  if(cb.price<=pb.price)bidEvent-=pb.qty;
  if(ca.price<=pa.price)askEvent+=ca.qty;
  if(ca.price>=pa.price)askEvent-=pa.qty;
  return {ofi:round(bidEvent-askEvent),bidEvent:round(bidEvent),askEvent:round(askEvent)};
}

export function buildBookMicrostructureFeature({symbol,previous,current,integrityEvidence,receivedTimestampMs,sourceSha256,sequence}={}){
  if(integrityEvidence?.match!==true||integrityEvidence?.trustedAfter!==true)return null;
  const metrics=topMetrics(current);if(!metrics)return null;
  const ofi=previous?.trusted?calculateTopOfBookOfi(previous,current):null;
  return {schemaVersion:KRAKEN_MICROSTRUCTURE_FEATURE_SCHEMA,eventType:'BOOK',symbol,sourceSequence:sequence,sourceSha256,receivedTimestampMs,providerTimestamp:integrityEvidence.providerTimestamp??null,book:{...metrics,ofi:ofi?.ofi??null,bidEvent:ofi?.bidEvent??null,askEvent:ofi?.askEvent??null,depthLevels:Math.min(current.bids.length,current.asks.length)},integrity:{providerChecksum:integrityEvidence.providerChecksum,localChecksum:integrityEvidence.localChecksum,checksumMatch:true,bookSynchronizationVerified:true},semantics:{ofiDefinition:'CONT_TOP_OF_BOOK_EVENT',ofiPositiveMeans:'BUY_PRESSURE',bookImbalanceDefinition:'SUM_BID_QTY_MINUS_ASK_QTY_OVER_SUM',micropriceDefinition:'ASK_X_BIDQ_PLUS_BID_X_ASKQ_OVER_QSUM',predictionInputAuthorized:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

function parseTradeRaw(rawText){return JSON.parse(String(rawText),(key,value,context)=>{if((key==='price'||key==='qty')&&typeof value==='number'&&context?.source)return context.source;return value;});}
export function extractTradeMicrostructureFeatures(rawText,{receivedTimestampMs=Date.now(),sourceSha256=null,sequence=null}={}){
  const payload=parseTradeRaw(rawText);if(payload?.channel!=='trade'||!Array.isArray(payload.data))return [];
  const records=[];
  for(const trade of payload.data){const side=String(trade.side||'').toLowerCase();const qty=Number(trade.qty),price=Number(trade.price);if(!['buy','sell'].includes(side)||!(qty>0)||!(price>0))continue;const sign=side==='buy'?1:-1;records.push({schemaVersion:KRAKEN_MICROSTRUCTURE_FEATURE_SCHEMA,eventType:'TRADE',symbol:trade.symbol,sourceSequence:sequence,sourceSha256,receivedTimestampMs,providerTimestamp:trade.timestamp??null,trade:{tradeId:trade.trade_id??null,takerSide:side.toUpperCase(),price:round(price),qty:round(qty),signedQty:round(sign*qty),notional:round(price*qty),signedNotional:round(sign*price*qty)},integrity:{providerTradeEventObserved:true,bookChecksumNotApplicable:true},semantics:{tradeSideRepresentsTakerSide:true,signedFlowPositiveMeans:'AGGRESSIVE_BUY',predictionInputAuthorized:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}});}
  return records;
}
