import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  KRAKEN_SPOT_V2_WS_URL,
  buildKrakenSubscriptions,
  buildKrakenWirePaths,
  frameJsonSequence,
  buildKrakenWireMeta,
} from '../../src/short-horizon/local-node-kraken-wire.js';
import { KrakenBookIntegrityTracker } from '../../src/short-horizon/kraken-book-integrity.js';

export const KRAKEN_LOCAL_RECORDER_VERSION='kraken-local-microstructure-recorder-v2';
const GiB=1024**3;

function parseArgs(argv){const out={warnFreeBytes:50*GiB,hardStopFreeBytes:10*GiB};for(let i=0;i<argv.length;i+=1){if(argv[i]==='--root')out.rootDir=argv[++i];else if(argv[i]==='--warn-free-gb')out.warnFreeBytes=Number(argv[++i])*GiB;else if(argv[i]==='--hard-stop-free-gb')out.hardStopFreeBytes=Number(argv[++i])*GiB;}return out;}

function freeBytes(rootDir){try{const s=fs.statfsSync(path.resolve(rootDir));return Number(s.bavail)*Number(s.bsize);}catch{return null;}}
function appendLog(rootDir,event){const p=buildKrakenWirePaths(rootDir,event.atMs||Date.now());fs.mkdirSync(p.logDir,{recursive:true});const f=path.join(p.logDir,`${new Date(event.atMs||Date.now()).toISOString().slice(0,10)}.ndjson`);fs.appendFileSync(f,JSON.stringify(event)+'\n','utf8');}
function writeHealth(rootDir,state){const p=buildKrakenWirePaths(rootDir,Date.now());fs.mkdirSync(p.stateDir,{recursive:true});fs.writeFileSync(p.healthFile,JSON.stringify(state,null,2),'utf8');}

function integrityPath(rootDir, timestampMs) {
  const d=new Date(timestampMs); const pad=(v)=>String(v).padStart(2,'0');
  return path.join(path.resolve(rootDir),'derived','kraken','book-integrity',String(d.getUTCFullYear()),pad(d.getUTCMonth()+1),pad(d.getUTCDate()),`${pad(d.getUTCHours())}.ndjson`);
}
function appendIntegrity(rootDir,evidence){const file=integrityPath(rootDir,evidence.receivedTimestampMs);fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(evidence)+'\n','utf8');}

export function persistKrakenWireMessage({rootDir,rawText,receivedTimestampMs=Date.now(),connectionId,sequence}){
  const raw=String(rawText??'');
  const paths=buildKrakenWirePaths(rootDir,receivedTimestampMs);
  fs.mkdirSync(paths.dir,{recursive:true});
  const meta=buildKrakenWireMeta(raw,{receivedTimestampMs,connectionId,sequence});
  fs.appendFileSync(paths.wireFile,frameJsonSequence(raw));
  fs.appendFileSync(paths.metaFile,JSON.stringify(meta)+'\n','utf8');
  return {meta,paths};
}

