import fs from 'node:fs';
import path from 'node:path';
import { collectKnowledgeForwardAutonomously } from '../src/research/autonomous-knowledge-forward-collector.js';
import { emptyKnowledgeForwardRemoteDocument, normalizeKnowledgeForwardRemoteDocument } from '../src/research/knowledge-forward-remote.js';

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const archivePath = argValue('--archive');
if (!archivePath) throw new Error('Usage: node scripts/collect-knowledge-forward.mjs --archive <path>');

let existing = emptyKnowledgeForwardRemoteDocument();
if (fs.existsSync(archivePath)) {
  const raw = fs.readFileSync(archivePath,'utf8').trim();
  if (raw) existing = normalizeKnowledgeForwardRemoteDocument(JSON.parse(raw));
}

const runAtIso = new Date().toISOString();
const result = await collectKnowledgeForwardAutonomously({
  existingDocument:existing,
  runAtIso,
  workflowRunId:process.env.GITHUB_RUN_ID || null,
  workflowRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
});

fs.mkdirSync(path.dirname(archivePath),{recursive:true});
fs.writeFileSync(archivePath,`${JSON.stringify(result.document,null,2)}\n`,'utf8');

const c = result.document.collector;
console.log(JSON.stringify({
  status:c.status,
  evaluatorCommit:c.evaluatorCommit,
  incomingClosedBars:c.incomingClosedBars,
  totalMarketBars:c.totalMarketBars,
  marketBarsAdded:c.marketBarsAdded,
  archivedDecisionRecords:c.archivedDecisionRecords,
  archivedEvidenceRecords:c.archivedEvidenceRecords,
  marketGapCount:result.document.market.continuity.gapCount,
  archivePath,
},null,2));
