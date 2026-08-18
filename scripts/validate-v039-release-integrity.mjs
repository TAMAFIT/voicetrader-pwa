import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const pkg=JSON.parse(read('package.json'));
const sw=read('sw.js');
const runner=read('scripts/run-v033-v039-release-gates.mjs');
const errors=[];
const need=(condition,code)=>{if(!condition)errors.push(code);};
const [major,minor]=String(pkg.version||'').split('.').map(Number);
need(major===0&&minor===39,'package-not-v0.39');
need(String(pkg.scripts?.posttest||'').includes('run-v033-v039-release-gates.mjs'),'posttest-release-gate-not-wired');
const gates=[
  ['v0.33','scripts/validate-model-execution-evidence-contract.mjs','scripts/test-model-execution-evidence-contract.mjs'],
  ['v0.34','scripts/validate-model-adapter-environment-lock.mjs','scripts/test-model-adapter-environment-lock.mjs'],
  ['v0.35','scripts/validate-model-adapter-dry-run.mjs','scripts/test-model-adapter-dry-run.mjs'],
  ['v0.36','scripts/validate-model-research-readiness-orchestrator.mjs','scripts/test-model-research-readiness-orchestrator.mjs'],
  ['v0.37','scripts/validate-prospective-collection-health.mjs','scripts/test-prospective-collection-health.mjs'],
  ['v0.38','scripts/validate-prospective-experience-reconciliation.mjs','scripts/test-prospective-experience-reconciliation.mjs'],
  ['v0.39','scripts/validate-prospective-experience-history-audit.mjs','scripts/test-prospective-experience-history-audit.mjs'],
];
for(const [phase,validator,test] of gates){for(const file of [validator,test]){need(fs.existsSync(file),`release-file-missing:${phase}:${file}`);need(runner.includes(file),`release-runner-not-wired:${phase}:${file}`);}}
for(const marker of ['v0.33-execution-evidence-contract','v0.34-adapter-environment','v0.35-no-fit-adapter','v0.36-research-readiness','v0.37-collection-health','v0.38-experience-reconciliation','v0.39-history-audit','v0.39-release-integrity'])need(sw.includes(marker),`service-worker-release-marker-missing:${marker}`);
for(const modulePath of [
  './src/research/model-execution-evidence-contract.js',
  './src/research/model-adapter-environment-lock.js',
  './src/research/model-adapter-dry-run-protocol.js',
  './src/research/model-adapter-dry-run-request-audit.js',
  './src/research/model-adapter-dry-run-audit.js',
  './src/research/model-research-readiness-orchestrator.js',
  './src/research/prospective-collection-health.js',
  './src/research/prospective-experience-reconciliation.js',
  './src/research/prospective-experience-history-audit.js',
])need(sw.includes(modulePath),`service-worker-module-missing:${modulePath}`);
for(const source of ['src/research/model-adapter-environment-lock.js','src/research/model-research-readiness-orchestrator.js','src/research/prospective-collection-health.js','src/research/prospective-experience-reconciliation.js','src/research/prospective-experience-history-audit.js']){
  const text=read(source);
  need(!/executionAuthorized\s*:\s*true/.test(text),`execution-authority-open:${source}`);
}
if(errors.length){console.error(`VoiceTrader v0.39 Release Integrity validation failed: ${errors.join(',')}`);process.exit(1);}
console.log('VoiceTrader v0.39 Release Integrity validation passed.');