export async function runKrakenRecorder({
  rootDir,
  WebSocketImpl=globalThis.WebSocket,
  warnFreeBytes=50*GiB,
  hardStopFreeBytes=10*GiB,
  now=()=>Date.now(),
  sleep=(ms)=>new Promise((r)=>setTimeout(r,ms)),
  stopSignal=()=>false,
}={}){
  if(!rootDir)throw new Error('kraken-recorder-root-required');
  if(typeof WebSocketImpl!=='function')throw new Error('kraken-websocket-unavailable');
  fs.mkdirSync(path.resolve(rootDir),{recursive:true});
  let sequence=0,reconnects=0,backoffMs=1000;
  const startedAtMs=now();
  const counts={messages:0,book:0,trade:0,heartbeat:0,ack:0,parseErrors:0,bytes:0,checksumMatches:0,checksumMismatches:0};
  let lastMessageAtMs=null,lastBookAtMs=null,lastTradeAtMs=null,lastConnectionId=null,lastHealthWrite=0;
  let bookState={};

  const snapshotHealth=(status,error=null)=>({
    schemaVersion:'voicetrader-kraken-local-health-v1',status,recorderVersion:KRAKEN_LOCAL_RECORDER_VERSION,
    startedAtMs,updatedAtMs:now(),rootDir:path.resolve(rootDir),endpoint:KRAKEN_SPOT_V2_WS_URL,
    subscriptions:{symbols:['BTC/USD','ETH/USD'],channels:['book','trade'],bookDepth:10},
    connection:{lastConnectionId,reconnects,lastMessageAtMs,lastBookAtMs,lastTradeAtMs,backoffMs},
    counts:{...counts},storage:{freeBytes:freeBytes(rootDir),warnFreeBytes,hardStopFreeBytes,wireFormat:'RFC7464_JSON_TEXT_SEQUENCE_PLUS_NDJSON_META',hourlyPartition:true},
    integrity:{exactProviderTextPreserved:true,perMessageSha256:true,wireMetaAlignmentAudited:false,bookChecksumObserved:true,bookChecksumVerified:counts.checksumMatches>0&&counts.checksumMismatches===0,bookSynchronizationVerified:Object.values(bookState).length>0&&Object.values(bookState).every((s)=>s.trusted===true),bookState},
    semantics:{ofiAvailable:false,micropriceAvailable:false,tradesObserved:true,l2BookMessagesObserved:true},
    runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false,githubActionsRequired:false,authenticationRequired:false,orderSubmission:false,realMoneyRouting:false},
    error:error?String(error):null,
  });

  const maybeHealth=(status='RUNNING',error=null,force=false)=>{const t=now();if(force||t-lastHealthWrite>=5000){writeHealth(rootDir,snapshotHealth(status,error));lastHealthWrite=t;}};

  for(;;){
    if(stopSignal()) { maybeHealth('STOPPED',null,true); return snapshotHealth('STOPPED'); }
    const free=freeBytes(rootDir);
    if(Number.isFinite(free)&&free<hardStopFreeBytes){const e=`disk-free-hard-stop:${free}`;appendLog(rootDir,{atMs:now(),type:'HARD_STOP',message:e});maybeHealth('DISK_HARD_STOP',e,true);return snapshotHealth('DISK_HARD_STOP',e);}
    if(Number.isFinite(free)&&free<warnFreeBytes)appendLog(rootDir,{atMs:now(),type:'DISK_WARNING',freeBytes:free,warnFreeBytes});

    const connectionId=crypto.randomUUID();lastConnectionId=connectionId;
    let terminalError=null;
    let closed=false;
    try{
      await new Promise((resolve,reject)=>{
        const ws=new WebSocketImpl(KRAKEN_SPOT_V2_WS_URL);
        const bookTracker=new KrakenBookIntegrityTracker({depth:10});
        let pingTimer=null;
        const finish=(err)=>{if(closed)return;closed=true;if(pingTimer)clearInterval(pingTimer);try{ws.close();}catch{};err?reject(err):resolve();};
        const on=(name,handler)=>{if(typeof ws.addEventListener==='function')ws.addEventListener(name,handler);else ws[`on${name}`]=handler;};
        on('open',()=>{
          backoffMs=1000;
          for(const subscription of buildKrakenSubscriptions())ws.send(JSON.stringify(subscription));
          pingTimer=setInterval(()=>{try{ws.send(JSON.stringify({method:'ping',req_id:Math.floor(now()%2_000_000_000)}));}catch{}},45_000);
          appendLog(rootDir,{atMs:now(),type:'CONNECTED',connectionId,endpoint:KRAKEN_SPOT_V2_WS_URL});
          maybeHealth('RUNNING',null,true);
        });
        on('message',(event)=>{
          const received=now();
          const raw=typeof event?.data==='string'?event.data:String(event?.data??'');
          if(!raw)return;
          sequence+=1;
          const persisted=persistKrakenWireMessage({rootDir,rawText:raw,receivedTimestampMs:received,connectionId,sequence});
          counts.messages+=1;counts.bytes+=persisted.meta.byteLength;if(!persisted.meta.parseOk)counts.parseErrors+=1;
          if(persisted.meta.isBook){
            counts.book+=1;lastBookAtMs=received;
            const integrity=bookTracker.applyRawMessage(raw,{receivedTimestampMs:received,sourceSha256:persisted.meta.sourceSha256,sequence});
            for(const item of integrity){appendIntegrity(rootDir,item);if(item.status==='MATCH')counts.checksumMatches+=1;if(item.status==='MISMATCH')counts.checksumMismatches+=1;}
            bookState=bookTracker.snapshot();
            if(integrity.some((item)=>item.status==='MISMATCH')){terminalError=new Error('kraken-book-checksum-mismatch');finish(terminalError);return;}
          }
          if(persisted.meta.isTrade){counts.trade+=1;lastTradeAtMs=received;}if(persisted.meta.isHeartbeat)counts.heartbeat+=1;if(persisted.meta.isAck)counts.ack+=1;lastMessageAtMs=received;
          const freeNow=freeBytes(rootDir);if(Number.isFinite(freeNow)&&freeNow<hardStopFreeBytes){terminalError=new Error(`disk-free-hard-stop:${freeNow}`);finish(terminalError);return;}
          maybeHealth('RUNNING');
        });
        on('error',()=>finish(new Error('kraken-websocket-error')));
        on('close',()=>finish(null));
      });
    }catch(error){terminalError=error;}
    reconnects+=1;
    appendLog(rootDir,{atMs:now(),type:'DISCONNECTED',connectionId,error:terminalError?String(terminalError?.message||terminalError):null,reconnectInMs:backoffMs});
    maybeHealth('RECONNECTING',terminalError,true);
    if(terminalError && String(terminalError.message||terminalError).startsWith('disk-free-hard-stop:'))return snapshotHealth('DISK_HARD_STOP',terminalError);
    await sleep(backoffMs);backoffMs=Math.min(backoffMs*2,60_000);
  }
}

async function main(){const args=parseArgs(process.argv.slice(2));const result=await runKrakenRecorder(args);console.log(JSON.stringify(result,null,2));}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct)main().catch((e)=>{console.error(e?.stack||e);process.exitCode=1;});
