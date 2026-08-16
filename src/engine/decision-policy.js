export const ENTRY_DECISION = Object.freeze({
  ENTER_LONG: 'ENTER_LONG',
  ENTER_SHORT: 'ENTER_SHORT',
  NO_ENTRY: 'NO_ENTRY',
});

export const POSITION_DECISION = Object.freeze({
  HOLD: 'HOLD',
  EXIT_SIGNAL: 'EXIT_SIGNAL',
});

export function decideEntry({ decisionScore, confidenceScore, direction }) {
  if (decisionScore > 42 && confidenceScore >= 61) {
    return direction === 'UP' ? ENTRY_DECISION.ENTER_LONG : ENTRY_DECISION.ENTER_SHORT;
  }
  return ENTRY_DECISION.NO_ENTRY;
}

export function entryDecisionToLegacyAction(entryDecision) {
  if (entryDecision === ENTRY_DECISION.ENTER_LONG) return 'BUY';
  if (entryDecision === ENTRY_DECISION.ENTER_SHORT) return 'SELL';
  return 'WAIT';
}

export function resolvePositionDecision({ entryDecision, positionSide }) {
  if (!positionSide) return entryDecision;
  const opposite =
    (positionSide === 'BUY' && entryDecision === ENTRY_DECISION.ENTER_SHORT) ||
    (positionSide === 'SELL' && entryDecision === ENTRY_DECISION.ENTER_LONG);
  return opposite ? POSITION_DECISION.EXIT_SIGNAL : POSITION_DECISION.HOLD;
}
