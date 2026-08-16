const CACHE_NAME='voicetrader-shell-v0.8-walk-forward';
const APP_SHELL=[
  './','./index.html','./styles.css','./ui-hotfix.css','./ui-layout.css','./ui-viewport.css','./research-evaluation.css','./walk-forward.css','./manifest.webmanifest',
  './src/app.js','./src/config.js','./src/pwa.js',
  './src/data/market-data-provider.js','./src/research/decision-event-log.js','./src/research/counterfactual-shadow.js','./src/research/baseline-runner.js','./src/research/null-market-runner.js','./src/research/strategy-registry.js','./src/research/challenger-runner.js','./src/research/walk-forward-runner.js','./src/research/walk-forward-state.js','./src/research/walk-forward-ui.js','./src/research/research-export.js','./src/research/research-evaluation-ui.js',
  './src/engine/indicators.js','./src/engine/experts.js','./src/engine/decision-policy.js','./src/engine/shadow-engine.js','./src/engine/ai-provider.js','./src/engine/execution-engine.js',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/icon-maskable-512.png','./assets/icons/apple-touch-icon.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));return}e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)))});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
