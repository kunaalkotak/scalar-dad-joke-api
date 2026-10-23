'use strict';

/**
 * A "sliding window" limiter: at most `max` upstream requests are allowed in
 * any `windowMs` period. We remember the time of each recent request and
 * forget the ones that are older than the window.
 *
 * This protects the public Dad Joke API. Even if someone clicks "Send" in
 * Scalar very quickly with different search terms, the proxy will refuse to
 * pass more than `max` requests per window to the real API.
 */
class RateLimiter {
  constructor({ max = 30, windowMs = 60_000, now = Date.now } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.timestamps = [];
  }

  /**
   * Try to use one request from the budget.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  tryAcquire() {
    const current = this.now();
    this.timestamps = this.timestamps.filter((t) => current - t < this.windowMs);

    if (this.timestamps.length >= this.max) {
      const retryAfterMs = this.windowMs - (current - this.timestamps[0]);
      return { allowed: false, retryAfterMs };
    }

    this.timestamps.push(current);
    return { allowed: true };
  }
}

module.exports = { RateLimiter };
