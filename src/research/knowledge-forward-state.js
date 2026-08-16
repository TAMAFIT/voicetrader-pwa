let latestKnowledgeForwardEvaluation = null;

export function setLatestKnowledgeForwardEvaluation(value) {
  latestKnowledgeForwardEvaluation = value ? JSON.parse(JSON.stringify(value)) : null;
}

export function getLatestKnowledgeForwardEvaluation() {
  return latestKnowledgeForwardEvaluation ? JSON.parse(JSON.stringify(latestKnowledgeForwardEvaluation)) : null;
}
