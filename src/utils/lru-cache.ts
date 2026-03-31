/**
 * Least Recently Used (LRU) cache with a fixed maximum size.
 *
 * When the cache reaches capacity, the least recently accessed entry is
 * evicted on the next `set` call.  All operations are O(1).
 */
export class LRUCache<T> {
  private readonly maxSize: number;
  private readonly cache = new Map<string, T>();

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[string, T]> {
    return this.cache.entries();
  }
}
