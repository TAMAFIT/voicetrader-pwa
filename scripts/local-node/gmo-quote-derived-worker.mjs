import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DERIVED_INTERVALS_MS,
  aggregateQuoteBucket,
  buildDerivedPath,
  floorBucketMs,
} from '../../src/short-horizon/local-node-gmo-derived.js';

export const GMO_DERIVED_WORKER_VERSION = 'gmo-derived-worker-v1';

function parseArgs(argv) {
  const out = { pollMs:15_000, lookbackMinutes:5, once:false };
  for (let i=0;i<argv.length;i+=1) {
    const arg = argv[i];
    if (arg === '--root') out.rootDir = argv[++i];
    else if (arg === '--poll-ms') out.pollMs = Number(argv[++i]);
    else if (arg === '--lookback-minutes') out.lookbackMinutes = Number(argv[++i]);
    else if (arg === '--once') out.once = true;
  }
  return out;
}

const pad2 = (value) => String(value).padStart(2,'0');
function rawHourPath(rootDir, timestampMs) {
  const d = new Date(timestampMs);
  return path.join(path.resolve(rootDir),'raw','gmo-fx','USDJPY',String(d.getUTCFullYear()),pad2(d.getUTCMonth()+1),pad2(d.getUTCDate()),`${pad2(d.getUTCHours())}.ndjson`);
}

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file,'utf8');
  const out=[];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function readMinuteRaw(rootDir, minuteStartMs) {
  const end = minuteStartMs + 60_000;
  const files = new Set([rawHourPath(rootDir, minuteStartMs), rawHourPath(rootDir, end-1)]);
  const rows=[];
  for (const file of files) {
    for (const row of readNdjson(file)) {
      const ts = Number(row?.capture?.receivedTimestampMs ?? row?.quote?.timing?.receivedTimestampMs);
      if (Number.isFinite(ts) && ts >= minuteStartMs && ts < end) rows.push(row);
    }
  }
  rows.sort((a,b)=>Number(a.capture?.receivedTimestampMs)-Number(b.capture?.receivedTimestampMs));
  return rows;
}

function existingIds(file, cache) {
  if (cache.has(file)) return cache.get(file);
  const ids=new Set(readNdjson(file).map((row)=>row?.bucketId).filter(Boolean));
  cache.set(file,ids);
  return ids;
}

function appendRecord(file, record, cache) {
  const ids=existingIds(file,cache);
  if (ids.has(record.bucketId)) return false;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.appendFileSync(file,JSON.stringify(record)+'\n','utf8');
  ids.add(record.bucketId);
  return true;
}

function deriveMinute(rootDir, minuteStartMs, cache) {
  const raw = readMinuteRaw(rootDir, minuteStartMs);
  if (!raw.length) return { minuteStartMs, rawQuotes:0, appended:0 };
  let appended=0;
  for (const intervalMs of DERIVED_INTERVALS_MS) {
    const grouped=new Map();
    for (const row of raw) {
      const ts=Number(row?.capture?.receivedTimestampMs ?? row?.quote?.timing?.receivedTimestampMs);
      const start=floorBucketMs(ts,intervalMs);
      if (!grouped.has(start)) grouped.set(start,[]);
      grouped.get(start).push(row);
    }
    for (const [bucketStart, rows] of grouped) {
      const record=aggregateQuoteBucket(rows,intervalMs);
      if (!record) continue;
      const file=buildDerivedPath(rootDir,intervalMs,bucketStart);
      if (appendRecord(file,record,cache)) appended += 1;
    }
  }
  return { minuteStartMs, rawQuotes:raw.length, appended };
}

function statePaths(rootDir) {
  const stateDir=path.join(path.resolve(rootDir),'state');
  const logDir=path.join(path.resolve(rootDir),'logs','derived');
  return { stateDir, health:path.join(stateDir,'derived-gmo-health.json'), logDir };
}

function writeHealth(rootDir, payload) {
  const p=statePaths(rootDir);
  fs.mkdirSync(p.stateDir,{recursive:true});
  fs.writeFileSync(p.health,JSON.stringify(payload,null,2),'utf8');
}

function appendLog(rootDir, payload) {
  const p=statePaths(rootDir);
  fs.mkdirSync(p.logDir,{recursive:true});
  const d=new Date(payload.atMs || Date.now());
  const file=path.join(p.logDir,`${d.toISOString().slice(0,10)}.ndjson`);
  fs.appendFileSync(file,JSON.stringify(payload)+'\n','utf8');
}

export function runDerivedPass({rootDir, nowMs=Date.now(), lookbackMinutes=5}={}) {
  if (!rootDir) throw new Error('derived-root-required');
  const completedMinuteStart=Math.floor(nowMs/60_000)*60_000-60_000;
  const cache=new Map();
  const results=[];
  for (let offset=Math.max(1,lookbackMinutes)-1;offset>=0;offset-=1) {
    results.push(deriveMinute(rootDir,completedMinuteStart-offset*60_000,cache));
  }
  const totals=results.reduce((acc,row)=>({rawQuotes:acc.rawQuotes+row.rawQuotes,appended:acc.appended+row.appended}),{rawQuotes:0,appended:0});
  const health={
    schemaVersion:'voicetrader-local-derived-health-v1',
    status:'RUNNING',
    workerVersion:GMO_DERIVED_WORKER_VERSION,
    updatedAtMs:Date.now(),
    rootDir:path.resolve(rootDir),
    lastCompletedMinuteStartMs:completedMinuteStart,
    lookbackMinutes,
    lastPass:{results,totals},
    semantics:{rawIsAuthoritative:true,derivedIsRebuildable:true,quoteDirectionBalanceIsOfi:false,orderBookObserved:false},
    runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false,githubActionsRequired:false,externalNetworkRequired:false},
  };
  writeHealth(rootDir,health);
  appendLog(rootDir,{atMs:health.updatedAtMs,type:'DERIVED_PASS',totals,completedMinuteStart});
  return health;
}

async function main() {
  const args=parseArgs(process.argv.slice(2));
  if (!args.rootDir) throw new Error('derived-root-required');
  if (!Number.isFinite(args.pollMs) || args.pollMs < 1000) throw new Error('derived-poll-invalid');
  if (!Number.isInteger(args.lookbackMinutes) || args.lookbackMinutes < 1 || args.lookbackMinutes > 120) throw new Error('derived-lookback-invalid');
  for (;;) {
    try {
      const health=runDerivedPass({rootDir:args.rootDir,lookbackMinutes:args.lookbackMinutes});
      if (args.once) {
        console.log(JSON.stringify(health,null,2));
        return;
      }
    } catch (error) {
      appendLog(args.rootDir,{atMs:Date.now(),type:'DERIVED_ERROR',message:String(error?.stack||error)});
    }
    await new Promise((resolve)=>setTimeout(resolve,args.pollMs));
  }
}

const direct=process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) main().catch((error)=>{ console.error(error?.stack||error); process.exitCode=1; });
