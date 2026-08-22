import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {deriveBootEpochMs,bootIdFromEpoch,buildBootWitness} from '../src/short-horizon/local-edge-lab-reboot-recovery.js';
import {initializeRebootBaseline,evaluateCurrentBoot,waitForRebootRecovery} from './local-node/v085-reboot-witness.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'voicetrader-v085-'));
const ref='a'.repeat(40);
const now=1_000_000,uptimeSec=100;
assert.equal(deriveBootEpochMs({nowMs:now,uptimeSec}),900_000);
const bootA=bootIdFromEpoch(900_000),bootASame=bootIdFromEpoch(905_000),bootB=bootIdFromEpoch(920_000);
assert.equal(bootA,bootASame,'boot id must tolerate a few seconds of uptime/clock sampling jitter');
assert.notEqual(bootA,bootB);
const baseline=initializeRebootBaseline(root,ref,{nowMs:now,uptimeSec});assert.equal(baseline.bootId,bootA);assert.equal(baseline.exactRuntimeRef,ref);
const safeHealth={status:'PASS',evaluatedAtMs:now+1,failedChecks:[]};
let witness=evaluateCurrentBoot(root,{nowMs:now+5_000,uptimeSec:105,health:safeHealth});assert.equal(witness.status,'BASELINE_BOOT');assert.equal(witness.recovery.rebootRecoveryProven,false);
witness=evaluateCurrentBoot(root,{nowMs:now+30_000,uptimeSec:10,health:safeHealth});assert.equal(witness.status,'PROVEN');assert.equal(witness.recovery.currentBootDiffersFromInstallBoot,true);assert.equal(witness.recovery.healthPass,true);assert.equal(witness.recovery.rebootRecoveryProven,true);
const blocked=evaluateCurrentBoot(root,{nowMs:now+30_000,uptimeSec:10,health:{status:'BLOCKED',evaluatedAtMs:now+30_000,failedChecks:['COINBASE_RAW_FRESH']}});assert.equal(blocked.status,'WAITING_FOR_HEALTH');assert.equal(blocked.recovery.rebootRecoveryProven,false);
const direct=buildBootWitness({nowMs:now+30_000,uptimeSec:10,exactRuntimeRef:ref,installBootId:bootA,healthStatus:'PASS',healthEvaluatedAtMs:now+30_000});assert.equal(direct.recovery.rebootRecoveryProven,true);

let clock=now+30_000,healthCalls=0;
const waited=await waitForRebootRecovery(root,{timeoutMs:20_000,pollMs:1,now:()=>clock,uptime:()=>10,healthFn:()=>{healthCalls+=1;const pass=healthCalls>=3;return {status:pass?'PASS':'BLOCKED',evaluatedAtMs:clock,failedChecks:pass?[]:['KRAKEN_RAW_FRESH']};},sleep:async()=>{clock+=5_000;}});
assert.equal(waited.status,'PROVEN');assert.equal(healthCalls,3);
const saved=JSON.parse(fs.readFileSync(path.join(root,'state','local-edge-lab-v085-reboot-witness.json'),'utf8'));assert.equal(saved.status,'PROVEN');
assert.throws(()=>initializeRebootBaseline(root,'main',{nowMs:now,uptimeSec}),/v085-runtime-ref-invalid/);
console.log('PASS v0.85 reboot recovery witness');
