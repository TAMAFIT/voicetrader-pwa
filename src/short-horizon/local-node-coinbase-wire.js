import path from 'node:path';
import crypto from 'node:crypto';

export const COINBASE_ADVANCED_TRADE_WS_URL='wss://advanced-trade-ws.coinbase.com';
export const COINBASE_LOCAL_WIRE_SCHEMA='voicetrader-coinbase-wire-meta-v1';
export const COINBASE_LOCAL_PRODUCTS=Object.freeze(['BTC-USD','ETH-USD']);

const pad2=(v)=>String(v).padStart(2,'0');

export function buildCoinbaseSubscriptions(){
  return [
    {type:'subscribe',product_ids:[...COINBASE_LOCAL_PRODUCTS],channel:'level2'},
    {type:'subscribe',product_ids:[...COINBASE_LOCAL_PRODUCTS],channel:'market_trades'},
    {type:'subscribe',channel:'heartbeats'},
  ];
}

export function buildCoinbaseWirePaths(rootDir,receivedTimestampMs){
  const d=new Date(Number(receivedTimestampMs));
  if(!Number.isFinite(d.getTime()))throw new Error('coinbase-received-time-invalid');
  const year=String(d.getUTCFullYear()),month=pad2(d.getUTCMonth()+1),day=pad2(d.getUTCDate()),hour=pad2(d.getUTCHours());
  const dir=path.join(path.resolve(rootDir),'raw','coinbase','advanced-trade',year,month,day);
  return {dir,wireFile:path.join(dir,`${hour}.wire.jsonseq`),metaFile:path.join(dir,`${hour}.meta.ndjson`),stateDir:path.join(path.resolve(rootDir),'state'),healthFile:path.join(path.resolve(rootDir),'state','coinbase-microstructure-health.json'),logDir:path.join(path.resolve(rootDir),'logs','coinbase')};
}

export function frameCoinbaseJsonSequence(rawText){
  const raw=String(rawText??'');
  if(!raw.length)throw new Error('coinbase-wire-empty');
  return Buffer.concat([Buffer.from([0x1e]),Buffer.from(raw,'utf8'),Buffer.from('\n','utf8')]);
}

export function classifyCoinbaseWire(rawText){
  const out={parseOk:false,channel:null,providerSequenceNum:null,providerTimestamp:null,sourceTimestampMs:null,products:[],isLevel2:false,isMarketTrades:false,isHeartbeat:false,isSubscriptions:false};
  try{
    const p=JSON.parse(String(rawText??''));
    out.parseOk=true;
    out.channel=typeof p?.channel==='string'?p.channel:null;
    out.providerSequenceNum=Number.isInteger(p?.sequence_num)?p.sequence_num:null;
    out.providerTimestamp=typeof p?.timestamp==='string'?p.timestamp:null;
    const sourceMs=Date.parse(out.providerTimestamp||'');out.sourceTimestampMs=Number.isFinite(sourceMs)?sourceMs:null;
    out.isLevel2=out.channel==='l2_data'||out.channel==='level2';
    out.isMarketTrades=out.channel==='market_trades';
    out.isHeartbeat=out.channel==='heartbeats';
    out.isSubscriptions=out.channel==='subscriptions';
    const products=new Set();
    for(const event of Array.isArray(p?.events)?p.events:[]){
      if(typeof event?.product_id==='string')products.add(event.product_id);
      for(const trade of Array.isArray(event?.trades)?event.trades:[])if(typeof trade?.product_id==='string')products.add(trade.product_id);
    }
    out.products=[...products].filter((x)=>COINBASE_LOCAL_PRODUCTS.includes(x));
  }catch{}
  return out;
}

export function buildCoinbaseWireMeta(rawText,{receivedTimestampMs=Date.now(),connectionId,sequence}={}){
  const raw=String(rawText??''),received=Number(receivedTimestampMs),seq=Number(sequence);
  if(!Number.isFinite(received)||received<0)throw new Error('coinbase-received-time-invalid');
  if(!Number.isInteger(seq)||seq<1)throw new Error('coinbase-local-sequence-invalid');
  const classification=classifyCoinbaseWire(raw);
  const meta={schemaVersion:COINBASE_LOCAL_WIRE_SCHEMA,sequence:seq,connectionId:String(connectionId||''),receivedTimestampMs:received,byteLength:Buffer.byteLength(raw,'utf8'),sourceSha256:crypto.createHash('sha256').update(raw,'utf8').digest('hex'),...classification,provider:{id:'coinbase-advanced-trade-public-websocket',endpoint:COINBASE_ADVANCED_TRADE_WS_URL,authenticationRequired:false},semantics:{exactProviderTextPreserved:true,providerSequenceObserved:classification.providerSequenceNum!=null,providerSequenceContinuityVerified:false,level2DeliveryGuaranteeReliedOn:false,orderBookSynchronizationVerified:false,derivedFeaturesAvailable:false,crossVenueComparabilityClaim:false},governance:{readOnlyObservation:true,predictionInputAuthorized:false,orderSubmission:false,realMoneyRouting:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false,githubActionsRequired:false}};
  validateCoinbaseWireMeta(meta);return meta;
}

export function validateCoinbaseWireMeta(meta){
  if(meta?.schemaVersion!==COINBASE_LOCAL_WIRE_SCHEMA)throw new Error('coinbase-meta-schema-invalid');
  if(!Number.isInteger(meta?.sequence)||meta.sequence<1)throw new Error('coinbase-meta-sequence-invalid');
  if(!Number.isFinite(meta?.receivedTimestampMs))throw new Error('coinbase-meta-time-invalid');
  if(meta.provider?.endpoint!==COINBASE_ADVANCED_TRADE_WS_URL||meta.provider?.authenticationRequired!==false)throw new Error('coinbase-provider-contract-invalid');
  if(meta.semantics?.exactProviderTextPreserved!==true||meta.semantics?.providerSequenceContinuityVerified!==false||meta.semantics?.orderBookSynchronizationVerified!==false||meta.semantics?.derivedFeaturesAvailable!==false||meta.semantics?.crossVenueComparabilityClaim!==false)throw new Error('coinbase-semantic-claim-invalid');
  if(meta.governance?.predictionInputAuthorized!==false||meta.governance?.orderSubmission!==false||meta.governance?.realMoneyRouting!==false||meta.governance?.automaticPromotion!==false)throw new Error('coinbase-governance-invalid');
  if(meta.runtimePolicy?.googleCloudEnabled!==false||meta.runtimePolicy?.cloudUploadEnabled!==false||meta.runtimePolicy?.githubActionsRequired!==false)throw new Error('coinbase-cloud-policy-invalid');
  return true;
}
