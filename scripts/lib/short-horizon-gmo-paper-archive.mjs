import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateGmoFxPaperExecution } from '../../src/short-horizon/gmo-paper-execution.js';

export const GMO_FX_PAPER_ARCHIVE_VERSION = 'gmo-fx-paper-archive-v1';
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive:true });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const canonical = (value) => JSON.stringify(stable(value));
function immutableView(record) { const value = clone(record); delete value.evaluatedAtMs; return value; }
function dayParts(timestampMs) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('gmo-paper-archive-time-invalid');
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth()+1).padStart(2,'0');
  const d = String(date.getUTCDate()).padStart(2,'0');
  return { y,m,day:`${y}-${m}-${d}` };
}
export function gmoPaperRelativePath(record) {
  validateGmoFxPaperExecution(record);
  const ts = record.entry?.sourceTimestampMs ?? record.signal.generatedAtMs;
  const { y,m,day } = dayParts(ts);
  return path.posix.join('data','short-horizon-gmo-paper','USDJPY',`${record.researchMarket.timeframeMinutes}m`,y,m,`${day}.ndjson`);
}
function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath,'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line,index)=>{
    try { const r=JSON.parse(line); validateGmoFxPaperExecution(r); return r; }
    catch(error){ throw new Error(`gmo-paper-archive-invalid-line:${filePath}:${index+1}:${error?.message||error}`); }
  });
}
function writeAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const body = `${[...records].sort((a,b)=>a.signal.generatedAtMs-b.signal.generatedAtMs || a.paperId.localeCompare(b.paperId)).map(JSON.stringify).join('\n')}\n`;
  const tmp=`${filePath}.tmp-${process.pid}`; fs.writeFileSync(tmp,body,'utf8'); fs.renameSync(tmp,filePath);
}
export function mergeGmoPaperIntoArchive({ rootDir, records }={}) {
  if (!rootDir) throw new Error('gmo-paper-archive-root-required');
  if (!Array.isArray(records)) throw new Error('gmo-paper-archive-records-required');
  const groups=new Map();
  for(const record of records){ validateGmoFxPaperExecution(record); const p=gmoPaperRelativePath(record); if(!groups.has(p))groups.set(p,[]); groups.get(p).push(record); }
  const summary={fetched:records.length,added:0,duplicates:0,filesTouched:0};
  for(const [rel,incoming] of groups){
    const filePath=path.join(rootDir,...rel.split('/')); const existing=readNdjson(filePath); const map=new Map(existing.map(r=>[r.paperId,r]));
    if(map.size!==existing.length) throw new Error('gmo-paper-archive-duplicate-existing'); let changed=false;
    for(const record of incoming){ const prior=map.get(record.paperId); if(!prior){map.set(record.paperId,record);summary.added++;changed=true;} else if(canonical(immutableView(prior))===canonical(immutableView(record))){summary.duplicates++;} else throw new Error(`gmo-paper-archive-immutability-conflict:${record.paperId}`); }
    if(changed){writeAtomic(filePath,[...map.values()]);summary.filesTouched++;}
  }
  return summary;
}
function walk(dir,out=[]){ if(!fs.existsSync(dir))return out; for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name); if(e.isDirectory())walk(full,out); else if(e.isFile()&&e.name.endsWith('.ndjson'))out.push(full);} return out; }
export function readGmoPaperArchive(rootDir){ const base=path.join(rootDir,'data','short-horizon-gmo-paper'); const files=walk(base).sort(); const records=files.flatMap(readNdjson).sort((a,b)=>a.signal.generatedAtMs-b.signal.generatedAtMs||a.paperId.localeCompare(b.paperId)); const ids=new Set(); for(const r of records){if(ids.has(r.paperId))throw new Error(`gmo-paper-archive-duplicate-id:${r.paperId}`);ids.add(r.paperId);} return {files,records}; }
export function writeGmoPaperManifest({rootDir,lastRun}={}){
  const {files,records}=readGmoPaperArchive(rootDir); const directional=records.filter(r=>r.status==='SIMULATED_EXECUTED'); const values=directional.map(r=>Number(r.result.quotedRoundTripReturnBps)).filter(Number.isFinite);
  const manifest={
    schemaVersion:'gmo-fx-paper-manifest-v1',archiveVersion:GMO_FX_PAPER_ARCHIVE_VERSION,updatedAtMs:Date.now(),
    storage:{kind:'github-generated-data-branch',branch:'short-horizon-gmo-paper-data',sourceSignalBranch:'short-horizon-signal-data',sourceQuoteBranch:'short-horizon-gmo-quote-data',format:'ndjson-daily-utc'},
    methodology:{prospectiveSignalsOnly:true,sideCorrectBidAsk:true,quotedSpreadEmbedded:true,actualFillObserved:false,feesModeled:false,slippageModeled:false,financingOrSwapModeled:false,actualNetEvAvailable:false,optimizer:false,changesHumanCanonThresholds:false,profitabilityClaim:false},
    archive:{recordCount:records.length,fileCount:files.length,duplicatePaperIdCount:0,directionalCount:directional.length,waitCount:records.filter(r=>r.status==='NO_TRADE').length,positiveAfterObservedQuotedSpreadOnlyCount:directional.filter(r=>r.result.positiveAfterObservedQuotedSpreadOnly).length,meanQuotedRoundTripReturnBps:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,contentSha256:sha256(records.map(JSON.stringify).join('\n'))},
    lastRun,
    guardrails:{usedByDecisionEngine:false,automaticPromotion:false,executionAuthorized:false,realMoneyRouting:false,orderSubmission:false,generatedDataOnly:true}
  };
  const base=path.join(rootDir,'data','short-horizon-gmo-paper');ensureDir(base);fs.writeFileSync(path.join(base,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');return manifest;
}
