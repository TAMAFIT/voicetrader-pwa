import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

await import('../src/research/model-experiment-control.js');
const files={
  control:fs.readFileSync('src/research/model-experiment-control.js','utf8'),
  lifecycle:fs.readFileSync('src/research/model-experiment-lifecycle.js','utf8'),
  remote:fs.readFileSync('src/research/model-experiment-lifecycle-remote.js','utf8'),
  cli:fs.readFileSync('scripts/model-experiment-control-cli.mjs','utf8'),
  workflow:fs.readFileSync('.github/workflows/model-experiment-human-approval.yml','utf8'),
  ui:fs.readFileSync('src/research/model-experiment-ui.js','utf8'),
  sw:fs.readFileSync('sw.js','utf8'),
  pkg:JSON.parse(fs.readFileSync('package.json','utf8')),
  parentValidator:fs.readFileSync('scripts/validate-model-experiment-lifecycle.mjs','utf8'),
  parentTest:fs.readFileSync('scripts/test-model-experiment-lifecycle.mjs','utf8'),
};
const errors=[];const need=(condition,code)=>{if(!condition)errors.push(code);};
const check=spawnSync(process.execPath,['--check','scripts/model-experiment-control-cli.mjs'],{encoding:'utf8'});need(check.status===0,'control-cli-syntax-invalid');
need(files.pkg.version==='0.29.0','package-version-not-0.29.0');
need(files.parentValidator.includes("import './validate-model-experiment-control.mjs';"),'control-validator-not-wired');
need(files.parentTest.includes("import './test-model-experiment-control.mjs';"),'control-test-not-wired');
need(files.control.includes("MODEL_EXPERIMENT_CONTROL_VERSION='model-experiment-controlled-writer-0.1'"),'control-version-missing');
for(const marker of ['manualWorkflowDispatchOnly:true',"actorSource:'github.actor'",'browserWriteAuthority:false','automaticApproval:false','automaticSpecGeneration:false','outcomeDrivenSpecGeneration:false','requiresExpectedHeads:true','writesProspectiveExperience:false','launchesTrainingJobs:false','trainingImplemented:false'])need(files.control.includes(marker),`control-governance-missing:${marker}`);
for(const marker of ['requireExpected(expectedDatasetCommit','requireExpected(expectedCodeCommit','requireExpected(expectedLifecycleCommit','learning-readiness-gate-not-ready','human-confirmation-mismatch','draft-fingerprint-mismatch','frozen-semantic-fingerprint-mismatch'])need(files.control.includes(marker),`control-guard-missing:${marker}`);
need(files.lifecycle.includes('draftSpecs:[]'),'draft-snapshot-storage-missing');
need(files.lifecycle.includes('draftSnapshotsImmutable:true'),'draft-immutability-guard-missing');
need(files.lifecycle.includes('controlledWriterRequired:true'),'controlled-writer-lifecycle-guard-missing');
need(files.lifecycle.includes('workflowDispatchOnly:true'),'workflow-dispatch-lifecycle-guard-missing');
need(files.remote.includes('migrateLegacyEmptyModelExperimentLifecycleDocument'),'legacy-empty-read-migration-missing');
need(files.workflow.includes('workflow_dispatch:'),'manual-dispatch-trigger-missing');
need(!/\n\s*schedule:/.test(files.workflow),'automatic-schedule-trigger-forbidden');
need(!/\n\s*push:/.test(files.workflow),'automatic-push-trigger-forbidden');
const inputBlock=files.workflow.split('\npermissions:')[0];need(!/\n\s{6}actor:/.test(inputBlock),'free-form-actor-input-forbidden');
need(files.workflow.includes('GITHUB_ACTOR_IDENTITY: ${{ github.actor }}'),'github-actor-binding-missing');
need(files.workflow.includes("test \"$GITHUB_REF\" = 'refs/heads/main'"),'main-dispatch-guard-missing');
need(files.workflow.includes('contents: write'),'workflow-write-permission-missing');
need(files.workflow.includes('model-experiment-lifecycle-data'),'lifecycle-data-branch-missing');
need(files.workflow.includes('prospective-experience-data'),'experience-data-branch-missing');
need(files.workflow.includes('git push origin HEAD:model-experiment-lifecycle-data'),'non-force-data-push-missing');
need(!files.workflow.includes('git push --force'),'force-push-forbidden');
need(files.workflow.includes('REGISTER <id>')&&files.workflow.includes('FREEZE <id>')&&files.workflow.includes('RETIRE <id>'),'human-confirmation-help-missing');
need(files.cli.includes("GITHUB_ACTOR_IDENTITY"),'cli-github-actor-binding-missing');
need(files.ui.includes('MANUAL ONLY'),'ui-manual-only-status-missing');
need(files.ui.includes('Browser write</small><b>NO'),'ui-browser-write-no-missing');
need(files.sw.includes('v0.29-model-experiment-control'),'sw-v0.29-cache-version-missing');
if(errors.length){console.error(`Controlled Model Experiment Writer v0.29 validation failed: ${errors.join(',')}`);process.exit(1);}console.log('Controlled Model Experiment Registration / Human Approval Gate v0.29 integrity validation passed.');
