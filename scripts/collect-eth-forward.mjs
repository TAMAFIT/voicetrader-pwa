import fs from 'node:fs';
import path from 'node:path';
import { collectEthForwardAutonomously } from '../src/research/autonomous-eth-forward-collector.js';
import { emptyEthForwardRemoteDocument } from '../src/research/eth-forward-remote.js';

const args=process.argv.slice(2);const archiveFlag=args.indexOf('--archive');const archivePath=archiveFlag>=0?args[archiveFlag+1]:null;if(!archivePath)throw new Error('Usage: node scripts/collect-eth-forward.mjs --archive <path>');
let existing=emptyEthForwardRemoteDocument();if(fs.existsSync(archivePath)){try{existing=JSON.parse(fs.readFileSync(archivePath,'utf8'));}catch(error){throw new Error(`Failed to parse existing ETH archive: ${error.message}`);}}
const result=await collectEthForwardAutonomously({existingDocument:existing,workflowRunId:process.env.GITHUB_RUN_ID||null,workflowRunAttempt:process.env.GITHUB_RUN_ATTEMPT||null});
fs.mkdirSync(path.dirname(archivePath),{recursive:true});fs.writeFileSync(archivePath,`${JSON.stringify(result.document,null,2)}\n`,'utf8');
console.log(JSON.stringify({epochId:result.document.epochId,instrument:result.document.market?.instrument,strategyCommit:result.document.frozenStrategyCommit,collector:result.document.collector,audit:{status:result.document.audit?.status,pass:result.document.audit?.pass,errorCount:result.document.audit?.errorCount},marketGapCount:result.document.market?.continuity?.gapCount,observedBars:result.document.evidenceArchive?.observedBarTimes?.length||0},null,2));
