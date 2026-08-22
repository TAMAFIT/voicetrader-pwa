import fs from 'node:fs';
import assert from 'node:assert/strict';

const text=fs.readFileSync(new URL('./local-node/recover-v085-v086-after-v084.cmd',import.meta.url),'utf8');
const source=text.match(/set "FIXED_LAUNCHER_SOURCE=([0-9a-f]{40})"/)?.[1]??null;
assert.equal(source,'3e5658e4462264614c7830d5b7c757303e4bccb8');
assert.match(text,/V084_RECEIPT=X:\\XVoiceTraderData\\state\\local-edge-lab-v084-config\.json/);
assert.match(text,/Existing v0\.84: PRESERVED/);
assert.match(text,/Installing only fixed v0\.85 then fixed v0\.86/);
assert.match(text,/Receipt path collision guard: ON/);
assert.match(text,/\[1\/2\] Installing fixed v0\.85/);
assert.match(text,/\[2\/2\] Installing fixed v0\.86/);
assert.ok(text.indexOf('[1/2]')<text.indexOf('[2/2]'));
assert.match(text,/fixed v0\.85 did not complete\. v0\.86 was not attempted/);
assert.doesNotMatch(text,/upgrade-v084-windows|install-v084-windows/);
assert.doesNotMatch(text,/Restart-Computer|shutdown(?:\.exe)?\s+[\/-]r/i);
assert.match(text,/Real money \/ orders \/ cloud upload remain OFF/);
console.log(`PASS v0.85-v0.86 recovery installer contract; launcher source=${source}`);
