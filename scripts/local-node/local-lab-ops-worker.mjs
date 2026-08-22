import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocalLabSummary } from '../../src/short-horizon/local-node-ops.js';

const VERSION='voicetrader-local-lab-ops-worker-v1';
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
function parseArgs(argv){const out={pollMs:30_000,sizeEveryMs:300_000};for(let i=0;i<argv.length;i+=1){if(argv[i]==='--root')out.rootDir=argv[++i];else if(argv[i]==='--poll-ms')out.pollMs=Number(argv[++i]);else if(argv[i]==='--size-every-ms')out.sizeEveryMs=Number(argv[++i]);}return out;}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');fs.renameSync(tmp,file);}
export async function runOpsWorker({rootDir,pollMs=30_000,sizeEveryMs=300_000,stopSignal=()=>false}={}){if(!rootDir)throw new Error('ops-worker-root-required');const summaryFile=path.join(rootDir,'state','local-lab-summary.json'),healthFile=path.join(rootDir,'state','local-lab-ops-health.json');let lastSizeAt=0,lastSizes=null;while(!stopSignal()){const now=Date.now();try{const includeSizes=now-lastSizeAt>=sizeEveryMs;const summary=buildLocalLabSummary(rootDir,{nowMs:now,includeSizes});if(!includeSizes&&lastSizes)summary.storage.sizes=lastSizes;else if(includeSizes){lastSizes=summary.storage.sizes;lastSizeAt=now;}atomic(summaryFile,summary);atomic(healthFile,{schemaVersion:'voicetrader-local-lab-ops-health-v1',status:'RUNNING',workerVersion:VERSION,updatedAtMs:now,overall:summary.overall,freeGb:summary.storage.freeGb,safety:summary.safety});}catch(error){atomic(healthFile,{schemaVersion:'voicetrader-local-lab-ops-health-v1',status:'ERROR',workerVersion:VERSION,updatedAtMs:now,error:String(error?.stack||error),runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}});}await sleep(pollMs);}return true;}
async function main(){const args=parseArgs(process.argv.slice(2));await runOpsWorker(args);}const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct)main().catch((e)=>{console.error(e?.stack||e);process.exitCode=1;});
