export const ETH_FORWARD_EPOCH_VERSION='eth-forward-epoch-0.1';
export const ETH_FORWARD_EPOCH_ID='eth-forward-001';
export const ETH_FORWARD_FREEZE_UNIX=1786970953;
export const ETH_FORWARD_FROZEN_STRATEGY_COMMIT='0d330101f413cb19b8cd47fdd005d2230152e8db';
export const ETH_FORWARD_HORIZON_BARS=3;
export const ETH_FORWARD_SOURCE_IDS=[
  'champion-001',
  'candidate-wave1-reference',
  'candidate-playbook-reference',
  'candidate-consensus',
  'candidate-playbook-wave1-veto',
  'higher-timeframe-wave3-reference',
];
export const ETH_FORWARD_EPOCH={
  version:ETH_FORWARD_EPOCH_VERSION,
  id:ETH_FORWARD_EPOCH_ID,
  instrument:'ETHUSD',
  market:'Kraken Spot',
  timeframeHours:4,
  frozenAtLocal:'2026-08-17 21:49:13 JST',
  frozenAtUtc:'2026-08-17T12:49:13Z',
  freezeUnix:ETH_FORWARD_FREEZE_UNIX,
  frozenStrategyCommit:ETH_FORWARD_FROZEN_STRATEGY_COMMIT,
  horizonBars:ETH_FORWARD_HORIZON_BARS,
  sources:[...ETH_FORWARD_SOURCE_IDS],
  purpose:'prospective-cross-market-validation-without-eth-specific-tuning',
  promotionEligible:false,
};
export function assertEthForwardEpochRuntime(){
  if(ETH_FORWARD_EPOCH.sources.length!==6)throw new Error('eth-forward-source-count-drift');
  if(ETH_FORWARD_EPOCH.horizonBars!==3)throw new Error('eth-forward-horizon-drift');
  if(ETH_FORWARD_EPOCH.instrument!=='ETHUSD')throw new Error('eth-forward-instrument-drift');
  return true;
}
