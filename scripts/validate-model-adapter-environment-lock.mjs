import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
await import('../src/research/model-adapter-environment-lock.js');

const read=path=>fs.readFileSync(path,'utf8');
const files={
  module:read('src/research/model-adapter-environment-lock.js'),
  cli:read('scripts/model-adapter-preparation-cli.mjs'),
  probe:read('scripts/model_adapter_environment_probe.py'),
  workflow:read('.github/workflows/model-adapter-environment-plan.yml'),
  test:read('scripts/test-model-adapter-environment-lock.mjs'),
  pkg:JSON.parse(read('package.json')),
};
const errors=[];
const need=(condition,code)=>{if(!condition)errors.push(code);};
const [major,minor]=String(files.pkg.version||'').split('.').map(Number);
need(major===0&&minor>=33,'base-package-below-v0.33');
need(spawnSync(process.execPath,['--check','scripts/model-adapter-preparation-cli.mjs'],{encoding:'utf8'}).status===0,'adapter-preparation-cli-syntax-invalid');
need(spawnSync('python3',['-m','py_compile','scripts/model_adapter_environment_probe.py'],{encoding:'utf8'}).status===0,'environment-probe-python-syntax-invalid');

for(const marker of [
  "MODEL_ADAPTER_INTERFACE_VERSION='model-adapter-interface-0.1'",
  "MODEL_ADAPTER_DESCRIPTOR_REGISTRY_VERSION='model-adapter-descriptor-registry-0.1'",
  "MODEL_DEPENDENCY_LOCK_VERSION='model-dependency-lock-0.1'",
  "MODEL_ENVIRONMENT_LOCK_VERSION='model-environment-lock-0.1'",
  "MODEL_ADAPTER_PREPARATION_VERSION='model-adapter-preparation-0.1'",
  'descriptorRegistryReadOnly:true',
  'dependencyInstallationImplemented:false',
  'modelImportsImplemented:false',
  'modelAdapterInstalled:false',
  'modelFitImplemented:false',
  'modelPredictImplemented:false',
  'modelEvaluationImplemented:false',
  'executionAuthorized:false',
  'launchesTrainingJobs:false',
  'resultProducingWorkflow:false',
  'lockProbeMustBeSideEffectFree:true',
  'lockBuilderMayInstallDependencies:false',
  'lockMustBeProducedFromActualInstalledEnvironment:true',
  'dependency-lock-probe-side-effect-forbidden',
  'dependency-lock-fingerprint-mismatch',
  'environment-lock-fingerprint-mismatch',
  'environment-seed-policy-drift',
  'model-adapter-not-installed',
  'execution-authority-not-implemented',
])need(files.module.includes(marker),`adapter-environment-marker-missing:${marker}`);

need(files.cli.includes('buildModelAdapterPreparationRecord'),'adapter-preparation-cli-builder-missing');
need(files.cli.includes('execution_ready=false'),'adapter-preparation-cli-authority-block-missing');
for(const marker of ['sideEffectFree', 'dependencyResolutionAttempted', 'dependencyInstallationAttempted', 'modelImportsAttempted', 'modelFitAttempted', 'executionAuthorized'])need(files.probe.includes(marker),`environment-probe-marker-missing:${marker}`);
for(const forbidden of [/^\s*(?:from|import)\s+sklearn\b/m,/^\s*(?:from|import)\s+numpy\b/m,/^\s*(?:from|import)\s+pandas\b/m,/pip\s+install/i])need(!forbidden.test(files.probe),`environment-probe-forbidden-operation:${forbidden}`);
need(files.workflow.includes('workflow_dispatch:'),'adapter-environment-workflow-manual-trigger-missing');
need(!/\n\s*schedule:/.test(files.workflow),'adapter-environment-workflow-schedule-forbidden');
need(!/\n\s*push:/.test(files.workflow),'adapter-environment-workflow-push-forbidden');
need(files.workflow.includes('contents: read'),'adapter-environment-workflow-read-permission-missing');
need(!files.workflow.includes('contents: write'),'adapter-environment-workflow-write-permission-forbidden');
need(!files.workflow.includes('git push'),'adapter-environment-workflow-repository-write-forbidden');
need(!/pip\s+install|npm\s+install/i.test(files.workflow),'adapter-environment-workflow-install-forbidden');
for(const marker of ['lockProbeMustBeSideEffectFree','dependency-lock-probe-side-effect-forbidden','model-adapter-not-installed','execution-authority-not-implemented'])need(files.test.includes(marker),`adapter-environment-regression-marker-missing:${marker}`);

if(errors.length){console.error(`Model Adapter Interface & Environment Lock Prerequisites v0.34 validation failed: ${errors.join(',')}`);process.exit(1);}
console.log('Model Adapter Interface & Environment Lock Prerequisites v0.34 integrity validation passed.');
