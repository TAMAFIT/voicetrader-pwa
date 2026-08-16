let latestPlaybookEvaluation = null;

export function setLatestPlaybookEvaluation(value) {
  latestPlaybookEvaluation = value ? JSON.parse(JSON.stringify(value)) : null;
}

export function getLatestPlaybookEvaluation() {
  return latestPlaybookEvaluation ? JSON.parse(JSON.stringify(latestPlaybookEvaluation)) : null;
}
