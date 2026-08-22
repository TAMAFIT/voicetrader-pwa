import crypto from 'node:crypto';
import {COINBASE_LOCAL_PRODUCTS} from './local-node-coinbase-wire.js';

export const COINBASE_BOOK_INTEGRITY_SCHEMA='voicetrader-coinbase-book-integrity-v1';
const allowedProducts=new Set(COINBASE_LOCAL_PRODUCTS);
const round=(v,d=10)=>{const n=Number(v);if(!Number.isFinite(n))return null;const s=10**d;return Math.round(n*s)/s;};

function createBook(productId){return {productId,bids:new Map(),offers:new Map(),hasSnapshot:false,trusted:false,lastProviderSequenceNum:null,lastEventTimestampMs:null};}
function parseLevel(update){const side=String(update?.side||'').toLowerCase(),priceRaw=update?.price_level??update?.px,qtyRaw=update?.new_quantity??update?.qty,price=Number(priceRaw),qty=Number(qtyRaw),eventTimestampMs=Date.parse(String(update?.event_time||''));if(!['bid','offer','ask'].includes(side)||!(price>0)||!(qty>=0))return null;return {side:side==='bid'?'bid':'offer',priceKey:String(priceRaw),price,qty,eventTimestampMs:Number.isFinite(eventTimestampMs)?eventTimestampMs:null};}
function applyLevel(book,level){const target=level.side==='bid'?book.bids:book.offers;if(level.qty===0)target.delete(level.priceKey);else target.set(level.priceKey,{price:level.price,qty:level.qty,eventTimestampMs:level.eventTimestampMs});book.lastEventTimestampMs=Math.max(Number(book.lastEventTimestampMs)||0,Number(level.eventTimestampMs)||0)||null;}
function top(map,{desc=false,limit=10}={}){return [...map.values()].sort((a,b)=>desc?b.price-a.price:a.price-b.price).slice(0,limit).map(x=>({price:round(x.price),qty:round(x.qty),eventTimestampMs:x.eventTimestampMs}));}
function snapshotBook(book,depth=10){const bids=top(book.bids,{desc:true,limit:depth}),offers=top(book.offers,{limit:depth}),bestBid=bids[0]?.price??null,bestOffer=offers[0]?.price??null;return {productId:book.productId,hasSnapshot:book.hasSnapshot,trusted:book.trusted,lastProviderSequenceNum:book.lastProviderSequenceNum,lastEventTimestampMs:book.lastEventTimestampMs,bidLevels:book.bids.size,offerLevels:book.offers.size,bids,offers,bestBid,bestOffer,spreadBps:bestBid>0&&bestOffer>bestBid?round((bestOffer/bestBid-1)*10000,8):null};}
function evidenceBase({status,productId=null,providerSequenceNum=null,previousSequenceNum=null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired=false,details=null}){return {schemaVersion:COINBASE_BOOK_INTEGRITY_SCHEMA,evidenceId:crypto.createHash('sha256').update([connectionId,providerSequenceNum,status,productId,sourceSha256].join('|')).digest('hex'),status,productId,providerSequenceNum,previousSequenceNum,receivedTimestampMs:Number(receivedTimestampMs),sourceSha256:String(sourceSha256||''),connectionId:String(connectionId||''),reconnectRequired,details,governance:{observationOnly:true,predictionInputAuthorized:false,derivedMicrostructureAuthorized:false,automaticPromotion:false,orderSubmission:false,realMoneyRouting:false}};}

