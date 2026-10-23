'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TtlCache } = require('../src/cache');
const { RateLimiter } = require('../src/rateLimiter');

function fakeClock(start = 1000) {
  const clock = { time: start, now: () => clock.time, advance: (ms) => (clock.time += ms) };
  return clock;
}

test('cache returns a stored value before it expires', () => {
  const clock = fakeClock();
  const cache = new TtlCache({ maxEntries: 5, now: clock.now });
  cache.set('a', 'value-a', 1000);
  clock.advance(999);
  assert.equal(cache.get('a'), 'value-a');
});

test('cache forgets a value once its TTL has passed', () => {
  const clock = fakeClock();
  const cache = new TtlCache({ maxEntries: 5, now: clock.now });
  cache.set('a', 'value-a', 1000);
  clock.advance(1000);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.size, 0, 'expired entry should be removed');
});

test('cache never grows beyond maxEntries and evicts the least recently used key', () => {
  const clock = fakeClock();
  const cache = new TtlCache({ maxEntries: 2, now: clock.now });
  cache.set('a', 1, 10_000);
  cache.set('b', 2, 10_000);
  cache.get('a'); // "a" is now more recently used than "b"
  cache.set('c', 3, 10_000); // cache is full -> "b" must be evicted
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('rate limiter allows `max` requests per window, then blocks, then recovers', () => {
  const clock = fakeClock();
  const limiter = new RateLimiter({ max: 3, windowMs: 60_000, now: clock.now });
  assert.equal(limiter.tryAcquire().allowed, true);
  assert.equal(limiter.tryAcquire().allowed, true);
  assert.equal(limiter.tryAcquire().allowed, true);

  const blocked = limiter.tryAcquire();
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);

  clock.advance(60_001);
  assert.equal(limiter.tryAcquire().allowed, true);
});
