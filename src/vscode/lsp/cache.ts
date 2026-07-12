/**
 * LSP Integration - Cache
 *
 * In-memory cache with TTL for LSP query results.
 * Key design: (uri, offset, tool) to avoid duplicate queries.
 */

import { CacheEntry, CacheKey, LspTool } from './types';

/** Default TTL: 5 minutes */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Maximum cache size */
const MAX_CACHE_SIZE = 1000;

export class LspCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from components.
   * @param uri Document URI
   * @param line Line number (0-based)
   * @param character Column number (0-based)
   * @param tool Tool name
   */
  static generateKey(uri: string, line: number, character: number, tool: LspTool): string {
    return `${tool}:${uri}:${line}:${character}`;
  }

  /**
   * Get a cached value.
   * @returns The cached value if found and not expired, undefined otherwise
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value as T;
  }

  /**
   * Set a value in the cache.
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttlMs: ttlMs ?? this.ttlMs,
    });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete all entries matching a URI prefix.
   * Useful when a file is modified.
   */
  deleteByUri(uri: string): number {
    let count = 0;
    const prefix = `:${uri}:`;

    for (const key of this.cache.keys()) {
      if (key.includes(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    size: number;
    hitRate: number;
    oldestEntryAge: number;
  } {
    let oldestTimestamp = Date.now();
    let totalAge = 0;

    for (const entry of this.cache.values()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      totalAge += Date.now() - entry.timestamp;
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      hitRate,
      oldestEntryAge: this.cache.size > 0 ? Date.now() - oldestTimestamp : 0,
    };
  }

  /**
   * Evict oldest entries when cache is full.
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    if (entries.length === 0) return;

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 10%
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttlMs) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }
}

/** Singleton cache instance */
let cacheInstance: LspCache | null = null;

/**
 * Get or create the cache instance.
 */
export function getLspCache(): LspCache {
  if (!cacheInstance) {
    cacheInstance = new LspCache();
  }
  return cacheInstance;
}

/**
 * Reset the cache instance (for testing).
 */
export function resetLspCache(): void {
  cacheInstance?.clear();
  cacheInstance = null;
}
