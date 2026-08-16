/**
 * AI Provider境界。
 * 現在は有料APIなしの RuleBasedAIProvider のみ。
 * 将来 LocalAIProvider / OpenAIProvider を同じ契約で差し込める。
 */
export class AIProvider {
  constructor(name = 'AI Provider') { this.name = name; }
  async review(_context) { throw new Error('AIProvider.review must be implemented'); }
}

export class RuleBasedAIProvider extends AIProvider {
  constructor() { super('Shadow Engine（無料ルール型）'); }
  async review(context) {
    const { analysis } = context;
    return {
      provider: 'rule-based',
      action: analysis.action,
      confidence: analysis.conf,
      explanation: analysis.comment,
      reviewedAt: Date.now(),
    };
  }
}

// 将来このクラスだけ実装すれば、Shadow EngineやUIを書き直さずLocal AIを統合できる。
export class LocalAIProvider extends AIProvider {
  constructor({ endpoint = 'http://127.0.0.1:11434' } = {}) {
    super('Local AI（将来）');
    this.endpoint = endpoint;
  }
  async review() {
    throw new Error('LocalAIProvider is reserved for the future local VoiceDev server.');
  }
}

export function createAIProvider(type = 'rule-based', options = {}) {
  if (type === 'local') return new LocalAIProvider(options);
  return new RuleBasedAIProvider();
}
