import fs from 'node:fs';
import {
  buildModelExperimentControlPlan,
  freezeControlledModelExperiment,
  registerControlledModelExperimentDraft,
  retireControlledModelExperiment,
} from '../src/research/model-experiment-control.js';

const env=process.env;
const readJson=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const required=(name)=>{const value=String(env[name]||'').trim();if(!value)throw new Error(`missing-env:${name}`);return value;};
const optional=(name)=>String(env[name]||'').trim();
const action=required('CONTROL_ACTION').toUpperCase();
const ledgerPath=required('LEDGER_PATH');
const ledger=readJson(ledgerPath);
const datasetPath=optional('DATASET_PATH');
const dataset=datasetPath?readJson(datasetPath):null;
const actualDatasetCommit=optional('ACTUAL_DATASET_COMMIT');
const actualCodeCommit=required('ACTUAL_CODE_COMMIT');
const actualLifecycleCommit=required('ACTUAL_LIFECYCLE_COMMIT');
const experimentId=required('EXPERIMENT_ID');
const templateId=optional('TEMPLATE_ID')||'btc-direction-baseline-template-v1';
const revisionRaw=optional('REVISION');
const revision=revisionRaw?Number(revisionRaw):null;
const actor=required('GITHUB_ACTOR_IDENTITY');
const occurredAt=optional('OCCURRED_AT')||new Date().toISOString();
let result;

if(action==='PLAN'){
  if(!dataset)throw new Error('plan-dataset-required');
  result=buildModelExperimentControlPlan({document:ledger,dataset,datasetCommit:actualDatasetCommit,codeCommit:actualCodeCommit,lifecycleCommit:actualLifecycleCommit,templateId});
}else if(action==='REGISTER_DRAFT'){
  if(!dataset)throw new Error('register-dataset-required');
  result=registerControlledModelExperimentDraft({document:ledger,dataset,datasetCommit:actualDatasetCommit,codeCommit:actualCodeCommit,lifecycleCommit:actualLifecycleCommit,expectedDatasetCommit:required('EXPECTED_DATASET_COMMIT'),expectedCodeCommit:required('EXPECTED_CODE_COMMIT'),expectedLifecycleCommit:required('EXPECTED_LIFECYCLE_COMMIT'),experimentId,templateId,hypothesis:required('HYPOTHESIS'),actor,occurredAt,confirmation:required('HUMAN_CONFIRMATION')});
}else if(action==='FREEZE'){
  if(!dataset)throw new Error('freeze-dataset-required');
  result=freezeControlledModelExperiment({document:ledger,dataset,datasetCommit:actualDatasetCommit,codeCommit:actualCodeCommit,lifecycleCommit:actualLifecycleCommit,expectedDatasetCommit:required('EXPECTED_DATASET_COMMIT'),expectedCodeCommit:required('EXPECTED_CODE_COMMIT'),expectedLifecycleCommit:required('EXPECTED_LIFECYCLE_COMMIT'),experimentId,revision,expectedDraftFingerprint:required('EXPECTED_DRAFT_FINGERPRINT'),actor,occurredAt,confirmation:required('HUMAN_CONFIRMATION')});
}else if(action==='RETIRE'){
  result=retireControlledModelExperiment({document:ledger,codeCommit:actualCodeCommit,lifecycleCommit:actualLifecycleCommit,expectedCodeCommit:required('EXPECTED_CODE_COMMIT'),expectedLifecycleCommit:required('EXPECTED_LIFECYCLE_COMMIT'),experimentId,revision,expectedSemanticFingerprint:required('EXPECTED_SEMANTIC_FINGERPRINT'),actor,reason:required('RETIRE_REASON'),occurredAt,confirmation:required('HUMAN_CONFIRMATION')});
}else throw new Error(`unsupported-control-action:${action}`);

if(result.mutation){const output=required('LEDGER_OUTPUT_PATH');fs.writeFileSync(output,`${JSON.stringify(result.nextDocument,null,2)}\n`);}
const summary={version:result.version,action:result.action,mutation:result.mutation??false,actor:result.actor??actor,governance:result.governance,heads:result.heads??{datasetCommit:actualDatasetCommit||null,codeCommit:actualCodeCommit,lifecycleCommit:actualLifecycleCommit},readyForDraftRegistration:result.readyForDraftRegistration??null,readinessGate:result.readinessGate??null,datasetCutoffTime:result.datasetCutoffTime??null,draftFingerprint:result.draft?result.event?.draftFingerprint??null:result.draftFingerprint??null,semanticFingerprint:result.frozen?.semanticFingerprint??result.semanticFingerprint??null,lifecycleAudit:result.nextDocument?.audit??result.lifecycleAudit??null};
console.log(JSON.stringify(summary,null,2));
if(env.GITHUB_OUTPUT){fs.appendFileSync(env.GITHUB_OUTPUT,`mutation=${result.mutation?'true':'false'}\n`);if(summary.draftFingerprint)fs.appendFileSync(env.GITHUB_OUTPUT,`draft_fingerprint=${summary.draftFingerprint}\n`);if(summary.semanticFingerprint)fs.appendFileSync(env.GITHUB_OUTPUT,`semantic_fingerprint=${summary.semanticFingerprint}\n`);}
