import assert from 'node:assert/strict';
import {createSoakHourAccumulator,addSoakSample,finalizeSoakHour,buildSoakReport,SOAK_POLICY} from '../src/short-horizon/local-edge-lab-soak-certifier.js';

const H=3600000;
function goodHour(start,{healthFails=0,samples=60,regress=false}={}){const a=createSoakHourAccumulator(start);for(let i=0;i<samples;i++){const base=i*10+(regress&&i===30?-500:0);addSoakSample(a,{sampledAtMs:start+i*60000,healthStatus:i<healthFails?'BLOCKED':'PASS',failedChecks:i<healthFails?['TEST_FAIL']:[],counters:{krakenMessages:1000+base,krakenWindows:100+base,coinbaseMessages:2000+base,coinbaseWindows:200+base,crossKrakenRead:300+base,crossCoinbaseRead:400+base,crossPairs:50+base}});}return finalizeSoakHour(a);}
const g=goodHour(0);assert.equal(g.certified,true);assert.equal(g.checks.coveragePass,true);assert.equal(g.checks.healthPass,true);assert.equal(g.checks.countersMonotonic,true);assert.equal(g.checks.flowPass,true);assert.equal(g.healthPassRate,1);
const sparse=goodHour(H,{samples:49});assert.equal(sparse.certified,false);assert.equal(sparse.checks.coveragePass,false);
const unhealthy=goodHour(2*H,{healthFails:4});assert.equal(unhealthy.healthPassRate,0.933333);assert.equal(unhealthy.checks.healthPass,false);assert.equal(unhealthy.certified,false);
const reset=goodHour(3*H,{regress:true});assert.equal(reset.checks.countersMonotonic,false);assert.equal(reset.certified,false);
const hours=[];for(let i=0;i<SOAK_POLICY.requiredConsecutiveHours;i++)hours.push(goodHour((10+i)*H));const report=buildSoakReport(hours,{generatedAtMs:99});assert.equal(report.status,'PROVEN_24H');assert.equal(report.currentConsecutiveCertifiedHours,24);assert.equal(report.proofWindow.hours,24);assert.equal(report.governance.blindResultsRead,false);assert.equal(report.governance.predictionInputAuthorized,false);assert.equal(report.governance.actualNetEvAvailable,false);
const broken=[...hours.slice(0,12),unhealthy,...hours.slice(13)];const no=buildSoakReport(broken);assert.equal(no.status,'ACCUMULATING');
console.log('PASS v0.86 24h continuous soak certification');
