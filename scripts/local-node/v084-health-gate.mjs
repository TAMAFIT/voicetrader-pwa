import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateLocalEdgeLabV084Health} from '../../src/short-horizon/local-edge-lab-v084-health.js';

function parseArgs(argv){const out={maxAgeMs:90_000,json:false};for(let i=0;i<argv.length;i+=1){if(argv[i]==='--root')out.rootDir=argv[++i];else if(argv[i]==='--max-age-ms')out.maxAgeMs=Number(argv[++i]);else if(argv[i]==='--json')out.json=true;}return out;}
function read(root,name){try{return JSON.parse(fs.readFileSync(path.join(root,'state',name),'utf8'));}catch{return null;}}
export function evaluateRoot(rootDir,{nowMs=Date.now(),maxAgeMs=90_000}={}){if(!rootDir)throw new Error('v084-health-root-required');return evaluateLocalEdgeLabV084Health({nowMs,maxAgeMs,krakenRaw:read(rootDir,'kraken-microstructure-health.json'),krakenWindows:read(rootDir,'kraken-boundary-health.json'),coinbaseRaw:read(rootDir,'coinbase-microstructure-health.json'),coinbaseWindows:read(rootDir,'coinbase-boundary-health.json'),crossVenueWorker:read(rootDir,'cross-venue-replication-worker-state.json'),preregisteredWorker:read(rootDir,'cross-venue-preregistered-worker-state.json'),learningScorecard:read(rootDir,'cross-venue-learning-scorecard.json')});}
async function main(){const args=parseArgs(process.argv.slice(2));const report=evaluateRoot(args.rootDir,{maxAgeMs:args.maxAgeMs});if(args.json)console.log(JSON.stringify(report,null,2));else{console.log(`VoiceTrader v0.84 health: ${report.status}`);for(const c of report.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}${c.detail==null?'':` = ${JSON.stringify(c.detail)}`}`);}if(report.status!=='PASS')process.exitCode=2;}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct)main().catch((e)=>{console.error(e?.stack||e);process.exitCode=1;});
