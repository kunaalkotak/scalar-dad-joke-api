'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TtlCache } = require('./cache');
const { RateLimiter } = require('./rateLimiter');

/** Our proxy lives under this prefix. The OpenAPI "servers" URL ends with it. */
const API_PREFIX = '/api';

/** The real, external API we forward to. */
const UPSTREAM_BASE = 'https://icanhazdadjoke.com';

/** The documented operations. tests/openapi.test.js checks this against openapi.yaml. */
const ROUTES = ['/', '/j/{joke_id}', '/search'];

const DEFAULTS = {
  // How long a successful response may be reused (milliseconds).
  ttlMs: {
    random: 10_000, //        random joke: short, so it still feels random
    joke: 60 * 60_000, //     one joke by id: a joke never changes, 1 hour
    search: 5 * 60_000, //    search results: 5 minutes
  },
  maxCacheEntries: 100,
  // Maximum number of requests we are willing to send to the real API.
  upstreamLimit: { max: 30, windowMs: 60_000 },
  upstreamTimeoutMs: 8_000,
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload, extraHeaders = {}) {
  sendRaw(res, status, JSON.stringify(payload), 'application/json; charset=utf-8', extraHeaders);
}

function sendRaw(res, status, body, contentType, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    // Stops the BROWSER from keeping its own copy, so every request reaches
    // our server and the X-Cache header honestly shows what OUR cache did.
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * Decide what a request to /api/... means.
 * Returns:
 *   null                       -> not one of our routes (404)
 *   { error: {status,message} } -> the request was invalid (400)
 *   { upstreamPath, query, ttlMs } -> forward this to the real API
 *
 * We only forward values we have checked. That keeps the proxy from being
 * used to reach anything except the three documented operations.
 */
function resolveRoute(subPath, params, ttl) {
  // 1) GET /  -> random joke
  if (subPath === '' || subPath === '/') {
    return { upstreamPath: '/', query: '', ttlMs: ttl.random };
  }

  // 2) GET /j/{joke_id}  -> one joke
  if (subPath.startsWith('/j/')) {
    const match = /^\/j\/([A-Za-z0-9]{1,40})$/.exec(subPath);
    if (!match) {
      return { error: { status: 400, message: 'joke_id must be 1-40 letters or digits.' } };
    }
    return { upstreamPath: `/j/${match[1]}`, query: '', ttlMs: ttl.joke };
  }

  // 3) GET /search?term=&page=&limit=
  if (subPath === '/search') {
    const query = new URLSearchParams();

    const term = params.get('term');
    if (term !== null) {
      if (term.length > 100) {
        return { error: { status: 400, message: 'term must be at most 100 characters.' } };
      }
      query.set('term', term);
    }

    for (const name of ['page', 'limit']) {
      const value = params.get(name);
      if (value === null) continue;
      if (!/^\d{1,6}$/.test(value)) {
        return { error: { status: 400, message: `${name} must be a whole number.` } };
      }
      query.set(name, value);
    }

    // Parameters are always added in the same order (term, page, limit), so
    // "?page=2&term=cat" and "?term=cat&page=2" produce the SAME cache key.
    return { upstreamPath: '/search', query: query.toString(), ttlMs: ttl.search };
  }

  return null;
}

/**
 * Builds the request handler. Everything that touches the outside world
 * (the network, the clock, the log) can be replaced, which is what lets the
 * automated tests run without contacting the real Dad Joke API.
 */
function createApp(options = {}) {
  const {
    fetchImpl = fetch,
    now = Date.now,
    upstreamBase = UPSTREAM_BASE,
    userAgent = 'scalar-dad-joke-api (college project)',
    publicDir = path.join(__dirname, '..', 'public'),
    log = console.log,
  } = options;

  const ttl = { ...DEFAULTS.ttlMs, ...(options.ttlMs || {}) };
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? DEFAULTS.upstreamTimeoutMs;
  const cache = options.cache || new TtlCache({ maxEntries: DEFAULTS.maxCacheEntries, now });
  const limiter =
    options.limiter || new RateLimiter({ ...DEFAULTS.upstreamLimit, now });

  async function handleApi(req, res, subPath, searchParams) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { status: 405, message: 'Only GET is supported.' }, { Allow: 'GET' });
    }

    const route = resolveRoute(subPath, searchParams, ttl);
    if (route === null) {
      return sendJson(res, 404, { status: 404, message: 'Unknown route.' });
    }
    if (route.error) {
      return sendJson(res, route.error.status, route.error);
    }

    const cacheKey = `${route.upstreamPath}?${route.query}`;
    const label = `GET ${API_PREFIX}${subPath === '' ? '/' : subPath}${route.query ? '?' + route.query : ''}`;

    // --- 1. Cache lookup -------------------------------------------------
    const cached = cache.get(cacheKey);
    if (cached) {
      log(`[proxy] ${label} -> cache HIT`);
      return sendRaw(res, cached.status, cached.body, cached.contentType, { 'X-Cache': 'HIT' });
    }

    // --- 2. Protect the public API --------------------------------------
    const permit = limiter.tryAcquire();
    if (!permit.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(permit.retryAfterMs / 1000));
      log(`[proxy] ${label} -> blocked by local rate limit`);
      return sendJson(
        res,
        429,
        {
          status: 429,
          message: `Local proxy limit reached to protect the public API. Try again in ${retryAfterSeconds} s.`,
        },
        { 'Retry-After': String(retryAfterSeconds) },
      );
    }

    // --- 3. Forward the request to the real API -------------------------
    const upstreamUrl = `${upstreamBase}${route.upstreamPath}${route.query ? '?' + route.query : ''}`;
    let upstream;
    let body;
    try {
      upstream = await fetchImpl(upstreamUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json', // without this the API answers with HTML/plain text
          'User-Agent': userAgent, // the API asks every client to identify itself
        },
        signal: AbortSignal.timeout(upstreamTimeoutMs),
      });
      body = await upstream.text();
    } catch (error) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      log(`[proxy] ${label} -> upstream ${timedOut ? 'timeout' : 'failure'}`);
      return sendJson(res, timedOut ? 504 : 502, {
        status: timedOut ? 504 : 502,
        message: timedOut
          ? 'The Dad Joke API did not answer in time.'
          : 'Could not reach the Dad Joke API.',
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const headers = { 'X-Cache': 'MISS' };
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) headers['Retry-After'] = retryAfter;

    // --- 4. Cache ONLY successful JSON responses ------------------------
    if (upstream.status === 200 && contentType.includes('json')) {
      cache.set(cacheKey, { status: 200, body, contentType }, route.ttlMs);
    }

    log(`[proxy] ${label} -> cache MISS, upstream answered ${upstream.status}`);
    return sendRaw(res, upstream.status, body, contentType, headers);
  }

  async function handleStatic(req, res, pathname) {
    if (req.method !== 'GET') {
      return sendRaw(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8', { Allow: 'GET' });
    }

    let relative;
    try {
      relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).slice(1);
    } catch {
      return sendRaw(res, 400, 'Bad Request', 'text/plain; charset=utf-8');
    }

    // Refuse paths like /../server.js that try to escape the public folder.
    const root = path.resolve(publicDir);
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep)) {
      return sendRaw(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    }

    try {
      const data = await fs.readFile(filePath);
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return sendRaw(res, 200, data, type);
    } catch {
      return sendRaw(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    }
  }

  async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === API_PREFIX || url.pathname.startsWith(API_PREFIX + '/')) {
        const subPath = url.pathname.slice(API_PREFIX.length);
        return await handleApi(req, res, subPath, url.searchParams);
      }
      return await handleStatic(req, res, url.pathname);
    } catch (error) {
      log(`[proxy] unexpected error: ${error.message}`);
      if (!res.headersSent) sendJson(res, 500, { status: 500, message: 'Internal server error.' });
      else res.end();
    }
  }

  return { handler, cache, limiter };
}

/** Convenience wrapper that returns a ready-to-listen http.Server. */
function createServer(options = {}) {
  const app = createApp(options);
  const server = http.createServer(app.handler);
  server.app = app;
  return server;
}

module.exports = { createApp, createServer, resolveRoute, API_PREFIX, UPSTREAM_BASE, ROUTES, DEFAULTS };
