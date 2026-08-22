import {WINDOW_SIZES_SEC,bucketStartMs,boundaryContext,evaluateTimeIntegrity} from './kraken-boundary-windows.js';

export const COINBASE_BOUNDARY_WINDOW_SCHEMA='voicetrader-coinbase-boundary-window-v1';
export {WINDOW_SIZES_SEC};

const round=(value,digits=10)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const stat=()=>({count:0,sum:0,min:null,max:null,last:null});
const addStat=(s,v)=>{const n=Number(v);if(!Number.isFinite(n))return;s.count+=1;s.sum+=n;s.min=s.min==null?n:Math.min(s.min,n);s.max=s.max==null?n:Math.max(s.max,n);s.last=n;};
const avg=(s)=>s.count?s.sum/s.count:null;

export function canonicalInstrument(productId){const p=String(productId||'');if(p==='BTC-USD')return 'BTCUSD';if(p==='ETH-USD')return 'ETHUSD';return null;}
export function coinbaseMarketEventTimestampMs(event){const direct=Number(event?.providerTimestampMs);if(Number.isFinite(direct))return direct;const parsed=Date.parse(String(event?.providerTimestamp||''));return Number.isFinite(parsed)?parsed:null;}

export function createCoinbaseWindowAccumulator({productId,windowSec,bucketStart}={}){
  if(!canonicalInstrument(productId)||!WINDOW_SIZES_SEC.includes(Number(windowSec)))throw new Error('coinbase-window-accumulator-invalid');
  return {schemaVersion:'coinbase-window-accumulator-v1',productId,canonicalInstrument:canonicalInstrument(productId),windowSec:Number(windowSec),bucketStartMs:Number(bucketStart),firstProviderMs:null,lastProviderMs:null,firstReceivedMs:null,lastReceivedMs:null,eventCount:0,bookEventCount:0,tradeEventCount:0,providerDelayMs:stat(),price:{openMid:null,closeMid:null,openBid:null,openAsk:null,closeBid:null,closeAsk:null,spreadBps:stat(),micropriceMinusMid:stat()},orderFlow:{ofi:stat(),top1Imbalance:stat(),depthImbalance:stat(),totalDepth:stat()},trades:{signedQtySum:0,signedNotionalSum:0,buyQty:0,sellQty:0,buyCount:0,sellCount:0}};
}

export function addCoinbaseMicrostructureEvent(acc,event){
  if(!acc||!event||event.productId!==acc.productId)throw new Error('coinbase-window-event-invalid');
  const providerMs=coinbaseMarketEventTimestampMs(event),receivedMs=Number(event.receivedTimestampMs);
  if(!Number.isFinite(providerMs))throw new Error('coinbase-window-provider-time-required');
  if(!Number.isFinite(receivedMs))throw new Error('coinbase-window-received-time-invalid');
  if(bucketStartMs(providerMs,acc.windowSec)!==acc.bucketStartMs)throw new Error('coinbase-window-event-outside-bucket');
  acc.eventCount+=1;acc.firstProviderMs=acc.firstProviderMs==null?providerMs:Math.min(acc.firstProviderMs,providerMs);acc.lastProviderMs=acc.lastProviderMs==null?providerMs:Math.max(acc.lastProviderMs,providerMs);acc.firstReceivedMs=acc.firstReceivedMs==null?receivedMs:Math.min(acc.firstReceivedMs,receivedMs);acc.lastReceivedMs=acc.lastReceivedMs==null?receivedMs:Math.max(acc.lastReceivedMs,receivedMs);addStat(acc.providerDelayMs,receivedMs-providerMs);
  if(event.eventType==='BOOK'){
    acc.bookEventCount+=1;const mid=Number(event.book?.mid),bid=Number(event.book?.bestBid?.price),ask=Number(event.book?.bestAsk?.price);
    if(Number.isFinite(mid)){if(acc.price.openMid==null)acc.price.openMid=mid;acc.price.closeMid=mid;}
    if(bid>0&&ask>bid){if(acc.price.openBid==null){acc.price.openBid=bid;acc.price.openAsk=ask;}acc.price.closeBid=bid;acc.price.closeAsk=ask;}
    addStat(acc.price.spreadBps,event.book?.spreadBps);addStat(acc.price.micropriceMinusMid,event.book?.micropriceMinusMid);addStat(acc.orderFlow.ofi,event.book?.ofi);addStat(acc.orderFlow.top1Imbalance,event.book?.top1Imbalance);addStat(acc.orderFlow.depthImbalance,event.book?.depthImbalance);addStat(acc.orderFlow.totalDepth,Number(event.book?.bidDepth)+Number(event.book?.askDepth));
  } else if(event.eventType==='TRADE'){
    acc.tradeEventCount+=1;const sq=Number(event.trade?.signedQty),sn=Number(event.trade?.signedNotional),qty=Number(event.trade?.qty);if(Number.isFinite(sq))acc.trades.signedQtySum+=sq;if(Number.isFinite(sn))acc.trades.signedNotionalSum+=sn;if(event.trade?.takerSide==='BUY'){acc.trades.buyCount+=1;if(Number.isFinite(qty))acc.trades.buyQty+=qty;}else if(event.trade?.takerSide==='SELL'){acc.trades.sellCount+=1;if(Number.isFinite(qty))acc.trades.sellQty+=qty;}
  }
  return acc;
}

