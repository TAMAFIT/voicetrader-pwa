export const KRAKEN_BOUNDARY_WINDOW_SCHEMA='voicetrader-kraken-boundary-window-v1';
export const WINDOW_SIZES_SEC=Object.freeze([1,5,15,60]);

const round=(value,digits=10)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
const mean=(values)=>{const xs=values.filter(Number.isFinite);return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;};
const min=(values)=>{const xs=values.filter(Number.isFinite);return xs.length?Math.min(...xs):null;};
const max=(values)=>{const xs=values.filter(Number.isFinite);return xs.length?Math.max(...xs):null;};

export function boundaryContext(timestampMs){
  const t=Number(timestampMs);if(!Number.isFinite(t)||t<0)throw new Error('boundary-time-invalid');
  const second=Math.floor(t/1000);
  const metrics={};
  for(const minutes of [5,15,60]){
    const period=minutes*60;
    const since=((second%period)+period)%period;
    const toNext=since===0?0:period-since;
    metrics[`${minutes}m`]={secondsSinceBoundary:since,secondsToBoundary:toNext,atBoundary:since===0};
  }
  return metrics;
}

export function bucketStartMs(timestampMs,windowSec){
  const size=Number(windowSec)*1000;const t=Number(timestampMs);
  if(!Number.isFinite(t)||!Number.isFinite(size)||size<=0)throw new Error('window-bucket-invalid');
  return Math.floor(t/size)*size;
}

export function createWindowAccumulator({symbol,windowSec,bucketStart}={}){
  if(!symbol||!WINDOW_SIZES_SEC.includes(Number(windowSec)))throw new Error('window-accumulator-invalid');
  return {symbol,windowSec:Number(windowSec),bucketStartMs:Number(bucketStart),events:[],firstReceivedMs:null,lastReceivedMs:null};
}

export function addMicrostructureEvent(acc,event){
  if(!acc||!event||event.symbol!==acc.symbol)throw new Error('window-event-invalid');
  const t=Number(event.receivedTimestampMs);if(!Number.isFinite(t))throw new Error('window-event-time-invalid');
  const expected=bucketStartMs(t,acc.windowSec);if(expected!==acc.bucketStartMs)throw new Error('window-event-outside-bucket');
  acc.events.push(event);acc.firstReceivedMs=acc.firstReceivedMs==null?t:Math.min(acc.firstReceivedMs,t);acc.lastReceivedMs=acc.lastReceivedMs==null?t:Math.max(acc.lastReceivedMs,t);return acc;
}

export function finalizeWindow(acc){
  if(!acc?.events?.length)return null;
  const books=acc.events.filter((e)=>e.eventType==='BOOK');
  const trades=acc.events.filter((e)=>e.eventType==='TRADE');
  const mids=books.map((e)=>Number(e.book?.mid));
  const spreads=books.map((e)=>Number(e.book?.spreadBps));
  const microDeltas=books.map((e)=>Number(e.book?.micropriceMinusMid));
  const ofis=books.map((e)=>Number(e.book?.ofi));
  const top1=books.map((e)=>Number(e.book?.top1Imbalance));
  const depthImb=books.map((e)=>Number(e.book?.depthImbalance));
  const depths=books.map((e)=>Number(e.book?.bidDepth)+Number(e.book?.askDepth)).filter(Number.isFinite);
  const signedQty=trades.map((e)=>Number(e.trade?.signedQty));
  const signedNotional=trades.map((e)=>Number(e.trade?.signedNotional));
  const buyQty=trades.filter((e)=>e.trade?.takerSide==='BUY').reduce((a,e)=>a+Number(e.trade?.qty||0),0);
  const sellQty=trades.filter((e)=>e.trade?.takerSide==='SELL').reduce((a,e)=>a+Number(e.trade?.qty||0),0);
  const openMid=mids.find(Number.isFinite)??null;
  const closeMid=[...mids].reverse().find(Number.isFinite)??null;
  const midReturnBps=openMid>0&&closeMid!=null?((closeMid/openMid)-1)*10000:null;
  const ofiSum=ofis.filter(Number.isFinite).reduce((a,b)=>a+b,0);
  const avgDepth=mean(depths);
  const ofiNormalized=avgDepth>0?ofiSum/avgDepth:null;
  const start=acc.bucketStartMs,end=start+acc.windowSec*1000;
  return {
    schemaVersion:KRAKEN_BOUNDARY_WINDOW_SCHEMA,
    windowId:['kraken-window-v1',acc.symbol,acc.windowSec,start].join('|'),
    symbol:acc.symbol,windowSec:acc.windowSec,startTimestampMs:start,endTimestampMs:end,
    timing:{firstReceivedTimestampMs:acc.firstReceivedMs,lastReceivedTimestampMs:acc.lastReceivedMs,boundary:boundaryContext(end)},
    coverage:{eventCount:acc.events.length,bookEventCount:books.length,tradeEventCount:trades.length,bookChecksumVerifiedOnly:true,completeByClock:true},
    price:{openMid:round(openMid),closeMid:round(closeMid),midReturnBps:round(midReturnBps,6),spreadBpsMean:round(mean(spreads),6),spreadBpsMin:round(min(spreads),6),spreadBpsMax:round(max(spreads),6),micropriceMinusMidMean:round(mean(microDeltas)),micropriceMinusMidLast:round([...microDeltas].reverse().find(Number.isFinite))},
    orderFlow:{ofiSum:round(ofiSum),ofiCount:ofis.filter(Number.isFinite).length,ofiNormalizedByMeanDepth:round(ofiNormalized,8),top1ImbalanceMean:round(mean(top1),8),top1ImbalanceLast:round([...top1].reverse().find(Number.isFinite),8),depthImbalanceMean:round(mean(depthImb),8),depthImbalanceLast:round([...depthImb].reverse().find(Number.isFinite),8),meanTotalDepth:round(avgDepth)},
    trades:{signedQtySum:round(signedQty.filter(Number.isFinite).reduce((a,b)=>a+b,0)),signedNotionalSum:round(signedNotional.filter(Number.isFinite).reduce((a,b)=>a+b,0)),buyQty:round(buyQty),sellQty:round(sellQty),buyCount:trades.filter((e)=>e.trade?.takerSide==='BUY').length,sellCount:trades.filter((e)=>e.trade?.takerSide==='SELL').length},
    semantics:{derivedFromTrustedL2Only:true,prospectiveOutcomeUsed:false,predictionInputAuthorized:false,automaticPromotion:false,windowUsesReceiveTime:true},
    runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false},
  };
}

export function aggregateMicrostructureEvents(events,{windowSec,nowMs=Date.now()}={}){
  if(!WINDOW_SIZES_SEC.includes(Number(windowSec)))throw new Error('window-size-unsupported');
  const grouped=new Map();
  for(const event of events||[]){if(!event?.symbol||!['BOOK','TRADE'].includes(event.eventType))continue;const t=Number(event.receivedTimestampMs);if(!Number.isFinite(t))continue;const start=bucketStartMs(t,windowSec);const key=`${event.symbol}|${start}`;if(!grouped.has(key))grouped.set(key,createWindowAccumulator({symbol:event.symbol,windowSec,bucketStart:start}));addMicrostructureEvent(grouped.get(key),event);}
  const out=[];for(const acc of grouped.values()){if(acc.bucketStartMs+windowSec*1000>nowMs)continue;const record=finalizeWindow(acc);if(record)out.push(record);}out.sort((a,b)=>a.startTimestampMs-b.startTimestampMs||a.symbol.localeCompare(b.symbol));return out;
}
