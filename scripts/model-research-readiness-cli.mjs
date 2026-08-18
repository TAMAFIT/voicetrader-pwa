import fs from 'node:fs';
import { evaluateModelResearchReadiness } from '../src/research/model-research-readiness-orchestrator.js';

const env=process.env;
const required=name=>{const value=String(env[name]||'').trim();if(!value)throw new Error(`missing-env:${name}`);return value;};
const optional=name=>String(env[name]||'').trim();
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const dataset=readJson(required('DATASET_PATH'));
const lifecycleDocument=readJson(required('LEDGER_PATH'));
const report=evaluateModelResearchReadiness({
  dataset,
  datasetCommit:optional('ACTUAL_DATASET_COMMIT')||null,
  lifecycleDocument,
  codeCommit:optional('ACTUAL_CODE_COMMIT')||null,
  lifecycleCommit:optional('ACTUAL_LIFECYCLE_COMMIT')||null,
  experimentId:optional('EXPERIMENT_ID')||null,
  expectedSemanticFingerprint:optional('EXPECTED_SEMANTIC_FINGERPRINT')||null,
});
const compactStages=Object.fromEntries(Object.entries(report.stages||{}).map(([name,item])=>[name,{status:item.status,pass:item.pass,blockers:item.blockers,evidence:item.evidence}]));
const summary={version:report.version,overallStatus:report.overallStatus,executionAuthorized:report.executionAuthorized,nextPrerequisite:report.nextPrerequisite,stages:compactStages,governance:report.governance};
console.log(JSON.stringify(summary,null,2));
if(env.GITHUB_OUTPUT){fs.appendFileSync(env.GITHUB_OUTPUT,`overall_status=${report.overallStatus}\nexecution_authorized=false\nnext_prerequisite=${report.nextPrerequisite}\n`);}
