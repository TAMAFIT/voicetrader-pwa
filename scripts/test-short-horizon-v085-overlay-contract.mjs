import fs from 'node:fs';
import assert from 'node:assert/strict';

const engine=fs.readFileSync(new URL('./local-node/configure-v085-reboot-recovery.ps1',import.meta.url),'utf8');
const launcher=fs.readFileSync(new URL('./local-node/install-v085-reboot-recovery.cmd',import.meta.url),'utf8');
const source=launcher.match(/set "SOURCE_REF=([0-9a-f]{40})"/)?.[1]??null;
const overlay=launcher.match(/set "OVERLAY_REF=([0-9a-f]{40})"/)?.[1]??null;
assert.ok(source);assert.ok(overlay);assert.equal(source,overlay);
assert.match(launcher,/-OverlayRef "%OVERLAY_REF%"/);
assert.doesNotMatch(launcher,/refs\/heads|\/main\/|feat\/local-edge/);
assert.match(engine,/Assert-ExactCommit \$OverlayRef/);
assert.match(engine,/v0\.84 installation receipt missing/);
assert.match(engine,/Current v0\.84 live health is not PASS/);
assert.match(engine,/test-short-horizon-v085-reboot-recovery\.mjs/);
assert.match(engine,/VoiceTrader-LocalNode-RebootWitness/);
assert.match(engine,/New-ScheduledTaskTrigger -AtStartup/);
assert.match(engine,/RestartCount 999/);
assert.match(engine,/--initialize --runtime-ref \$OverlayRef/);
assert.match(engine,/proofRequirement='NEW_BOOT_ID_AND_V084_HEALTH_PASS'/);
assert.match(engine,/rebootRecoveryProven=\$false/);
assert.match(engine,/dataDirectoriesPreserved=\$true/);

// PowerShell variables are case-insensitive. Keep receipt path and payload under
// unambiguously different names so $Receipt/$receipt can never collide again.
assert.match(engine,/\$ReceiptPath=Join-Path \$DataRoot 'state\\local-edge-lab-v085-config\.json'/);
assert.match(engine,/\$ReceiptRecord=\[ordered\]@\{/);
assert.match(engine,/Save-JsonAtomic \$ReceiptPath \$ReceiptRecord/);
assert.doesNotMatch(engine,/\$Receipt=Join-Path/);
assert.doesNotMatch(engine,/\$receipt=\[ordered\]@\{/);
assert.match(engine,/Atomic JSON parent path missing/);

assert.doesNotMatch(engine,/BlindReveal|blind-sealed|orderSubmission=\$true|realMoneyRouting=\$true/);
console.log(`PASS v0.85 overlay contract + receipt path collision guard; pinned overlay ${overlay}`);
