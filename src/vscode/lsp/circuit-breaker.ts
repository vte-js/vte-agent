/**
 * LSP Integration - Circuit Breaker
 *
 * Implements circuit breaker pattern to prevent cascading failures
 * when LSP servers are unresponsive or failing.
 */

import { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStatus } from './types';

/** Default circuit breaker configuration */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  halfOpenMaxAttempts: 3,
};

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private nextResetTime: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection.
   * @throws Error if circuit is open or function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      // Check if reset timeout has passed
      if (this.nextResetTime && Date.now() >= this.nextResetTime) {
        this.state = 'half-open';
        this.successCount = 0;
        console.log('[VTE-LSP] Circuit breaker: transitioning to half-open');
      } else {
        throw new Error(
          `Circuit breaker is open. Retry after ${this.getRemainingResetTime()}ms`
        );
      }
    }

    // Check if half-open and max attempts reached
    if (this.state === 'half-open' && this.successCount >= this.config.halfOpenMaxAttempts) {
      this.trip();
      throw new Error('Circuit breaker: half-open max attempts reached');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call.
   */
  onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxAttempts) {
        this.reset();
        console.log('[VTE-LSP] Circuit breaker: reset to closed');
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed call.
   */
  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Trip the circuit breaker.
   */
  private trip(): void {
    this.state = 'open';
    this.nextResetTime = Date.now() + this.config.resetTimeoutMs;
    console.log(
      `[VTE-LSP] Circuit breaker: tripped (failures: ${this.failureCount}, reset in ${this.config.resetTimeoutMs}ms)`
    );
  }

  /**
   * Reset the circuit breaker.
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextResetTime = null;
  }

  /**
   * Get current status.
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ?? undefined,
      nextResetTime: this.nextResetTime ?? undefined,
    };
  }

  /**
   * Get remaining time until reset.
   */
  getRemainingResetTime(): number {
    if (!this.nextResetTime) return 0;
    return Math.max(0, this.nextResetTime - Date.now());
  }

  /**
   * Check if the circuit is currently allowing calls.
   */
  isAllowed(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') return true;
    if (this.state === 'open') {
      return this.nextResetTime !== null && Date.now() >= this.nextResetTime;
    }
    return false;
  }
}

/**
 * Per-language circuit breakers.
 * Each language gets its own circuit breaker instance.
 */
export class LanguageCircuitBreakers {
  private breakers = new Map<string, CircuitBreaker>();
  private config: Partial<CircuitBreakerConfig>;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = config ?? {};
  }

  /**
   * Get or create circuit breaker for a language.
   */
  getBreaker(languageId: string): CircuitBreaker {
    let breaker = this.breakers.get(languageId);
    if (!breaker) {
      breaker = new CircuitBreaker(this.config);
      this.breakers.set(languageId, breaker);
    }
    return breaker;
  }

  /**
   * Get status for all circuit breakers.
   */
  getAllStatus(): Map<string, CircuitBreakerStatus> {
    const status = new Map<string, CircuitBreakerStatus>();
    for (const [langId, breaker] of this.breakers) {
      status.set(langId, breaker.getStatus());
    }
    return status;
  }

  /**
   * Reset all circuit breakers.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset circuit breaker for a specific language.
   */
  resetLanguage(languageId: string): void {
    this.breakers.get(languageId)?.reset();
  }
}

/** Singleton instance */
let breakersInstance: LanguageCircuitBreakers | null = null;

/**
 * Get or create the circuit breakers instance.
 */
export function getLanguageCircuitBreakers(): LanguageCircuitBreakers {
  if (!breakersInstance) {
    breakersInstance = new LanguageCircuitBreakers();
  }
  return breakersInstance;
}

/**
 * Reset the circuit breakers instance (for testing).
 */
export function resetLanguageCircuitBreakers(): void {
  breakersInstance = null;
}
