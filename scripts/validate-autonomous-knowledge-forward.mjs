import fs from 'node:fs';

const required=[
  '.github/workflows/knowledge-forward-collector.yml',
  'src/research/knowledge-forward-remote.js',
  'src/research/autonomous-knowledge-forward-collector.js',
  'scripts/collect-knowledge-forward.mjs',
  'scripts/test-autonomous-knowledge-forward.mjs',
];
for(const file of required)if(!fs.existsSync(file))throw new Error(`missing autonomous Knowledge Forward file: ${file}`);

const remote=fs.readFileSync('src/research/knowledge-forward-remote.js','utf8');
for(const marker of ['knowledge-forward-remote-0.1','knowledge-forward-data','data/knowledge-forward-001.json','raw.githubusercontent.com','XXBTZUSD&interval=240','1af623dfa7df53618733050ff9edab5e3595a3d0','normalizeKrakenSpot4H','mergeKnowledgeForwardMarketBars','mergeKnowledgeForwardEvidenceArchives','remoteAuthoritative:true','remote archive evaluator commit mismatch'])if(!remote.includes(marker))throw new Error(`remote archive helper missing marker: ${marker}`);

const collector=fs.readFileSync('src/research/autonomous-knowledge-forward-collector.js','utf8');
for(const marker of ['autonomous-knowledge-forward-collector-0.1','fetchKrakenClosedBTCUSD4H','collectKnowledgeForwardAutonomously','collector existing archive evaluator mismatch','runKnowledgeForwardSnapshot','mergeKnowledgeForwardArchive','market-bar-conflict','browserRequired:false','paidApiRequired:false'])if(!collector.includes(marker))throw new Error(`collector core missing marker: ${marker}`);

const workflow=fs.readFileSync('.github/workflows/knowledge-forward-collector.yml','utf8');
for(const marker of ["cron: '23 * * * *'",'workflow_dispatch:','push:','branches: [main]','paths:',"'.github/workflows/knowledge-forward-collector.yml'","'scripts/collect-knowledge-forward.mjs'","'src/research/autonomous-knowledge-forward-collector.js'","'src/research/knowledge-forward-remote.js'","'src/research/knowledge-forward-replay-audit.js'",'contents: write','group: knowledge-forward-collector','cancel-in-progress: false','ref: knowledge-forward-data','1af623dfa7df53618733050ff9edab5e3595a3d0','git checkout "$FROZEN"','collect-knowledge-forward.mjs','data/knowledge-forward-001.json','git push origin HEAD:knowledge-forward-data'])if(!workflow.includes(marker))throw new Error(`collector workflow missing marker: ${marker}`);
if(workflow.includes('pull-requests: write')||workflow.includes('issues: write')||workflow.includes('actions: write'))throw new Error('collector workflow has broader write permissions than required');
if(workflow.includes('paths-ignore:'))throw new Error('collector smoke trigger must use an allowlisted paths filter, not paths-ignore');

const cli=fs.readFileSync('scripts/collect-knowledge-forward.mjs','utf8');
for(const marker of ['--archive','collectKnowledgeForwardAutonomously','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','writeFileSync'])if(!cli.includes(marker))throw new Error(`collector CLI missing marker: ${marker}`);

const ui=fs.readFileSync('src/research/knowledge-forward-ui.js','utf8');
for(const marker of ['fetchKnowledgeForwardRemoteDocument','mergeKnowledgeForwardEvidenceArchives','GitHub + local','Remote Archive','archiveConflicts','CONFLICT','knowledge-forward-data','Browser local'])if(!ui.includes(marker))throw new Error(`Knowledge Forward UI missing autonomous marker: ${marker}`);

const sw=fs.readFileSync('sw.js','utf8');
for(const marker of ['v0.16-autonomous-collector','src/research/knowledge-forward-remote.js'])if(!sw.includes(marker))throw new Error(`service worker missing autonomous marker: ${marker}`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const [major,minor]=String(pkg.version||'').split('.').map(Number);
if(major!==0||minor<16)throw new Error(`package version expected >=0.16.x, got ${pkg.version}`);
for(const marker of ['validate-autonomous-knowledge-forward.mjs','test-autonomous-knowledge-forward.mjs','knowledge-forward-remote.js','autonomous-knowledge-forward-collector.js'])if(!pkg.scripts?.test?.includes(marker))throw new Error(`npm test missing autonomous marker: ${marker}`);

for(const [name,path] of [['champion','src/engine/shadow-engine.js'],['live-forward','src/live/live-forward-paper.js'],['forward-001','src/research/forward-demo-runner.js']]){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes('autonomous-knowledge-forward-collector')||source.includes('knowledge-forward-remote'))throw new Error(`${name} coupled to autonomous research data path`);
}

console.log('Autonomous Knowledge Forward Collector v0.16 integrity validation passed.');
