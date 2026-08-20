import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateShortHorizonSignalRecord } from '../src/short-horizon/signal-contract.js';
import { buildGmoFxPaperExecution, paperIdForSignal } from '../src/short-horizon/gmo-paper-execution.js';
import { readGmoQuoteArchive } from './lib/short-horizon-gmo-quote-archive.mjs';
import { mergeGmoPaperIntoArchive, readGmoPaperArchive, writeGmoPaperManifest } from './lib/short-horizon-gmo-paper-archive.mjs';

export const GMO_FX_PAPER_COLLECTOR_VERSION = 'gmo-fx-paper-collector-v1';
const ENTRY_TOLERANCE_MS = 10 * 60_000;
const EXIT_TOLERANCE_MS = 10 * 60_000;

function parseArgs(argv){const out={};for(let i=0;i<argv.length;i++){if(argv[i]==='--signal-root')out.signalRoot=argv[++i];else if(argv[i]==='--quote-root')out.quoteRoot=argv[++i];else if(argv[i]==='--paper-root')out.paperRoot=argv[++i];}return out;}
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())walk(full,out);else if(e.isFile()&&e.name.endsWith('.ndjson'))out.push(full);}return out;}
function readUsdJpySignals(rootDir){
  const base=path.join(rootDir,'data','short-horizon-signals','fx','USDJPY');
  return walk(base).sort().flatMap(file=>fs.readFileSync(file,'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line))).filter(record=>{
    validateShortHorizonSignalRecord(record);
    return record.observationMode==='prospective'&&record.observedProspectively===true&&record.market.assetClass==='fx'&&record.market.instrument==='USDJPY';
  }).sort((a,b)=>a.generatedAtMs-b.generatedAtMs||a.signalId.localeCompare(b.signalId));
}
function firstQuoteAtOrAfter(quotes,target,maxDelayMs){return quotes.find(q=>q.quote.marketStatus==='OPEN'&&q.timing.sourceTimestampMs>=target&&q.timing.sourceTimestampMs<=target+maxDelayMs)||null;}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.signalRoot||!args.quoteRoot||!args.paperRoot)throw new Error('gmo-paper-roots-required');
  const signalRoot=path.resolve(args.signalRoot);const quoteRoot=path.resolve(args.quoteRoot);const paperRoot=path.resolve(args.paperRoot);const startedAtMs=Date.now();
  const signals=readUsdJpySignals(signalRoot);const quotes=readGmoQuoteArchive(quoteRoot).records;const existing=readGmoPaperArchive(paperRoot).records;const existingIds=new Set(existing.map(r=>r.paperId));const records=[];
  let pendingEntry=0,pendingExit=0,waitNoTrade=0,directionalReady=0;
  for(const signal of signals){
    const horizons=[['primary',Number(signal.decision.intendedHorizonMinutes)],['secondary',Number(signal.decision.secondaryHorizonMinutes)]];
    for(const [kind,minutes] of horizons){
      const id=paperIdForSignal(signal,kind,minutes);if(existingIds.has(id))continue;
      if(signal.decision.signal==='WAIT'){
        records.push(buildGmoFxPaperExecution({signal,horizonKind:kind,horizonMinutes:minutes,evaluatedAtMs:startedAtMs}));waitNoTrade++;continue;
      }
      const entry=firstQuoteAtOrAfter(quotes,Number(signal.generatedAtMs),ENTRY_TOLERANCE_MS);if(!entry){pendingEntry++;continue;}
      const target=Number(entry.timing.sourceTimestampMs)+minutes*60_000;const exit=firstQuoteAtOrAfter(quotes,target,EXIT_TOLERANCE_MS);if(!exit){pendingExit++;continue;}
      records.push(buildGmoFxPaperExecution({signal,horizonKind:kind,horizonMinutes:minutes,entryQuote:entry,exitQuote:exit,evaluatedAtMs:startedAtMs}));directionalReady++;
    }
  }
  const merge=mergeGmoPaperIntoArchive({rootDir:paperRoot,records});const finishedAtMs=Date.now();
  const lastRun={status:'success',collectorVersion:GMO_FX_PAPER_COLLECTOR_VERSION,startedAtMs,finishedAtMs,durationMs:finishedAtMs-startedAtMs,cadenceMinutes:5,githubRunId:process.env.GITHUB_RUN_ID||null,githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT||null,tolerances:{entryMs:ENTRY_TOLERANCE_MS,exitMs:EXIT_TOLERANCE_MS},aggregate:{signalsRead:signals.length,quotesRead:quotes.length,existingPaperRecords:existing.length,newPaperRecords:records.length,newDirectionalReady:directionalReady,newWaitNoTrade:waitNoTrade,pendingEntry,pendingExit,archiveAdded:merge.added,archiveDuplicates:merge.duplicates,archiveFilesTouched:merge.filesTouched}};
  const manifest=writeGmoPaperManifest({rootDir:paperRoot,lastRun});console.log(JSON.stringify({status:'success',aggregate:lastRun.aggregate,archive:manifest.archive},null,2));
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);if(direct)main().catch(error=>{console.error(error?.stack||error);process.exitCode=1;});