export function finalizeCoinbaseWindow(acc){
  if(!acc?.eventCount)return null;
  const openMid=Number(acc.price.openMid),closeMid=Number(acc.price.closeMid),midReturnBps=openMid>0&&Number.isFinite(closeMid)?((closeMid/openMid)-1)*10000:null,ofiSum=Number(acc.orderFlow.ofi.sum||0),avgDepth=avg(acc.orderFlow.totalDepth),ofiNormalized=avgDepth>0?ofiSum/avgDepth:null,start=acc.bucketStartMs,end=start+acc.windowSec*1000,timeIntegrity=evaluateTimeIntegrity(acc.providerDelayMs);
  return {schemaVersion:COINBASE_BOUNDARY_WINDOW_SCHEMA,windowId:['coinbase-provider-window-v1',acc.productId,acc.windowSec,start].join('|'),venue:'COINBASE',productId:acc.productId,canonicalInstrument:acc.canonicalInstrument,windowSec:acc.windowSec,startTimestampMs:start,endTimestampMs:end,timing:{timeBasis:'PROVIDER_TIMESTAMP',firstProviderTimestampMs:acc.firstProviderMs,lastProviderTimestampMs:acc.lastProviderMs,firstReceivedTimestampMs:acc.firstReceivedMs,lastReceivedTimestampMs:acc.lastReceivedMs,boundary:boundaryContext(end),timeIntegrity},coverage:{eventCount:acc.eventCount,bookEventCount:acc.bookEventCount,tradeEventCount:acc.tradeEventCount,providerTimestampSamples:acc.providerDelayMs.count,bookIntegrityCertifiedOnly:true,completeByProviderClock:true},price:{openMid:round(acc.price.openMid),closeMid:round(acc.price.closeMid),openBid:round(acc.price.openBid),openAsk:round(acc.price.openAsk),closeBid:round(acc.price.closeBid),closeAsk:round(acc.price.closeAsk),midReturnBps:round(midReturnBps,6),spreadBpsMean:round(avg(acc.price.spreadBps),6),spreadBpsMin:round(acc.price.spreadBps.min,6),spreadBpsMax:round(acc.price.spreadBps.max,6),micropriceMinusMidMean:round(avg(acc.price.micropriceMinusMid)),micropriceMinusMidLast:round(acc.price.micropriceMinusMid.last)},orderFlow:{ofiSum:round(ofiSum),ofiCount:acc.orderFlow.ofi.count,ofiNormalizedByMeanDepth:round(ofiNormalized,8),top1ImbalanceMean:round(avg(acc.orderFlow.top1Imbalance),8),top1ImbalanceLast:round(acc.orderFlow.top1Imbalance.last,8),depthImbalanceMean:round(avg(acc.orderFlow.depthImbalance),8),depthImbalanceLast:round(acc.orderFlow.depthImbalance.last,8),meanTotalDepth:round(avgDepth)},trades:{signedQtySum:round(acc.trades.signedQtySum),signedNotionalSum:round(acc.trades.signedNotionalSum),buyQty:round(acc.trades.buyQty),sellQty:round(acc.trades.sellQty),buyCount:acc.trades.buyCount,sellCount:acc.trades.sellCount},semantics:{derivedFromIntegrityCertifiedL2Only:true,providerTimeDefinesResearchWindow:true,receiveTimeUsedForLatencyAuditOnly:true,providerToLocalTimingAudited:true,venueSpecificSemanticsPreserved:true,crossVenueComparabilityClaim:false,prospectiveOutcomeUsed:false,predictionInputAuthorized:false,automaticPromotion:false,quotedBidAskPreserved:true},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}

export function aggregateCoinbaseMicrostructureEvents(events,{windowSec,nowMs=Date.now()}={}){
  if(!WINDOW_SIZES_SEC.includes(Number(windowSec)))throw new Error('coinbase-window-size-unsupported');const grouped=new Map();
  for(const event of events||[]){if(!event?.productId||!['BOOK','TRADE'].includes(event.eventType))continue;const t=coinbaseMarketEventTimestampMs(event);if(!Number.isFinite(t))continue;const start=bucketStartMs(t,windowSec),key=`${event.productId}|${start}`;if(!grouped.has(key))grouped.set(key,createCoinbaseWindowAccumulator({productId:event.productId,windowSec,bucketStart:start}));addCoinbaseMicrostructureEvent(grouped.get(key),event);}
  const out=[];for(const acc of grouped.values()){if(acc.bucketStartMs+windowSec*1000>nowMs)continue;const record=finalizeCoinbaseWindow(acc);if(record)out.push(record);}out.sort((a,b)=>a.startTimestampMs-b.startTimestampMs||a.productId.localeCompare(b.productId));return out;
}
