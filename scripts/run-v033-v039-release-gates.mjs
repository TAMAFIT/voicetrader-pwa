import { spawnSync } from 'node:child_process';

const commands=[
  ['node','scripts/validate-model-execution-evidence-contract.mjs'],
  ['node','scripts/test-model-execution-evidence-contract.mjs'],
  ['node','scripts/validate-model-adapter-environment-lock.mjs'],
  ['node','scripts/test-model-adapter-environment-lock.mjs'],
  ['node','scripts/validate-model-adapter-dry-run.mjs'],
  ['node','scripts/test-model-adapter-dry-run.mjs'],
  ['node','scripts/validate-model-research-readiness-orchestrator.mjs'],
  ['node','scripts/test-model-research-readiness-orchestrator.mjs'],
  ['node','scripts/validate-prospective-collection-health.mjs'],
  ['node','scripts/test-prospective-collection-health.mjs'],
  ['node','scripts/validate-prospective-experience-reconciliation.mjs'],
  ['node','scripts/test-prospective-experience-reconciliation.mjs'],
  ['node','scripts/validate-prospective-experience-history-audit.mjs'],
  ['node','scripts/test-prospective-experience-history-audit.mjs'],
  ['node','scripts/validate-v039-release-integrity.mjs'],
];

for(const [command,...args] of commands){
  const result=spawnSync(command,args,{stdio:'inherit',encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log('VoiceTrader v0.33-v0.39 integrated release gates passed.');
