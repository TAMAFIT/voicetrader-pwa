import fs from 'node:fs';
const files=[
  'src/short-horizon/gmo-fx-public-quote.js',
  'src/short-horizon/gmo-paper-execution.js',
  'scripts/collect-short-horizon-gmo-quotes.mjs',
  'scripts/collect-short-horizon-gmo-paper.mjs',
  'scripts/lib/short-horizon-gmo-quote-archive.mjs',
  'scripts/lib/short-horizon-gmo-paper-archive.mjs',
  '.github/workflows/short-horizon-gmo-quote-collector.yml',
  '.github/workflows/short-horizon-gmo-paper-collector.yml',
].filter(file=>fs.existsSync(file));
const text=files.map(file=>fs.readFileSync(file,'utf8')).join('\n');
const required=[
  'gmo-coin-fx-public-v1','USD_JPY','wss://forex-api.coin.z.com/ws/public/v1','authenticationRequired:false','accountSpecificPricing:false','fillObserved:false','executionAuthorized:false','realMoneyRouting:false','orderSubmission:false','actualNetEvAvailable:false'
];
for(const token of required){if(!text.includes(token))throw new Error(`gmo-v048-required-guardrail-missing:${token}`);}
const forbidden=[
  'forex-api.coin.z.com/private','API-KEY','API-SIGN','secretKey','orderSubmission:true','realMoneyRouting:true','executionAuthorized:true','actualNetEvAvailable:true'
];
for(const token of forbidden){if(text.includes(token))throw new Error(`gmo-v048-forbidden-surface:${token}`);}
console.log('v0.48 GMO public quote/paper guardrails passed');
