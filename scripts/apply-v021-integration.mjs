import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function write(path,text){fs.writeFileSync(path,text,'utf8');}
function replaceOnce(text,from,to,label){if(!text.includes(from))throw new Error(`v0.21 integration missing marker: ${label}`);if(text.split(from).length!==2)throw new Error(`v0.21 integration marker not unique: ${label}`);return text.replace(from,to);}

// PWA bootstrap
{
  const path='src/pwa.js';let s=read(path);
  if(!s.includes("./research/prospective-evidence-ui.js"))s=replaceOnce(s,"import { setupHigherTimeframeForwardUI } from './research/higher-timeframe-forward-ui.js';","import { setupHigherTimeframeForwardUI } from './research/higher-timeframe-forward-ui.js';\nimport { setupProspectiveEvidenceUI } from './research/prospective-evidence-ui.js';",'pwa import');
  if(!s.includes('  setupProspectiveEvidenceUI();'))s=replaceOnce(s,'  setupHigherTimeframeForwardUI();','  setupHigherTimeframeForwardUI();\n  setupProspectiveEvidenceUI();','pwa setup');
  write(path,s);
}

// Service worker cache
{
  const path='sw.js';let s=read(path);
  s=replaceOnce(s,'-v0.20-htf-forward\';','-v0.20-htf-forward-v0.21-prospective-evidence-registry\';','sw cache version');
  if(!s.includes("'./prospective-evidence.css'"))s=replaceOnce(s,"'./higher-timeframe.css','./higher-timeframe-forward.css','./manifest.webmanifest'","'./higher-timeframe.css','./higher-timeframe-forward.css','./prospective-evidence.css','./manifest.webmanifest'",'sw css');
  if(!s.includes("'./src/research/prospective-evidence-registry.js'"))s=replaceOnce(s,"'./src/research/higher-timeframe-forward-ui.js','./src/research/knowledge-candidate-registry.js'","'./src/research/higher-timeframe-forward-ui.js','./src/research/prospective-evidence-registry.js','./src/research/prospective-evidence-health.js','./src/research/prospective-evidence-state.js','./src/research/prospective-evidence-ui.js','./src/research/knowledge-candidate-registry.js'",'sw modules');
  write(path,s);
}

// package CI wiring
{
  const path='package.json';const pkg=JSON.parse(read(path));pkg.version='0.21.0';let t=pkg.scripts.test;
  if(!t.includes('validate-prospective-evidence-registry.mjs'))t=replaceOnce(t,'node scripts/validate-higher-timeframe-forward.mjs &&','node scripts/validate-higher-timeframe-forward.mjs && node scripts/validate-prospective-evidence-registry.mjs &&','package validator');
  if(!t.includes('test-prospective-evidence-registry.mjs'))t=replaceOnce(t,'node scripts/test-higher-timeframe-forward.mjs &&','node scripts/test-higher-timeframe-forward.mjs && node scripts/test-prospective-evidence-registry.mjs &&','package test');
  if(!t.includes('node --check src/research/prospective-evidence-registry.js'))t=replaceOnce(t,'node --check src/research/higher-timeframe-forward-ui.js &&','node --check src/research/higher-timeframe-forward-ui.js && node --check src/research/prospective-evidence-registry.js && node --check src/research/prospective-evidence-health.js && node --check src/research/prospective-evidence-state.js && node --check src/research/prospective-evidence-ui.js &&','package syntax');
  pkg.scripts.test=t;write(path,`${JSON.stringify(pkg,null,2)}\n`);
}

