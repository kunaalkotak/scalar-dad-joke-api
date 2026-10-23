'use strict';

/**
 * A tiny in-memory cache with two rules:
 *   1. Every entry expires after its own time-to-live (TTL).
 *   2. The cache never holds more than `maxEntries` items. When it is full,
 *      the entry that was used LEAST recently is thrown away (LRU eviction).
 *
 * It relies on the fact that a JavaScript Map remembers insertion order,
 * so the first key in the Map is always the least recently used one.
 *
 * `now` is a function that returns the current time in milliseconds. We pass
 * it in so the automated tests can move the clock forward without waiting.
 */
class TtlCache {
  constructor({ maxEntries = 100, now = Date.now } = {}) {
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map(); // key -> { value, expiresAt }
  }

  get size() {
    return this.entries.size;
  }

  /** Returns the cached value, or undefined if missing or expired. */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key); // expired: remove it and report a miss
      return undefined;
    }

    // Move the key to the end of the Map = "most recently used".
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Stores a value for `ttlMs` milliseconds, evicting the oldest if full. */
  set(key, value, ttlMs) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
    }
  }
}

module.exports = { TtlCache };
