import {COINBASE_LOCAL_PRODUCTS} from './local-node-coinbase-wire.js';

export const COINBASE_MICROSTRUCTURE_FEATURE_SCHEMA='voicetrader-coinbase-microstructure-event-v1';
const allowedProducts=new Set(COINBASE_LOCAL_PRODUCTS);
const round=(value,digits=10)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};

function normalizedBook(snapshot){
  if(!snapshot)return {trusted:false,bids:[],asks:[]};
  const levels=(items)=>Array.isArray(items)?items.map((x)=>({price:Number(x?.price),qty:Number(x?.qty)})).filter((x)=>x.price>0&&x.qty>=0):[];
  const bids=levels(snapshot.bids).sort((a,b)=>b.price-a.price),asks=levels(snapshot.offers??snapshot.asks).sort((a,b)=>a.price-b.price);
  return {trusted:snapshot.trusted===true,bids,asks};
}

function topMetrics(snapshot){
  const bid=snapshot?.bids?.[0],ask=snapshot?.asks?.[0];if(!bid||!ask||!(ask.price>bid.price))return null;
  const spread=ask.price-bid.price,mid=(ask.price+bid.price)/2,topSum=bid.qty+ask.qty;
  const microprice=topSum>0?(ask.price*bid.qty+bid.price*ask.qty)/topSum:null;
  const bidDepth=snapshot.bids.reduce((a,l)=>a+l.qty,0),askDepth=snapshot.asks.reduce((a,l)=>a+l.qty,0),depthSum=bidDepth+askDepth;
  return {bestBid:bid,bestAsk:ask,spread:round(spread),spreadBps:round(spread/mid*10000,6),mid:round(mid),microprice:round(microprice),micropriceMinusMid:round(microprice==null?null:microprice-mid),top1Imbalance:topSum>0?round((bid.qty-ask.qty)/topSum,8):null,depthImbalance:depthSum>0?round((bidDepth-askDepth)/depthSum,8):null,bidDepth:round(bidDepth),askDepth:round(askDepth)};
}

export function calculateCoinbaseTopOfBookOfi(previous,current){
  const pb=previous?.bids?.[0],pa=previous?.asks?.[0],cb=current?.bids?.[0],ca=current?.asks?.[0];if(!pb||!pa||!cb||!ca)return null;
  let bidEvent=0,askEvent=0;
  if(cb.price>=pb.price)bidEvent+=cb.qty;if(cb.price<=pb.price)bidEvent-=pb.qty;
  if(ca.price<=pa.price)askEvent+=ca.qty;if(ca.price>=pa.price)askEvent-=pa.qty;
  return {ofi:round(bidEvent-askEvent),bidEvent:round(bidEvent),askEvent:round(askEvent)};
}

export function buildCoinbaseBookMicrostructureFeature({productId,previous,current,integrityEvidence,receivedTimestampMs,sourceSha256,sequence}={}){
  if(!allowedProducts.has(productId)||!['TRUSTED_SNAPSHOT','TRUSTED_UPDATE'].includes(integrityEvidence?.status)||integrityEvidence?.semantics?.localBookSynchronizationVerified!==true)return null;
  const currentBook=normalizedBook(current);if(!currentBook.trusted)return null;const metrics=topMetrics(currentBook);if(!metrics)return null;
  const previousBook=normalizedBook(previous),ofi=previousBook.trusted?calculateCoinbaseTopOfBookOfi(previousBook,currentBook):null;
  return {schemaVersion:COINBASE_MICROSTRUCTURE_FEATURE_SCHEMA,eventType:'BOOK',provider:'coinbase-advanced-trade',productId,sourceSequence:sequence??null,providerSequenceNum:integrityEvidence.providerSequenceNum??null,sourceSha256:String(sourceSha256||''),receivedTimestampMs:Number(receivedTimestampMs),book:{...metrics,ofi:ofi?.ofi??null,bidEvent:ofi?.bidEvent??null,askEvent:ofi?.askEvent??null,depthLevels:Math.min(currentBook.bids.length,currentBook.asks.length)},integrity:{snapshotObserved:true,providerSequenceContinuous:true,bookSynchronizationVerified:true,exactRawSourcePreserved:true},semantics:{ofiDefinition:'CONT_TOP_OF_BOOK_EVENT',ofiPositiveMeans:'BUY_PRESSURE',bookImbalanceDefinition:'SUM_BID_QTY_MINUS_ASK_QTY_OVER_SUM',micropriceDefinition:'ASK_X_BIDQ_PLUS_BID_X_ASKQ_OVER_QSUM',venueSpecificBookSemanticsPreserved:true,crossVenueComparabilityClaim:false,predictionInputAuthorized:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function extractCoinbaseTradeMicrostructureFeatures(rawText,{receivedTimestampMs=Date.now(),sourceSha256=null,sequence=null}={}){
  let payload;try{payload=JSON.parse(String(rawText??''));}catch{return [];}
  if(payload?.channel!=='market_trades'||!Array.isArray(payload?.events))return [];
  const out=[];
  for(const event of payload.events){for(const trade of Array.isArray(event?.trades)?event.trades:[]){
    const productId=String(trade?.product_id||''),makerSide=String(trade?.side||'').toUpperCase(),qty=Number(trade?.size),price=Number(trade?.price);if(!allowedProducts.has(productId)||!['BUY','SELL'].includes(makerSide)||!(qty>0)||!(price>0))continue;
    const takerSide=makerSide==='BUY'?'SELL':'BUY',sign=takerSide==='BUY'?1:-1;
    out.push({schemaVersion:COINBASE_MICROSTRUCTURE_FEATURE_SCHEMA,eventType:'TRADE',provider:'coinbase-advanced-trade',productId,sourceSequence:sequence??null,providerSequenceNum:Number.isInteger(payload?.sequence_num)?payload.sequence_num:null,sourceSha256:String(sourceSha256||''),receivedTimestampMs:Number(receivedTimestampMs),providerTimestamp:trade?.time??payload?.timestamp??null,trade:{tradeId:trade?.trade_id??null,makerSide,takerSide,price:round(price),qty:round(qty),signedQty:round(sign*qty),notional:round(price*qty),signedNotional:round(sign*price*qty)},integrity:{providerTradeEventObserved:true,exactRawSourcePreserved:true},semantics:{providerSideRepresentsMakerSide:true,takerSideDerivedAsOppositeOfMaker:true,signedFlowPositiveMeans:'AGGRESSIVE_BUY',crossVenueComparabilityClaim:false,predictionInputAuthorized:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}});
  }}
  return out;
}
