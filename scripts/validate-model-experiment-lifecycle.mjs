import './validate-model-experiment-control.mjs';
import fs from 'node:fs';

await import('../src/research/model-experiment-lifecycle-remote.js');
await import('../src/research/model-experiment-ui.js');

const files={
  lifecycle:fs.readFileSync('src/research/model-experiment-lifecycle.js','utf8'),
  remote:fs.readFileSync('src/research/model-experiment-lifecycle-remote.js','utf8'),
  ui:fs.readFileSync('src/research/model-experiment-ui.js','utf8'),
  sw:fs.readFileSync('sw.js','utf8'),
  pkg:JSON.parse(fs.readFileSync('package.json','utf8')),
  parentValidator:fs.readFileSync('scripts/validate-model-experiment-spec.mjs','utf8'),
  parentTest:fs.readFileSync('scripts/test-model-experiment-spec.mjs','utf8'),
};
const errors=[];const need=(condition,code)=>{if(!condition)errors.push(code);};
const [major,minor]=String(files.pkg.version||'').split('.').map(Number);need(major===0&&minor>=28,'package-version-below-0.28.0');
need(files.parentValidator.includes("import './validate-model-experiment-lifecycle.mjs';"),'lifecycle-validator-not-wired');
need(files.parentTest.includes("import './test-model-experiment-lifecycle.mjs';"),'lifecycle-test-not-wired');
need(files.lifecycle.includes("MODEL_EXPERIMENT_LIFECYCLE_VERSION='model-experiment-lifecycle-ledger-0.2'"),'lifecycle-version-missing');
need(files.lifecycle.includes("MODEL_EXPERIMENT_LIFECYCLE_DATA_BRANCH='model-experiment-lifecycle-data'"),'lifecycle-data-branch-missing');
need(files.lifecycle.includes("MODEL_EXPERIMENT_LIFECYCLE_DATA_PATH='data/model-experiment-lifecycle-v1.json'"),'lifecycle-data-path-missing');
need(files.remote.includes('MODEL_EXPERIMENT_LIFECYCLE_DATA_BRANCH'),'remote-data-branch-binding-missing');
need(files.remote.includes('MODEL_EXPERIMENT_LIFECYCLE_DATA_PATH'),'remote-data-path-binding-missing');
need(files.lifecycle.includes('appendOnly:true'),'append-only-guard-missing');
need(files.lifecycle.includes('draftSnapshotsImmutable:true'),'draft-snapshot-immutability-guard-missing');
need(files.lifecycle.includes('mutatesFrozenSpecs:false'),'frozen-mutation-guard-missing');
need(files.lifecycle.includes('automaticApproval:false'),'automatic-approval-guard-missing');
need(files.lifecycle.includes('browserWriteAuthority:false'),'browser-write-authority-guard-missing');
need(files.lifecycle.includes('ledgerLaunchesJobs:false'),'job-launch-guard-missing');
need(files.lifecycle.includes('trainingImplemented:false'),'training-guard-missing');
need(files.lifecycle.includes("type:'RETIRED'"),'retire-event-missing');
need(files.lifecycle.includes("status!=='FROZEN'"),'frozen-status-immutability-check-missing');
need(files.lifecycle.includes("status!=='DRAFT'"),'draft-status-immutability-check-missing');
need(files.remote.includes("cache:'no-store'"),'remote-no-store-missing');
need(files.ui.includes('fetchModelExperimentLifecycleDocument'),'ui-lifecycle-remote-missing');
need(files.sw.includes('./src/research/model-experiment-lifecycle.js'),'sw-lifecycle-module-missing');
need(files.sw.includes('./src/research/model-experiment-lifecycle-remote.js'),'sw-lifecycle-remote-module-missing');
if(errors.length){console.error(`Model Experiment Lifecycle v0.28+ validation failed: ${errors.join(',')}`);process.exit(1);}console.log('Model Experiment Lifecycle v0.28+ integrity validation passed.');
