/**
 * LSP Integration - Guardrails
 *
 * Safety checks before executing LSP operations:
 * - File size limits
 * - Circuit breaker integration
 * - Rate limiting
 */

import * as vscode from 'vscode';
import { GuardrailResult, FileSizeLimits } from './types';
import { LanguageCircuitBreakers, getLanguageCircuitBreakers } from './circuit-breaker';

/** Default file size limits */
const DEFAULT_FILE_SIZE_LIMITS: FileSizeLimits = {
  maxLines: 3000,
  warningThreshold: 2500,
};

/** Rate limiting: max requests per second */
const DEFAULT_RATE_LIMIT = 10;

export class Guardrails {
  private fileSizeLimits: FileSizeLimits;
  private circuitBreakers: LanguageCircuitBreakers;
  private requestTimestamps: number[] = [];
  private rateLimit: number;

  constructor(options?: {
    fileSizeLimits?: FileSizeLimits;
    circuitBreakers?: LanguageCircuitBreakers;
    rateLimit?: number;
  }) {
    this.fileSizeLimits = options?.fileSizeLimits ?? DEFAULT_FILE_SIZE_LIMITS;
    this.circuitBreakers = options?.circuitBreakers ?? getLanguageCircuitBreakers();
    this.rateLimit = options?.rateLimit ?? DEFAULT_RATE_LIMIT;
  }

  /**
   * Check if a file is safe to process.
   * @param document The text document to check
   * @param languageId The language ID for circuit breaker lookup
   * @returns GuardrailResult indicating if the operation is allowed
   */
  async checkFileSafety(
    document: vscode.TextDocument,
    languageId: string
  ): Promise<GuardrailResult> {
    // 1. Check file size
    const sizeCheck = this.checkFileSize(document);
    if (!sizeCheck.allowed) {
      return sizeCheck;
    }

    // 2. Check circuit breaker
    const circuitCheck = this.checkCircuitBreaker(languageId);
    if (!circuitCheck.allowed) {
      return circuitCheck;
    }

    // 3. Check rate limit
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      return rateCheck;
    }

    return { allowed: true };
  }

  /**
   * Check if a file exceeds size limits.
   */
  checkFileSize(document: vscode.TextDocument): GuardrailResult {
    const lineCount = document.lineCount;

    if (lineCount > this.fileSizeLimits.maxLines) {
      return {
        allowed: false,
        reason: `File too large: ${lineCount} lines (max: ${this.fileSizeLimits.maxLines})`,
      };
    }

    if (lineCount > this.fileSizeLimits.warningThreshold) {
      console.warn(
        `[VTE-LSP] Large file warning: ${lineCount} lines (threshold: ${this.fileSizeLimits.warningThreshold})`
      );
    }

    return { allowed: true };
  }

  /**
   * Check circuit breaker for a language.
   */
  checkCircuitBreaker(languageId: string): GuardrailResult {
    const breaker = this.circuitBreakers.getBreaker(languageId);

    if (!breaker.isAllowed()) {
      const status = breaker.getStatus();
      return {
        allowed: false,
        reason: `Circuit breaker is ${status.state} for language: ${languageId}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check rate limiting.
   */
  checkRateLimit(): GuardrailResult {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Remove timestamps older than 1 second
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > oneSecondAgo);

    if (this.requestTimestamps.length >= this.rateLimit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.requestTimestamps.length} requests in last second (max: ${this.rateLimit})`,
      };
    }

    // Record this request
    this.requestTimestamps.push(now);

    return { allowed: true };
  }

  /**
   * Record a successful operation (for circuit breaker).
   */
  recordSuccess(languageId: string): void {
    this.circuitBreakers.getBreaker(languageId).onSuccess();
  }

  /**
   * Record a failed operation (for circuit breaker).
   */
  recordFailure(languageId: string): void {
    this.circuitBreakers.getBreaker(languageId).onFailure();
  }

  /**
   * Get current status.
   */
  getStatus(): {
    rateLimitRemaining: number;
    circuitBreakers: Map<string, { state: string; failureCount: number }>;
  } {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const recentRequests = this.requestTimestamps.filter((t) => t > oneSecondAgo).length;

    const circuitBreakers = new Map<string, { state: string; failureCount: number }>();
    for (const [langId, status] of this.circuitBreakers.getAllStatus()) {
      circuitBreakers.set(langId, {
        state: status.state,
        failureCount: status.failureCount,
      });
    }

    return {
      rateLimitRemaining: this.rateLimit - recentRequests,
      circuitBreakers,
    };
  }

  /**
   * Reset all guards.
   */
  reset(): void {
    this.requestTimestamps = [];
    this.circuitBreakers.resetAll();
  }
}

/** Singleton instance */
let guardrailsInstance: Guardrails | null = null;

/**
 * Get or create the guardrails instance.
 */
export function getGuardrails(): Guardrails {
  if (!guardrailsInstance) {
    guardrailsInstance = new Guardrails();
  }
  return guardrailsInstance;
}

/**
 * Reset the guardrails instance (for testing).
 */
export function resetGuardrails(): void {
  guardrailsInstance?.reset();
  guardrailsInstance = null;
}
