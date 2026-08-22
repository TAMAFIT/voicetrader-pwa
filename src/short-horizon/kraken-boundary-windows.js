export const KRAKEN_BOUNDARY_WINDOW_SCHEMA='voicetrader-kraken-boundary-window-v1';
export const WINDOW_SIZES_SEC=Object.freeze([1,5,15,60]);

const round=(value,digits=10)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const addStat=(stat,value)=>{const n=Number(value);if(!Number.isFinite(n))return;stat.count+=1;stat.sum+=n;stat.min=stat.min==null?n:Math.min(stat.min,n);stat.max=stat.max==null?n:Math.max(stat.max,n);stat.last=n;};
const avg=(stat)=>stat.count?stat.sum/stat.count:null;

export function boundaryContext(timestampMs){
  const t=Number(timestampMs);if(!Number.isFinite(t)||t<0)throw new Error('boundary-time-invalid');
  const second=Math.floor(t/1000),metrics={};
  for(const minutes of [5,15,60]){const period=minutes*60,since=((second%period)+period)%period,toNext=since===0?0:period-since;metrics[`${minutes}m`]={secondsSinceBoundary:since,secondsToBoundary:toNext,atBoundary:since===0};}
  return metrics;
}
export function bucketStartMs(timestampMs,windowSec){const size=Number(windowSec)*1000,t=Number(timestampMs);if(!Number.isFinite(t)||!Number.isFinite(size)||size<=0)throw new Error('window-bucket-invalid');return Math.floor(t/size)*size;}
const stat=()=>({count:0,sum:0,min:null,max:null,last:null});
export function createWindowAccumulator({symbol,windowSec,bucketStart}={}){
  if(!symbol||!WINDOW_SIZES_SEC.includes(Number(windowSec)))throw new Error('window-accumulator-invalid');
  return {schemaVersion:'kraken-window-accumulator-v2',symbol,windowSec:Number(windowSec),bucketStartMs:Number(bucketStart),firstReceivedMs:null,lastReceivedMs:null,eventCount:0,bookEventCount:0,tradeEventCount:0,price:{openMid:null,closeMid:null,spreadBps:stat(),micropriceMinusMid:stat()},orderFlow:{ofi:stat(),top1Imbalance:stat(),depthImbalance:stat(),totalDepth:stat()},trades:{signedQtySum:0,signedNotionalSum:0,buyQty:0,sellQty:0,buyCount:0,sellCount:0}};
}
export function addMicrostructureEvent(acc,event){
  if(!acc||!event||event.symbol!==acc.symbol)throw new Error('window-event-invalid');const t=Number(event.receivedTimestampMs);if(!Number.isFinite(t))throw new Error('window-event-time-invalid');if(bucketStartMs(t,acc.windowSec)!==acc.bucketStartMs)throw new Error('window-event-outside-bucket');
  acc.eventCount+=1;acc.firstReceivedMs=acc.firstReceivedMs==null?t:Math.min(acc.firstReceivedMs,t);acc.lastReceivedMs=acc.lastReceivedMs==null?t:Math.max(acc.lastReceivedMs,t);
  if(event.eventType==='BOOK'){
    acc.bookEventCount+=1;const mid=Number(event.book?.mid);if(Number.isFinite(mid)){if(acc.price.openMid==null)acc.price.openMid=mid;acc.price.closeMid=mid;}addStat(acc.price.spreadBps,event.book?.spreadBps);addStat(acc.price.micropriceMinusMid,event.book?.micropriceMinusMid);addStat(acc.orderFlow.ofi,event.book?.ofi);addStat(acc.orderFlow.top1Imbalance,event.book?.top1Imbalance);addStat(acc.orderFlow.depthImbalance,event.book?.depthImbalance);const depth=Number(event.book?.bidDepth)+Number(event.book?.askDepth);addStat(acc.orderFlow.totalDepth,depth);
  } else if(event.eventType==='TRADE'){
    acc.tradeEventCount+=1;const sq=Number(event.trade?.signedQty),sn=Number(event.trade?.signedNotional),qty=Number(event.trade?.qty);if(Number.isFinite(sq))acc.trades.signedQtySum+=sq;if(Number.isFinite(sn))acc.trades.signedNotionalSum+=sn;if(event.trade?.takerSide==='BUY'){acc.trades.buyCount+=1;if(Number.isFinite(qty))acc.trades.buyQty+=qty;}else if(event.trade?.takerSide==='SELL'){acc.trades.sellCount+=1;if(Number.isFinite(qty))acc.trades.sellQty+=qty;}
  }
  return acc;
}
export function finalizeWindow(acc){
  if(!acc?.eventCount)return null;const openMid=Number(acc.price?.openMid),closeMid=Number(acc.price?.closeMid),midReturnBps=openMid>0&&Number.isFinite(closeMid)?((closeMid/openMid)-1)*10000:null;const ofiSum=Number(acc.orderFlow?.ofi?.sum||0),avgDepth=avg(acc.orderFlow.totalDepth),ofiNormalized=avgDepth>0?ofiSum/avgDepth:null;const start=acc.bucketStartMs,end=start+acc.windowSec*1000;
  return {schemaVersion:KRAKEN_BOUNDARY_WINDOW_SCHEMA,windowId:['kraken-window-v1',acc.symbol,acc.windowSec,start].join('|'),symbol:acc.symbol,windowSec:acc.windowSec,startTimestampMs:start,endTimestampMs:end,timing:{firstReceivedTimestampMs:acc.firstReceivedMs,lastReceivedTimestampMs:acc.lastReceivedMs,boundary:boundaryContext(end)},coverage:{eventCount:acc.eventCount,bookEventCount:acc.bookEventCount,tradeEventCount:acc.tradeEventCount,bookChecksumVerifiedOnly:true,completeByClock:true},price:{openMid:round(acc.price.openMid),closeMid:round(acc.price.closeMid),midReturnBps:round(midReturnBps,6),spreadBpsMean:round(avg(acc.price.spreadBps),6),spreadBpsMin:round(acc.price.spreadBps.min,6),spreadBpsMax:round(acc.price.spreadBps.max,6),micropriceMinusMidMean:round(avg(acc.price.micropriceMinusMid)),micropriceMinusMidLast:round(acc.price.micropriceMinusMid.last)},orderFlow:{ofiSum:round(ofiSum),ofiCount:acc.orderFlow.ofi.count,ofiNormalizedByMeanDepth:round(ofiNormalized,8),top1ImbalanceMean:round(avg(acc.orderFlow.top1Imbalance),8),top1ImbalanceLast:round(acc.orderFlow.top1Imbalance.last,8),depthImbalanceMean:round(avg(acc.orderFlow.depthImbalance),8),depthImbalanceLast:round(acc.orderFlow.depthImbalance.last,8),meanTotalDepth:round(avgDepth)},trades:{signedQtySum:round(acc.trades.signedQtySum),signedNotionalSum:round(acc.trades.signedNotionalSum),buyQty:round(acc.trades.buyQty),sellQty:round(acc.trades.sellQty),buyCount:acc.trades.buyCount,sellCount:acc.trades.sellCount},semantics:{derivedFromTrustedL2Only:true,prospectiveOutcomeUsed:false,predictionInputAuthorized:false,automaticPromotion:false,windowUsesReceiveTime:true,streamingAccumulator:true},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
export function aggregateMicrostructureEvents(events,{windowSec,nowMs=Date.now()}={}){if(!WINDOW_SIZES_SEC.includes(Number(windowSec)))throw new Error('window-size-unsupported');const grouped=new Map();for(const event of events||[]){if(!event?.symbol||!['BOOK','TRADE'].includes(event.eventType))continue;const t=Number(event.receivedTimestampMs);if(!Number.isFinite(t))continue;const start=bucketStartMs(t,windowSec),key=`${event.symbol}|${start}`;if(!grouped.has(key))grouped.set(key,createWindowAccumulator({symbol:event.symbol,windowSec,bucketStart:start}));addMicrostructureEvent(grouped.get(key),event);}const out=[];for(const acc of grouped.values()){if(acc.bucketStartMs+windowSec*1000>nowMs)continue;const record=finalizeWindow(acc);if(record)out.push(record);}out.sort((a,b)=>a.startTimestampMs-b.startTimestampMs||a.symbol.localeCompare(b.symbol));return out;}