export class CoinbaseBookIntegrityTracker{
  constructor({depth=10}={}){this.depth=depth;this.books=new Map();}
  reset(){this.books.clear();}
  state(productId){if(!this.books.has(productId))this.books.set(productId,createBook(productId));return this.books.get(productId);}
  snapshot(){return Object.fromEntries([...this.books.entries()].map(([k,v])=>[k,snapshotBook(v,this.depth)]));}
  applyRawMessage(rawText,{receivedTimestampMs=Date.now(),sourceSha256='',connectionId='',providerSequence=null}={}){
    let p;try{p=JSON.parse(String(rawText??''));}catch{return [evidenceBase({status:'MALFORMED_JSON',receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true})];}
    if(p?.channel!=='l2_data'&&p?.channel!=='level2')return [];
    const seq=Number(p?.sequence_num);
    if(!Number.isInteger(seq)||seq<0){for(const b of this.books.values())b.trusted=false;return [evidenceBase({status:'SEQUENCE_INVALID',providerSequenceNum:Number.isFinite(seq)?seq:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true,details:{validationLayer:'RAW_CONNECTION'}})];}
    if(providerSequence?.verified!==true||!['BASELINE','CONTIGUOUS'].includes(String(providerSequence?.status||''))){for(const b of this.books.values())b.trusted=false;return [evidenceBase({status:'PROVIDER_SEQUENCE_UNVERIFIED',providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true,details:{providerSequenceStatus:providerSequence?.status??null,validationLayer:'RAW_CONNECTION'}})];}

    const out=[];
    for(const event of Array.isArray(p?.events)?p.events:[]){
      const productId=String(event?.product_id||'');if(!allowedProducts.has(productId))continue;
      const type=String(event?.type||'').toLowerCase(),book=this.state(productId);
      if(type==='snapshot'){book.bids.clear();book.offers.clear();book.hasSnapshot=true;book.trusted=false;}
      else if(type==='update'&&!book.hasSnapshot){out.push(evidenceBase({status:'UPDATE_BEFORE_SNAPSHOT',productId,providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true}));book.trusted=false;continue;}
      else if(type!=='update'){out.push(evidenceBase({status:'EVENT_TYPE_UNSUPPORTED',productId,providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true,details:{eventType:type}}));book.trusted=false;continue;}
      let malformed=0;for(const update of Array.isArray(event?.updates)?event.updates:[]){const level=parseLevel(update);if(!level){malformed++;continue;}applyLevel(book,level);}
      book.lastProviderSequenceNum=seq;
      const snap=snapshotBook(book,this.depth);
      if(malformed>0){book.trusted=false;out.push(evidenceBase({status:'LEVEL_MALFORMED',productId,providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true,details:{malformedLevels:malformed}}));continue;}
      if(!(snap.bestBid>0)||!(snap.bestOffer>0)){book.trusted=false;out.push(evidenceBase({status:'BOOK_INCOMPLETE',productId,providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true,details:{bidLevels:snap.bidLevels,offerLevels:snap.offerLevels}}));continue;}
      if(snap.bestBid>=snap.bestOffer){book.trusted=false;out.push(evidenceBase({status:'BOOK_CROSSED',productId,providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:true,details:{bestBid:snap.bestBid,bestOffer:snap.bestOffer}}));continue;}
      book.trusted=true;
      const trusted=evidenceBase({status:type==='snapshot'?'TRUSTED_SNAPSHOT':'TRUSTED_UPDATE',productId,providerSequenceNum:seq,previousSequenceNum:Number.isInteger(providerSequence?.previous)?providerSequence.previous:null,receivedTimestampMs,sourceSha256,connectionId,reconnectRequired:false});
      out.push({...trusted,governance:{...trusted.governance,derivedMicrostructureAuthorized:true},book:snapshotBook(book,this.depth),semantics:{snapshotObserved:book.hasSnapshot,sequenceContinuityValidatedUpstream:true,sequenceScope:'FULL_CONNECTION_RAW_STREAM',absoluteQuantityUpdates:true,zeroQuantityRemovesLevel:true,bookNotCrossed:true,providerLevel2DeliveryGuaranteeDocumented:true,localBookSynchronizationVerified:true,derivedMicrostructureAuthorized:true}});
    }
    return out;
  }
}
