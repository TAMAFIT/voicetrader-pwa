export const COUNTERFACTUAL_VERSION = 'cf-fixed-horizons-0.1';
export const COUNTERFACTUAL_HORIZONS = Object.freeze([1, 3, 6]);

const toBps = value => value * 10000;
const round = value => Math.round(value * 100) / 100;

function pathStats(series, entryIndex, horizonBars, entryPrice) {
  const path = series.slice(entryIndex + 1, entryIndex + horizonBars + 1);
  const maxHigh = Math.max(...path.map(bar => Number(bar.h)));
  const minLow = Math.min(...path.map(bar => Number(bar.l)));
  return {
    longMfeBps: round(toBps(maxHigh / entryPrice - 1)),
    longMaeBps: round(toBps(minLow / entryPrice - 1)),
    shortMfeBps: round(toBps((entryPrice - minLow) / entryPrice)),
    shortMaeBps: round(toBps((entryPrice - maxHigh) / entryPrice)),
  };
}

export function buildFixedHorizonCounterfactual({
  series,
  entryIndex,
  estimatedRoundTripCostBps = 0,
  horizons = COUNTERFACTUAL_HORIZONS,
}) {
  const entry = series?.[entryIndex];
  if (!entry || !Number.isFinite(Number(entry.c))) {
    return {
      version: COUNTERFACTUAL_VERSION,
      independentSamples: false,
      status: 'unavailable',
      reason: 'entry-bar-unavailable',
      outcomes: [],
    };
  }

  const entryPrice = Number(entry.c);
  const costBps = Number(estimatedRoundTripCostBps) || 0;
  const outcomes = [];

  for (const horizonBars of horizons) {
    const exit = series[entryIndex + horizonBars];
    if (!exit || !Number.isFinite(Number(exit.c))) continue;
    const exitPrice = Number(exit.c);
    const longGrossBps = toBps(exitPrice / entryPrice - 1);
    const shortGrossBps = toBps((entryPrice - exitPrice) / entryPrice);
    outcomes.push({
      horizonBars,
      exitCandleTime: Number(exit.t || 0),
      entryPrice,
      exitPrice,
      long: {
        grossReturnBps: round(longGrossBps),
        netReturnBps: round(longGrossBps - costBps),
      },
      short: {
        grossReturnBps: round(shortGrossBps),
        netReturnBps: round(shortGrossBps - costBps),
      },
      noEntry: {
        grossReturnBps: 0,
        netReturnBps: 0,
      },
      ...pathStats(series, entryIndex, horizonBars, entryPrice),
    });
  }

  return {
    version: COUNTERFACTUAL_VERSION,
    independentSamples: false,
    clusterRule: 'All outcomes belong to the same DecisionEvent and must not be treated as IID samples.',
    labelUsesFutureBars: true,
    usedByDecisionEngine: false,
    costModel: 'deterministic-estimated-round-trip-bps',
    estimatedRoundTripCostBps: round(costBps),
    requestedHorizons: [...horizons],
    completedHorizons: outcomes.map(outcome => outcome.horizonBars),
    status: outcomes.length === horizons.length ? 'complete' : outcomes.length ? 'partial' : 'pending',
    outcomes,
  };
}
