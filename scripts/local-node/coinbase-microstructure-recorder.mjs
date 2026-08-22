import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {COINBASE_ADVANCED_TRADE_WS_URL,COINBASE_LOCAL_PRODUCTS,buildCoinbaseSubscriptions,buildCoinbaseWirePaths,frameCoinbaseJsonSequence,buildCoinbaseWireMeta} from '../../src/short-horizon/local-node-coinbase-wire.js';
import {CoinbaseBookIntegrityTracker} from '../../src/short-horizon/coinbase-book-integrity.js';
import {buildCoinbaseBookMicrostructureFeature,extractCoinbaseTradeMicrostructureFeatures} from '../../src/short-horizon/coinbase-microstructure-features.js';

export const COINBASE_LOCAL_RECORDER_VERSION='coinbase-local-public-wire-recorder-v3';
const GiB=1024**3;
function parseArgs(argv){const out={warnFreeBytes:50*GiB,hardStopFreeBytes:10*GiB};for(let i=0;i<argv.length;i++){if(argv[i]==='--root')out.rootDir=argv[++i];else if(argv[i]==='--warn-free-gb')out.warnFreeBytes=Number(argv[++i])*GiB;else if(argv[i]==='--hard-stop-free-gb')out.hardStopFreeBytes=Number(argv[++i])*GiB;}return out;}
function freeBytes(rootDir){try{const s=fs.statfsSync(path.resolve(rootDir));return Number(s.bavail)*Number(s.bsize);}catch{return null;}}
function appendLog(rootDir,event){const p=buildCoinbaseWirePaths(rootDir,event.atMs||Date.now());fs.mkdirSync(p.logDir,{recursive:true});const f=path.join(p.logDir,`${new Date(event.atMs||Date.now()).toISOString().slice(0,10)}.ndjson`);fs.appendFileSync(f,JSON.stringify(event)+'\n','utf8');}
function writeHealth(rootDir,state){const p=buildCoinbaseWirePaths(rootDir,Date.now());fs.mkdirSync(p.stateDir,{recursive:true});fs.writeFileSync(p.healthFile,JSON.stringify(state,null,2),'utf8');}
function partitionedPath(rootDir,family,productId,timestampMs){const d=new Date(Number(timestampMs)),pad=(v)=>String(v).padStart(2,'0'),instrument=String(productId||'UNKNOWN').replace('-','');return path.join(path.resolve(rootDir),'derived','coinbase',family,instrument,String(d.getUTCFullYear()),pad(d.getUTCMonth()+1),pad(d.getUTCDate()),`${pad(d.getUTCHours())}.ndjson`);}
function appendIntegrity(rootDir,evidence){const file=partitionedPath(rootDir,'book-integrity',evidence.productId||'ALL',evidence.receivedTimestampMs);fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(evidence)+'\n','utf8');}
function appendMicrostructure(rootDir,record){const file=partitionedPath(rootDir,'microstructure',record.productId,record.receivedTimestampMs);fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(record)+'\n','utf8');}

export function persistCoinbaseWireMessage({rootDir,rawText,receivedTimestampMs=Date.now(),connectionId,sequence}){
  const raw=String(rawText??''),paths=buildCoinbaseWirePaths(rootDir,receivedTimestampMs);fs.mkdirSync(paths.dir,{recursive:true});
  const meta=buildCoinbaseWireMeta(raw,{receivedTimestampMs,connectionId,sequence});
  fs.appendFileSync(paths.wireFile,frameCoinbaseJsonSequence(raw));
  fs.appendFileSync(paths.metaFile,JSON.stringify(meta)+'\n','utf8');
  return {meta,paths};
}

