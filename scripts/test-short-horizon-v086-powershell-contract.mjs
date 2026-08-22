import fs from 'node:fs';
import assert from 'node:assert/strict';

const engine=fs.readFileSync(new URL('./local-node/configure-v086-soak-certification.ps1',import.meta.url),'utf8');

// PowerShell command resolution gives aliases precedence over functions. Avoid
// one-letter helper names such as R/S that can collide with built-in aliases
// (notably r -> Invoke-History) on Windows PowerShell.
assert.doesNotMatch(engine,/function\s+[RS]\s*\(/i);
assert.doesNotMatch(engine,/(?:^|[;\s])R\s+['\"]/m);
assert.doesNotMatch(engine,/(?:^|[;\s])S\s+['\"]/m);
assert.match(engine,/function RuntimePath\(/);
assert.match(engine,/function StagedPath\(/);
assert.match(engine,/function Download-Overlay\(/);
assert.match(engine,/function Read-V084Health\(/);
assert.match(engine,/RuntimePath 'scripts\/local-node\/v084-health-gate\.mjs'/);
assert.match(engine,/Read-V084Health \$node/);

// Keep the earlier PowerShell case-insensitive receipt-path collision guard.
assert.match(engine,/\$ReceiptPath=Join-Path \$DataRoot 'state\\local-edge-lab-v086-config\.json'/);
assert.match(engine,/\$ReceiptRecord=\[ordered\]@\{/);
assert.match(engine,/Save-JsonAtomic \$ReceiptPath \$ReceiptRecord/);
assert.doesNotMatch(engine,/\$Receipt=Join-Path/);
assert.doesNotMatch(engine,/\$receipt=\[ordered\]@\{/);

assert.doesNotMatch(engine,/orderSubmission=\$true|realMoneyRouting=\$true|cloudUploadEnabled=\$true/);
console.log('PASS v0.86 PowerShell alias + receipt collision contract');
