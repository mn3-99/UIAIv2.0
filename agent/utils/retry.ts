// agent/utils/retry.ts
// Retry avec backoff exponentiel (doc 03).
// 1s -> 2s -> 4s -> 8s ; erreurs retryable : 429, 500, 502, 503 + reseau.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Categorisation des erreurs (doc 03). */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === null) return true; // erreur reseau
    return [429, 500, 502, 503].includes(error.status);
  }
  // Erreurs fetch (DNS, socket, abort) : retryable sauf abort explicite
  if (error instanceof Error && error.name === 'AbortError') return false;
  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry avec backoff exponentiel (doc 03 etape 4). */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt === maxRetries - 1) throw error;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  throw new Error('Unreachable');
}