export async function runCoinbaseRecorder({rootDir,WebSocketImpl=globalThis.WebSocket,warnFreeBytes=50*GiB,hardStopFreeBytes=10*GiB,now=()=>Date.now(),sleep=(ms)=>new Promise(r=>setTimeout(r,ms)),stopSignal=()=>false}={}){
  if(!rootDir)throw new Error('coinbase-recorder-root-required');
  if(typeof WebSocketImpl!=='function')throw new Error('coinbase-websocket-unavailable');
  fs.mkdirSync(path.resolve(rootDir),{recursive:true});
  const startedAtMs=now();let sequence=0,reconnects=0,backoffMs=1000,lastMessageAtMs=null,lastLevel2AtMs=null,lastTradeAtMs=null,lastHeartbeatAtMs=null,lastConnectionId=null,lastHealthWrite=0,bookState={};
  const counts={messages:0,level2:0,marketTrades:0,heartbeats:0,subscriptions:0,parseErrors:0,bytes:0,trustedSnapshots:0,trustedUpdates:0,sequenceGaps:0,sequenceOutOfOrder:0,integrityBlocks:0,bookFeatures:0,bookOfiFeatures:0,tradeFeatures:0};
  const snapshotHealth=(status,error=null)=>({schemaVersion:'voicetrader-coinbase-local-health-v3',status,recorderVersion:COINBASE_LOCAL_RECORDER_VERSION,startedAtMs,updatedAtMs:now(),rootDir:path.resolve(rootDir),endpoint:COINBASE_ADVANCED_TRADE_WS_URL,subscriptions:{products:[...COINBASE_LOCAL_PRODUCTS],channels:['level2','market_trades','heartbeats']},connection:{lastConnectionId,reconnects,lastMessageAtMs,lastLevel2AtMs,lastTradeAtMs,lastHeartbeatAtMs,backoffMs},counts:{...counts},storage:{freeBytes:freeBytes(rootDir),warnFreeBytes,hardStopFreeBytes,wireFormat:'RFC7464_JSON_TEXT_SEQUENCE_PLUS_NDJSON_META',hourlyPartition:true},integrity:{exactProviderTextPreserved:true,perMessageSha256:true,providerSequenceContinuityVerified:counts.trustedUpdates>0&&counts.sequenceGaps===0&&counts.sequenceOutOfOrder===0,orderBookSynchronizationVerified:COINBASE_LOCAL_PRODUCTS.every((product)=>bookState?.[product]?.trusted===true),bookState},semantics:{derivedFeaturesAvailable:counts.bookFeatures>0||counts.tradeFeatures>0,ofiAvailable:counts.bookOfiFeatures>0,signedTakerFlowAvailable:counts.tradeFeatures>0,crossVenueComparabilityClaim:false,predictionInputAuthorized:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false,githubActionsRequired:false,authenticationRequired:false,orderSubmission:false,realMoneyRouting:false},error:error?String(error):null});
  const maybeHealth=(status='RUNNING',error=null,force=false)=>{const t=now();if(force||t-lastHealthWrite>=5000){writeHealth(rootDir,snapshotHealth(status,error));lastHealthWrite=t;}};
  for(;;){
    if(stopSignal()){maybeHealth('STOPPED',null,true);return snapshotHealth('STOPPED');}
    const free=freeBytes(rootDir);if(Number.isFinite(free)&&free<hardStopFreeBytes){const e=`disk-free-hard-stop:${free}`;appendLog(rootDir,{atMs:now(),type:'HARD_STOP',message:e});maybeHealth('DISK_HARD_STOP',e,true);return snapshotHealth('DISK_HARD_STOP',e);}if(Number.isFinite(free)&&free<warnFreeBytes)appendLog(rootDir,{atMs:now(),type:'DISK_WARNING',freeBytes:free,warnFreeBytes});
    const connectionId=crypto.randomUUID();lastConnectionId=connectionId;let terminalError=null,closed=false;
    try{
      await new Promise((resolve,reject)=>{
        const ws=new WebSocketImpl(COINBASE_ADVANCED_TRADE_WS_URL),bookTracker=new CoinbaseBookIntegrityTracker({depth:10});
        const finish=(err)=>{if(closed)return;closed=true;try{ws.close();}catch{};err?reject(err):resolve();};
        const on=(name,handler)=>{if(typeof ws.addEventListener==='function')ws.addEventListener(name,handler);else ws[`on${name}`]=handler;};
        on('open',()=>{backoffMs=1000;for(const subscription of buildCoinbaseSubscriptions())ws.send(JSON.stringify(subscription));appendLog(rootDir,{atMs:now(),type:'CONNECTED',connectionId,endpoint:COINBASE_ADVANCED_TRADE_WS_URL});maybeHealth('RUNNING',null,true);});
        on('message',(event)=>{const received=now(),raw=typeof event?.data==='string'?event.data:String(event?.data??'');if(!raw)return;sequence++;const persisted=persistCoinbaseWireMessage({rootDir,rawText:raw,receivedTimestampMs:received,connectionId,sequence});counts.messages++;counts.bytes+=persisted.meta.byteLength;if(!persisted.meta.parseOk)counts.parseErrors++;
          if(persisted.meta.isLevel2){counts.level2++;lastLevel2AtMs=received;const previousBooks=bookTracker.snapshot();const integrity=bookTracker.applyRawMessage(raw,{receivedTimestampMs:received,sourceSha256:persisted.meta.sourceSha256,connectionId});for(const item of integrity){appendIntegrity(rootDir,item);if(item.status==='TRUSTED_SNAPSHOT')counts.trustedSnapshots++;else if(item.status==='TRUSTED_UPDATE')counts.trustedUpdates++;else{counts.integrityBlocks++;if(item.status==='SEQUENCE_GAP')counts.sequenceGaps++;if(item.status==='SEQUENCE_OUT_OF_ORDER')counts.sequenceOutOfOrder++;}}bookState=bookTracker.snapshot();for(const item of integrity){if(!['TRUSTED_SNAPSHOT','TRUSTED_UPDATE'].includes(item.status))continue;const feature=buildCoinbaseBookMicrostructureFeature({productId:item.productId,previous:previousBooks[item.productId],current:bookState[item.productId],integrityEvidence:item,receivedTimestampMs:received,sourceSha256:persisted.meta.sourceSha256,sequence});if(feature){appendMicrostructure(rootDir,feature);counts.bookFeatures++;if(feature.book.ofi!=null)counts.bookOfiFeatures++;}}const blocked=integrity.find((item)=>item.reconnectRequired===true);if(blocked){terminalError=new Error(`coinbase-book-integrity:${blocked.status}`);finish(terminalError);return;}}
          if(persisted.meta.isMarketTrades){counts.marketTrades++;lastTradeAtMs=received;const features=extractCoinbaseTradeMicrostructureFeatures(raw,{receivedTimestampMs:received,sourceSha256:persisted.meta.sourceSha256,sequence});for(const feature of features){appendMicrostructure(rootDir,feature);counts.tradeFeatures++;}}
          if(persisted.meta.isHeartbeat){counts.heartbeats++;lastHeartbeatAtMs=received;}if(persisted.meta.isSubscriptions)counts.subscriptions++;lastMessageAtMs=received;const freeNow=freeBytes(rootDir);if(Number.isFinite(freeNow)&&freeNow<hardStopFreeBytes){terminalError=new Error(`disk-free-hard-stop:${freeNow}`);finish(terminalError);return;}maybeHealth('RUNNING');if(stopSignal())finish(null);});
        on('error',()=>finish(new Error('coinbase-websocket-error')));on('close',()=>finish(null));
      });
    }catch(error){terminalError=error;}
    if(stopSignal()){maybeHealth('STOPPED',terminalError,true);return snapshotHealth('STOPPED',terminalError);}
    reconnects++;appendLog(rootDir,{atMs:now(),type:'DISCONNECTED',connectionId,error:terminalError?String(terminalError?.message||terminalError):null,reconnectInMs:backoffMs});maybeHealth('RECONNECTING',terminalError,true);if(terminalError&&String(terminalError.message||terminalError).startsWith('disk-free-hard-stop:'))return snapshotHealth('DISK_HARD_STOP',terminalError);await sleep(backoffMs);backoffMs=Math.min(backoffMs*2,60_000);
  }
}

async function main(){const result=await runCoinbaseRecorder(parseArgs(process.argv.slice(2)));console.log(JSON.stringify(result,null,2));}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
