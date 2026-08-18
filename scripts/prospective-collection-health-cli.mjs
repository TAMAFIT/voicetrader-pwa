import fs from 'node:fs';
import { evaluateProspectiveCollectionHealth } from '../src/research/prospective-collection-health.js';

const env=process.env;
const required=name=>{const value=String(env[name]||'').trim();if(!value)throw new Error(`missing-env:${name}`);return value;};
const optional=name=>String(env[name]||'').trim();
const dataset=JSON.parse(fs.readFileSync(required('DATASET_PATH'),'utf8'));
let sourceBranches=[];const sourcePath=optional('SOURCE_BRANCHES_PATH');if(sourcePath)sourceBranches=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const nowRaw=optional('NOW_SECONDS');const report=evaluateProspectiveCollectionHealth(dataset,{nowSeconds:nowRaw?Number(nowRaw):Date.now()/1000,sourceBranches});
const summary={version:report.version,state:report.state,healthy:report.healthy,readyForHumanExperimentAction:report.readyForHumanExperimentAction,executionAuthorized:report.executionAuthorized,nextAction:report.nextAction,errors:report.errors,warnings:report.warnings,counts:report.counts,coverage:report.coverage,freshness:report.freshness,learningReadiness:{version:report.learningReadiness.version,gates:report.learningReadiness.gates,btc:report.learningReadiness.btc,crossMarket:{ready:report.learningReadiness.crossMarket.ready}},governance:report.governance};
console.log(JSON.stringify(summary,null,2));
if(env.GITHUB_OUTPUT){fs.appendFileSync(env.GITHUB_OUTPUT,`state=${report.state}\nhealthy=${report.healthy?'true':'false'}\nready_for_human_action=${report.readyForHumanExperimentAction?'true':'false'}\nexecution_authorized=false\nnext_action=${report.nextAction}\n`);}
