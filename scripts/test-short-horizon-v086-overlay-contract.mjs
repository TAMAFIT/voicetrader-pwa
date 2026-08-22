import fs from 'node:fs';
import assert from 'node:assert/strict';

const engine=fs.readFileSync(new URL('./local-node/configure-v086-soak-certification.ps1',import.meta.url),'utf8');
const launcher=fs.readFileSync(new URL('./local-node/install-v086-soak-certification.cmd',import.meta.url),'utf8');
const source=launcher.match(/set "SOURCE_REF=([0-9a-f]{40})"/)?.[1]??null;
const overlay=launcher.match(/set "OVERLAY_REF=([0-9a-f]{40})"/)?.[1]??null;
assert.ok(source);assert.ok(overlay);assert.equal(source,overlay);
assert.match(launcher,/-OverlayRef "%OVERLAY_REF%"/);
assert.doesNotMatch(launcher,/refs\/heads|\/main\/|feat\/local-edge/);
assert.match(engine,/v0\.84 receipt missing/);
assert.match(engine,/v0\.85 receipt missing/);
assert.match(engine,/v0\.84 live health must PASS before v0\.86 overlay/);
assert.match(engine,/test-short-horizon-v086-soak-certification\.mjs/);
assert.match(engine,/VoiceTrader-LocalNode-SoakCertifier/);
assert.match(engine,/New-ScheduledTaskTrigger -AtStartup/);
assert.match(engine,/RestartCount 999/);
assert.match(engine,/target='24_CONSECUTIVE_CERTIFIED_HOURS'/);
assert.match(engine,/blindResultsRead=\$false/);
assert.match(engine,/dataDirectoriesPreserved=\$true/);

// PowerShell is case-insensitive: receipt path and payload must never differ only by case.
assert.match(engine,/\$ReceiptPath=Join-Path \$DataRoot 'state\\local-edge-lab-v086-config\.json'/);
assert.match(engine,/\$ReceiptRecord=\[ordered\]@\{/);
assert.match(engine,/Save-JsonAtomic \$ReceiptPath \$ReceiptRecord/);
assert.doesNotMatch(engine,/\$Receipt=Join-Path/);
assert.doesNotMatch(engine,/\$receipt=\[ordered\]@\{/);
assert.match(engine,/Atomic JSON parent path missing/);

assert.doesNotMatch(engine,/BlindReveal|blind-sealed|orderSubmission=\$true|realMoneyRouting=\$true|cloudUploadEnabled=\$true/);
console.log(`PASS v0.86 overlay contract + receipt path collision guard; pinned overlay ${overlay}`);
