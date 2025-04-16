export class RateLimiter {
    private apiKeys: string[];
    private currentIndex = 0;

    constructor(apiKeys: string[]) {
      this.apiKeys = apiKeys;
    }

    public getNextKey(): string {
      const key = this.apiKeys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
      return key;
    }

    public async withRetry<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
      for (let i = 0; i < this.apiKeys.length; i++) {
        const key = this.getNextKey();
        try {
          return await fn(key);
        } catch (err: any) {
          if (err.response?.status === 429) {
            continue;
          }
          throw err;
        }
      }
      throw new Error("All API keys hit rate limit.");
    }
  }
