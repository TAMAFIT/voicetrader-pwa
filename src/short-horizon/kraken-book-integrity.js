export const KRAKEN_BOOK_INTEGRITY_SCHEMA='voicetrader-kraken-book-integrity-v1';

function parsePreservingDecimals(rawText){
  return JSON.parse(String(rawText),(key,value,context)=>{
    if((key==='price'||key==='qty') && typeof value==='number' && context?.source) return context.source;
    if((key==='price'||key==='qty') && typeof value==='string') return value;
    return value;
  });
}

function canonicalDecimal(value){
  let s=String(value).trim();
  if(!/^\d+(?:\.\d+)?$/.test(s)) throw new Error(`kraken-decimal-invalid:${s}`);
  let [i,f='']=s.split('.'); i=i.replace(/^0+(?=\d)/,''); f=f.replace(/0+$/,''); return f?`${i}.${f}`:i;
}
function isZero(value){return Number(value)===0;}
function checksumToken(value){const stripped=String(value).replace('.','').replace(/^0+/,'');return stripped||'0';}

let crcTable=null;
function getCrcTable(){if(crcTable)return crcTable;crcTable=new Uint32Array(256);for(let n=0;n<256;n+=1){let c=n;for(let k=0;k<8;k+=1)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}return crcTable;}
export function crc32Ascii(text){let crc=0xffffffff;const table=getCrcTable();const bytes=Buffer.from(String(text),'utf8');for(const b of bytes)crc=table[(crc^b)&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;}

function sortedLevels(map,side){const values=[...map.values()];values.sort((a,b)=>side==='ask'?Number(a.price)-Number(b.price):Number(b.price)-Number(a.price));return values;}
function truncateBook(book,depth){for(const side of ['bids','asks']){const ordered=sortedLevels(book[side],side==='asks'?'ask':'bid');book[side].clear();for(const level of ordered.slice(0,depth))book[side].set(canonicalDecimal(level.price),level);}}
function applyLevels(map,levels=[]){for(const level of levels){const price=String(level.price);const qty=String(level.qty);const key=canonicalDecimal(price);if(isZero(qty))map.delete(key);else map.set(key,{price,qty});}}

export function calculateKrakenBookChecksum(book){
  const asks=sortedLevels(book.asks,'ask').slice(0,10);
  const bids=sortedLevels(book.bids,'bid').slice(0,10);
  const input=[...asks,...bids].map((level)=>checksumToken(level.price)+checksumToken(level.qty)).join('');
  return {checksum:crc32Ascii(input),input,asks,bids};
}

export class KrakenBookIntegrityTracker{
  constructor({depth=10}={}){if(![10,25,100,500,1000].includes(depth))throw new Error('kraken-book-depth-invalid');this.depth=depth;this.states=new Map();}
  state(symbol){if(!this.states.has(symbol))this.states.set(symbol,{symbol,bids:new Map(),asks:new Map(),snapshotSeen:false,trusted:false,lastProviderChecksum:null,lastLocalChecksum:null,matches:0,mismatches:0});return this.states.get(symbol);}
  snapshot(){const out={};for(const [symbol,s] of this.states)out[symbol]={snapshotSeen:s.snapshotSeen,trusted:s.trusted,lastProviderChecksum:s.lastProviderChecksum,lastLocalChecksum:s.lastLocalChecksum,matches:s.matches,mismatches:s.mismatches,bidLevels:s.bids.size,askLevels:s.asks.size};return out;}
  applyRawMessage(rawText,{receivedTimestampMs=Date.now(),sourceSha256=null,sequence=null}={}){
    const payload=parsePreservingDecimals(rawText);
    if(payload?.channel!=='book'||!Array.isArray(payload?.data))return [];
    const type=payload.type;
    const evidence=[];
    for(const item of payload.data){
      const symbol=item?.symbol; if(typeof symbol!=='string')continue;
      const s=this.state(symbol);
      if(type==='snapshot'){
        s.bids.clear();s.asks.clear();applyLevels(s.bids,item.bids);applyLevels(s.asks,item.asks);truncateBook(s,this.depth);s.snapshotSeen=true;
      }else if(type==='update'){
        if(!s.snapshotSeen||!s.trusted){evidence.push(this.#evidence({s,item,type,receivedTimestampMs,sourceSha256,sequence,status:!s.snapshotSeen?'NO_SNAPSHOT':'UNTRUSTED_WAITING_SNAPSHOT',providerChecksum:Number(item.checksum),localChecksum:null,match:false}));continue;}
        applyLevels(s.bids,item.bids);applyLevels(s.asks,item.asks);truncateBook(s,this.depth);
      }else continue;
      const calculated=calculateKrakenBookChecksum(s);const providerChecksum=Number(item.checksum);const match=Number.isFinite(providerChecksum)&&providerChecksum===calculated.checksum;
      s.lastProviderChecksum=providerChecksum;s.lastLocalChecksum=calculated.checksum;if(match){s.matches+=1;s.trusted=true;}else{s.mismatches+=1;s.trusted=false;}
      evidence.push(this.#evidence({s,item,type,receivedTimestampMs,sourceSha256,sequence,status:match?'MATCH':'MISMATCH',providerChecksum,localChecksum:calculated.checksum,match}));
    }
    return evidence;
  }
  #evidence({s,item,type,receivedTimestampMs,sourceSha256,sequence,status,providerChecksum,localChecksum,match}){return {schemaVersion:KRAKEN_BOOK_INTEGRITY_SCHEMA,symbol:s.symbol,messageType:type,sourceSequence:sequence,sourceSha256,receivedTimestampMs,providerTimestamp:item?.timestamp??null,providerChecksum:Number.isFinite(providerChecksum)?providerChecksum:null,localChecksum:Number.isFinite(localChecksum)?localChecksum:null,status,match,trustedAfter:s.trusted,snapshotSeen:s.snapshotSeen,depth:this.depth,semantics:{bookSynchronizationVerified:s.trusted,ofiAuthorized:false,micropriceAuthorized:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};}
}
