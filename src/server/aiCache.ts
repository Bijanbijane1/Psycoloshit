interface CacheEntry {
  response: string;
  timestamp: number;
  hitCount: number;
  source: 'gemini' | 'offline-knowledge';
}

class AICacheManager {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private totalHits = 0;
  private totalMisses = 0;

  constructor(ttlHours = 24) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.setupCleanup();
  }

  // Normalize Persian/Arabic characters and whitespace for high cache hit rate
  public normalizeKey(question: string, context: string = ''): string {
    const cleanQ = (question || '')
      .trim()
      .toLowerCase()
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[؟?!\.,،؛;\-_]/g, '')
      .replace(/\s+/g, ' ');

    const cleanC = (context || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return `${cleanC}:::${cleanQ}`;
  }

  public get(question: string, context = ''): { response: string; hitCount: number } | null {
    const key = this.normalizeKey(question, context);
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.totalMisses++;
      return null;
    }

    entry.hitCount++;
    this.totalHits++;
    return { response: entry.response, hitCount: entry.hitCount };
  }

  public set(question: string, response: string, context = '', source: 'gemini' | 'offline-knowledge' = 'gemini'): void {
    if (!question || !response) return;
    const key = this.normalizeKey(question, context);
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hitCount: 1,
      source,
    });
  }

  public getStats() {
    return {
      cachedEntriesCount: this.cache.size,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRatio:
        this.totalHits + this.totalMisses > 0
          ? Math.round((this.totalHits / (this.totalHits + this.totalMisses)) * 100)
          : 0,
    };
  }

  private setupCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.ttlMs) {
          this.cache.delete(key);
        }
      }
    }, 600000); // Check every 10 minutes
  }
}

export const aiCache = new AICacheManager();
