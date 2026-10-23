'use strict';
// Tests the local proxy WITHOUT contacting the real Dad Joke API.
// `fetch` (the function that talks to the internet) is replaced by a stub that
// records every call, so we can count exactly how many upstream requests happen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app');

const RANDOM_BODY = { id: 'R7UfaahVfFd', joke: 'Stub joke', status: 200 };

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Starts a proxy on a random free port with a stubbed upstream. */
async function startProxy({ upstream, ...options } = {}) {
  const calls = [];
  const clock = { time: 1_000_000, now: () => clock.time };
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return upstream ? upstream(url, calls.length) : jsonResponse(200, RANDOM_BODY);
  };
  const server = createServer({ fetchImpl, now: clock.now, log: () => {}, userAgent: 'test-agent', ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, clock, server, close: () => new Promise((r) => server.close(r)) };
}

test('first request is a MISS, identical second request is a HIT with no new upstream call', async () => {
  const p = await startProxy();
  try {
    const first = await fetch(`${p.base}/api/`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-cache'), 'MISS');
    assert.deepEqual(await first.json(), RANDOM_BODY);

    const second = await fetch(`${p.base}/api/`);
    assert.equal(second.headers.get('x-cache'), 'HIT');
    assert.deepEqual(await second.json(), RANDOM_BODY);

    assert.equal(p.calls.length, 1, 'only ONE request may reach the public API');
  } finally {
    await p.close();
  }
});

test('proxy sends Accept: application/json and our User-Agent upstream', async () => {
  const p = await startProxy();
  try {
    await fetch(`${p.base}/api/`);
    assert.equal(p.calls[0].url, 'https://icanhazdadjoke.com/');
    assert.equal(p.calls[0].headers.Accept, 'application/json');
    assert.equal(p.calls[0].headers['User-Agent'], 'test-agent');
  } finally {
    await p.close();
  }
});

test('all three operations are forwarded to the matching upstream URL', async () => {
  const p = await startProxy();
  try {
    await fetch(`${p.base}/api`); // no trailing slash also means "random joke"
    await fetch(`${p.base}/api/j/R7UfaahVfFd`);
    await fetch(`${p.base}/api/search?term=hipster&page=2&limit=5`);
    assert.deepEqual(
      p.calls.map((c) => c.url),
      [
        'https://icanhazdadjoke.com/',
        'https://icanhazdadjoke.com/j/R7UfaahVfFd',
        'https://icanhazdadjoke.com/search?term=hipster&page=2&limit=5',
      ],
    );
  } finally {
    await p.close();
  }
});

test('different query parameters get different cache entries; same parameters in another order share one', async () => {
  const p = await startProxy();
  try {
    const a = await fetch(`${p.base}/api/search?term=cat`);
    const b = await fetch(`${p.base}/api/search?term=dog`);
    assert.equal(a.headers.get('x-cache'), 'MISS');
    assert.equal(b.headers.get('x-cache'), 'MISS', 'term=dog must not reuse the term=cat entry');
    assert.equal(p.calls.length, 2);

    await fetch(`${p.base}/api/search?term=cat&page=2`); // MISS (page differs)
    const reordered = await fetch(`${p.base}/api/search?page=2&term=cat`);
    assert.equal(reordered.headers.get('x-cache'), 'HIT');
    assert.equal(p.calls.length, 3);
  } finally {
    await p.close();
  }
});

test('expired entries are fetched again (random joke TTL = 10 s)', async () => {
  const p = await startProxy();
  try {
    await fetch(`${p.base}/api/`);
    p.clock.time += 9_999;
    assert.equal((await fetch(`${p.base}/api/`)).headers.get('x-cache'), 'HIT');
    p.clock.time += 2; // now 10 001 ms after the first request
    assert.equal((await fetch(`${p.base}/api/`)).headers.get('x-cache'), 'MISS');
    assert.equal(p.calls.length, 2);
  } finally {
    await p.close();
  }
});

test('random jokes expire sooner than joke-by-id and search results', async () => {
  const p = await startProxy();
  try {
    await fetch(`${p.base}/api/`);
    await fetch(`${p.base}/api/j/abc123`);
    await fetch(`${p.base}/api/search?term=x`);
    p.clock.time += 30_000; // 30 s later
    assert.equal((await fetch(`${p.base}/api/`)).headers.get('x-cache'), 'MISS');
    assert.equal((await fetch(`${p.base}/api/j/abc123`)).headers.get('x-cache'), 'HIT');
    assert.equal((await fetch(`${p.base}/api/search?term=x`)).headers.get('x-cache'), 'HIT');
    p.clock.time += 5 * 60_000; // search TTL (5 min) is over
    assert.equal((await fetch(`${p.base}/api/search?term=x`)).headers.get('x-cache'), 'MISS');
  } finally {
    await p.close();
  }
});

test('upstream errors (404) are forwarded with their status and are NOT cached', async () => {
  const p = await startProxy({
    upstream: () => jsonResponse(404, { status: 404, message: 'not found (stub)' }),
  });
  try {
    const first = await fetch(`${p.base}/api/j/doesnotexist`);
    assert.equal(first.status, 404);
    assert.deepEqual(await first.json(), { status: 404, message: 'not found (stub)' });
    const second = await fetch(`${p.base}/api/j/doesnotexist`);
    assert.equal(second.status, 404);
    assert.equal(second.headers.get('x-cache'), 'MISS');
    assert.equal(p.calls.length, 2, 'the error must be requested again, not served from cache');
  } finally {
    await p.close();
  }
});

test('network failure gives 502 and is not cached; timeout gives 504', async () => {
  let mode = 'fail';
  const p = await startProxy({
    upstream: () => {
      if (mode === 'fail') throw new TypeError('fetch failed');
      if (mode === 'timeout') {
        const e = new Error('timed out');
        e.name = 'TimeoutError';
        throw e;
      }
      return jsonResponse(200, RANDOM_BODY);
    },
  });
  try {
    assert.equal((await fetch(`${p.base}/api/`)).status, 502);
    mode = 'timeout';
    assert.equal((await fetch(`${p.base}/api/`)).status, 504);
    mode = 'ok';
    const ok = await fetch(`${p.base}/api/`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('x-cache'), 'MISS', 'earlier failures must not have been cached');
  } finally {
    await p.close();
  }
});

test('non-JSON 200 responses are forwarded but not cached', async () => {
  const p = await startProxy({
    upstream: () => new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  try {
    await fetch(`${p.base}/api/`);
    const second = await fetch(`${p.base}/api/`);
    assert.equal(second.headers.get('x-cache'), 'MISS');
    assert.equal(p.calls.length, 2);
  } finally {
    await p.close();
  }
});

test('cache size limit: oldest entry is evicted when maxEntries is exceeded', async () => {
  const { TtlCache } = require('../src/cache');
  const cache = new TtlCache({ maxEntries: 2, now: () => 1_000_000 });
  const p = await startProxy({ cache });
  try {
    await fetch(`${p.base}/api/j/aaa`);
    await fetch(`${p.base}/api/j/bbb`);
    await fetch(`${p.base}/api/j/ccc`); // evicts aaa
    assert.equal(cache.size, 2);
    assert.equal((await fetch(`${p.base}/api/j/aaa`)).headers.get('x-cache'), 'MISS');
  } finally {
    await p.close();
  }
});

test('local rate limit returns 429 with Retry-After and stops contacting the public API', async () => {
  const { RateLimiter } = require('../src/rateLimiter');
  const clock = { time: 1_000_000, now: () => clock.time };
  const limiter = new RateLimiter({ max: 2, windowMs: 60_000, now: clock.now });
  const p = await startProxy({ limiter });
  try {
    await fetch(`${p.base}/api/j/aaa`);
    await fetch(`${p.base}/api/j/bbb`);
    const blocked = await fetch(`${p.base}/api/j/ccc`);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
    assert.equal(p.calls.length, 2, 'third request must not reach the public API');

    // A cache HIT never uses up the budget.
    assert.equal((await fetch(`${p.base}/api/j/aaa`)).headers.get('x-cache'), 'HIT');
  } finally {
    await p.close();
  }
});

test('invalid input is rejected with 400 before any upstream call', async () => {
  const p = await startProxy();
  try {
    const urls = [
      '/api/j/bad%20id',
      '/api/j/..%2f..%2fetc%2fpasswd', // encoded, because fetch() would flatten a literal "/../"
      '/api/search?limit=abc',
      '/api/search?page=-1',
      `/api/search?term=${'x'.repeat(101)}`,
    ];
    for (const url of urls) {
      const res = await fetch(`${p.base}${url}`);
      assert.equal(res.status, 400, url);
    }
    assert.equal(p.calls.length, 0);
  } finally {
    await p.close();
  }
});

test('unknown API routes give 404 and non-GET methods give 405, with no upstream call', async () => {
  const p = await startProxy();
  try {
    assert.equal((await fetch(`${p.base}/api/slack`)).status, 404);
    assert.equal((await fetch(`${p.base}/api/graphql`)).status, 404);
    assert.equal((await fetch(`${p.base}/api/`, { method: 'POST' })).status, 405);
    assert.equal(p.calls.length, 0);
  } finally {
    await p.close();
  }
});

test('responses are marked no-store so the browser does not hide the server cache', async () => {
  const p = await startProxy();
  try {
    const res = await fetch(`${p.base}/api/`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  } finally {
    await p.close();
  }
});

test('static files: index.html and openapi.yaml are served, path traversal is refused', async () => {
  const p = await startProxy();
  try {
    const page = await fetch(`${p.base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /Scalar\.createApiReference/);

    const spec = await fetch(`${p.base}/openapi.yaml`);
    assert.equal(spec.status, 200);
    assert.match(await spec.text(), /^openapi: 3\.1\.0/m);

    // fetch() would normalise "/../", so use a raw socket-level request.
    const http = require('node:http');
    const status = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: new URL(p.base).port, path: '/..%2fserver.js' }, (r) => {
        r.resume();
        resolve(r.statusCode);
      });
    });
    assert.equal(status, 404);
    assert.equal((await fetch(`${p.base}/package.json`)).status, 404);
  } finally {
    await p.close();
  }
});
