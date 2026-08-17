import fs from 'node:fs';
import path from 'node:path';
import { collectHigherTimeframeForwardAutonomously } from '../src/research/autonomous-higher-timeframe-forward-collector.js';
import { emptyHigherTimeframeForwardRemoteDocument } from '../src/research/higher-timeframe-forward-remote.js';

const args=process.argv.slice(2);const archiveFlag=args.indexOf('--archive');const archivePath=archiveFlag>=0?args[archiveFlag+1]:null;if(!archivePath)throw new Error('Usage: node scripts/collect-higher-timeframe-forward.mjs --archive <path>');
let existing=emptyHigherTimeframeForwardRemoteDocument();if(fs.existsSync(archivePath)){try{existing=JSON.parse(fs.readFileSync(archivePath,'utf8'));}catch(error){throw new Error(`Failed to parse existing HTF archive: ${error.message}`);}}
const result=await collectHigherTimeframeForwardAutonomously({existingDocument:existing,workflowRunId:process.env.GITHUB_RUN_ID||null,workflowRunAttempt:process.env.GITHUB_RUN_ATTEMPT||null});
fs.mkdirSync(path.dirname(archivePath),{recursive:true});fs.writeFileSync(archivePath,`${JSON.stringify(result.document,null,2)}\n`,'utf8');
console.log(JSON.stringify({epochId:result.document.epochId,evaluatorCommit:result.document.frozenEvaluatorCommit,collector:result.document.collector,audit:{status:result.document.audit?.status,pass:result.document.audit?.pass,errorCount:result.document.audit?.errorCount},marketGapCount:result.document.market?.continuity?.gapCount,observedBars:result.document.evidenceArchive?.observedBarTimes?.length||0},null,2));