// research export
{
  const path='src/research/research-export.js';let s=read(path);
  if(!s.includes("getLatestProspectiveEvidenceHealth"))s=replaceOnce(s,"import { getLatestHigherTimeframeForwardEvaluation } from './higher-timeframe-forward-state.js';","import { getLatestHigherTimeframeForwardEvaluation } from './higher-timeframe-forward-state.js';\nimport { getLatestProspectiveEvidenceHealth } from './prospective-evidence-state.js';",'export import');
  s=replaceOnce(s,"export const RESEARCH_EXPORT_VERSION='research-export-0.14';\nexport const PREVIOUS_RESEARCH_EXPORT_VERSION='research-export-0.13';","export const RESEARCH_EXPORT_VERSION='research-export-0.15';\nexport const PREVIOUS_RESEARCH_EXPORT_VERSION='research-export-0.14';\nexport const LEGACY_RESEARCH_EXPORT_VERSION_V13='research-export-0.13';",'export version');
  s=replaceOnce(s,'higherTimeframeEvaluation=undefined,higherTimeframeForwardEvaluation=undefined,knowledgeCandidateTournament=undefined','higherTimeframeEvaluation=undefined,higherTimeframeForwardEvaluation=undefined,prospectiveEvidenceHealth=undefined,knowledgeCandidateTournament=undefined','export arg');
  s=replaceOnce(s,'const resolvedHigherTimeframeForward=higherTimeframeForwardEvaluation===undefined?getLatestHigherTimeframeForwardEvaluation():higherTimeframeForwardEvaluation;','const resolvedHigherTimeframeForward=higherTimeframeForwardEvaluation===undefined?getLatestHigherTimeframeForwardEvaluation():higherTimeframeForwardEvaluation;\n  const resolvedProspectiveEvidenceHealth=prospectiveEvidenceHealth===undefined?getLatestProspectiveEvidenceHealth():prospectiveEvidenceHealth;','export resolve');
  if(!s.includes('Prospective Evidence Registry is observability-only'))s=replaceOnce(s,"'htf-forward-001 and knowledge-forward-001 are separate prospective archives and neither may modify the other, Champion, Live Forward or forward-001.',","'htf-forward-001 and knowledge-forward-001 are separate prospective archives and neither may modify the other, Champion, Live Forward or forward-001.',\n'Prospective Evidence Registry is observability-only: it inventories forward-001, knowledge-forward-001 and htf-forward-001 without ranking, winner selection, score aggregation or cross-stream P&L aggregation.',",'export note');
  s=replaceOnce(s,'higherTimeframeEvaluation:resolvedHigherTimeframe,higherTimeframeForwardEvaluation:resolvedHigherTimeframeForward,knowledgeCandidateTournament:resolvedTournament','higherTimeframeEvaluation:resolvedHigherTimeframe,higherTimeframeForwardEvaluation:resolvedHigherTimeframeForward,prospectiveEvidenceHealth:resolvedProspectiveEvidenceHealth,knowledgeCandidateTournament:resolvedTournament','export output');
  write(path,s);
}

// export regression fixture
{
  const path='scripts/test-research-export.mjs';let s=read(path);
  if(!s.includes('const prospectiveEvidenceHealth='))s=replaceOnce(s,'const knowledgeCandidateTournament=',"const prospectiveEvidenceHealth={version:'prospective-evidence-health-0.1',registryVersion:'prospective-evidence-registry-0.1',streamCount:3,durableRemoteStreamCount:2,autonomousCollectorCount:2,warningStreamCount:1,streams:[{epochId:'forward-001'},{epochId:'knowledge-forward-001'},{epochId:'htf-forward-001'}],governance:{inventoryOnly:true,ranking:false,winnerSelection:false,crossStreamPnlAggregation:false,usedByAnyProspectiveDecisionEngine:false}};\nconst knowledgeCandidateTournament=",'export test fixture');
  s=replaceOnce(s,'higherTimeframeEvaluation,higherTimeframeForwardEvaluation,knowledgeCandidateTournament','higherTimeframeEvaluation,higherTimeframeForwardEvaluation,prospectiveEvidenceHealth,knowledgeCandidateTournament','export test args');
  s=replaceOnce(s,"assert.equal(parsed.exportVersion,'research-export-0.14');","assert.equal(parsed.exportVersion,'research-export-0.15');",'export test version');
  if(!s.includes("parsed.prospectiveEvidenceHealth.streamCount"))s=replaceOnce(s,"assert.equal(parsed.higherTimeframeForwardEvaluation.remoteDocument.generatedDataBranch,'higher-timeframe-forward-data');","assert.equal(parsed.higherTimeframeForwardEvaluation.remoteDocument.generatedDataBranch,'higher-timeframe-forward-data');assert.equal(parsed.prospectiveEvidenceHealth.streamCount,3);assert.equal(parsed.prospectiveEvidenceHealth.governance.ranking,false);assert.equal(parsed.prospectiveEvidenceHealth.governance.crossStreamPnlAggregation,false);",'export test assertion');
  s=replaceOnce(s,"'htf-forward-001','separate prospective'","'htf-forward-001','separate prospective','Prospective Evidence Registry','cross-stream P&L'",'export test notes');
  write(path,s);
}

console.log('Applied VoiceTrader v0.21 Prospective Evidence Registry integration.');
