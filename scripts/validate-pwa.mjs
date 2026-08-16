import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const fail=m=>{console.error(`PWA validation failed: ${m}`);process.exitCode=1;};
const required=['index.html','manifest.webmanifest','sw.js','assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/icon-maskable-512.png','assets/icons/apple-touch-icon.png'];
for(const file of required){if(!fs.existsSync(path.join(root,file)))fail(`missing required file: ${file}`)}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controls=[...html].filter(ch=>{const n=ch.charCodeAt(0);return n<32&&![9,10,13].includes(n)});
if(controls.length)fail(`index.html contains ${controls.length} forbidden control characters`);
if(html.includes('\uFFFD'))fail('index.html contains Unicode replacement characters');
for(const marker of ['VoiceTrader','id="chart"','id="instrument"','id="scanner"','id="buy"','id="sell"']){if(!html.includes(marker))fail(`index.html missing marker: ${marker}`)}
if(!/<style>[\s\S]+<\/style>/.test(html))fail('inline CSS missing');
if(!/<script>[\s\S]+<\/script>/.test(html))fail('inline application script missing');
for(const m of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)){if(!fs.existsSync(path.join(root,m[1])))fail(`HTML references missing file: ${m[1]}`)}
JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const file of ['index.html','manifest.webmanifest','assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/icon-maskable-512.png']){if(!sw.includes(`./${file}`))fail(`service worker cache missing: ${file}`)}
if(!process.exitCode)console.log('PWA integrity validation passed.');
