let latestKnowledgeEvaluation = null;

export function setLatestKnowledgeEvaluation(value) {
  latestKnowledgeEvaluation = value ? JSON.parse(JSON.stringify(value)) : null;
}

export function getLatestKnowledgeEvaluation() {
  return latestKnowledgeEvaluation ? JSON.parse(JSON.stringify(latestKnowledgeEvaluation)) : null;
}
