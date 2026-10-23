# Project Report — API Documentation with Scalar

**Group:** TODO (group) · **Course / Professor:** TODO (group) · **Date:** TODO (group)
**Members:** see README section 2 (fill in before submission).

## 1. Summary

We documented the public Dad Joke API (https://icanhazdadjoke.com/api) with an OpenAPI 3.1 file and displayed it with Scalar.
Because the assignment requires respectful use of a public API, we added a small Node.js proxy with a cache and a rate limit between
Scalar's built-in client and the real API. Every joke shown to the user comes from the real API; the proxy never invents data.

## 2. Research findings

### 2.1 The Dad Joke API (verified from the official page on 21 October 2026)

| Fact | Source |
| --- | --- |
| No authentication is needed | Official documentation |
| Format is selected by the `Accept` header: `text/html` (default), `application/json`, `text/plain`. `curl` without `Accept` gets plain text | Official documentation |
| Clients are asked to send a custom `User-Agent` naming the project and a contact | Official documentation |
| `GET /` random joke → `{id, joke, status}` | Official documentation |
| `GET /j/<joke_id>` one joke → `{id, joke, status}` | Official documentation |
| `GET /search` with optional `term`, `page` (default 1), `limit` (default 20, max 30) → `{current_page, limit, next_page, previous_page, results[], search_term, status, total_jokes, total_pages}` | Official documentation |
| Other endpoints exist (Slack message, PNG image, GraphQL) | Official documentation; **not** part of our assignment |

**Not stated in the documentation (so we did not invent it):** a numeric rate limit, the error body for an unknown joke ID, behaviour for
invalid `page`/`limit`, and CORS rules. In the official examples `previous_page` is 1 on the first page and `next_page` repeats the last page on the last page, so we documented both as integers.

### 2.2 Scalar (verified from Scalar's documentation)

* Scalar API Reference can be embedded with one CDN `<script>` and `Scalar.createApiReference(selector, config)`.
* The configuration object accepts, among others, `url` (location of the OpenAPI document), `theme`, `layout` (`modern` / `classic`), `hideDownloadButton`, `hiddenClients`, `defaultHttpClient`, and `proxyUrl`.
* The documentation's quick-start examples set `proxyUrl: 'https://proxy.scalar.com'` to avoid CORS problems with remote APIs. We deliberately omit it (section 3.2).
* We checked that the npm package `@scalar/api-reference@1.72.4` ships a browser bundle that defines the global `Scalar.createApiReference`.
  We pinned this version, which was already about three weeks old on the build date, instead of the newest release.

### 2.3 OpenAPI

OpenAPI is a language-independent standard for describing HTTP APIs. A document has `openapi`, `info`, `servers`, `paths`, `components`, `tags`
and more. Version 3.1 aligns schemas with JSON Schema, which is why we can validate our examples against our schemas with a standard JSON Schema validator.

## 3. Design

### 3.1 Architecture

```text
Browser (Scalar page + built-in client)
   │  GET /openapi.yaml                       ┌──────────────────────────────┐
   ├──────────────────────────────────────────► Node.js server (server.js)   │
   │  GET /api/search?term=cat                │  src/app.js  → routing/checks│
   ├──────────────────────────────────────────►  src/cache.js → TTL + max size│
   │                                          │  src/rateLimiter.js → 30/min │
   │◄───────── JSON + X-Cache header ─────────┤                              │
                                              └───────────────┬──────────────┘
                                                              │ MISS only: GET + Accept: application/json
                                                              ▼
                                                  icanhazdadjoke.com (external)
```

The Mermaid version of this diagram is in README section 4.

### 3.2 Why a local proxy? (decision record)

We needed to (a) cache responses, (b) limit upstream requests and (c) guarantee that the JSON `Accept` header is sent. A browser-only design cannot do (b) reliably
and cannot cache across tools. The official docs do not say whether the API allows direct browser calls (CORS), and the build environment could not test it, so we did not rely on it.
A same-origin proxy sidesteps the question: the page and `/api` are served by the same server, so the browser makes no cross-origin request.
Scalar's hosted proxy was *not* used because it cannot reach a `localhost` address and would send traffic through a third party.

The official API remains listed as a second server in the YAML; selecting it requires adding the `Accept` header manually. The proxy is the default so the demo works.

### 3.3 Cache design

| Decision | Choice | Reason |
| --- | --- | --- |
| What to cache | HTTP 200 with a JSON content type only | Errors must not be remembered as if they were answers |
| TTL | random 10 s · by ID 1 h · search 5 min | Random jokes should still change; a joke with a given ID never changes; search results change rarely |
| Key | upstream path + normalised query (`term`, `page`, `limit` in fixed order) | Different inputs must not collide; the same inputs in a different order should share an entry |
| Size limit | 100 entries, least-recently-used eviction | Memory cannot grow without bound |
| Observability | `X-Cache: HIT/MISS` header and a log line | Easy to demonstrate and test |
| Browser caching | `Cache-Control: no-store` | Otherwise the browser might hide the server's cache behaviour |

### 3.4 Safety design

* Allow-list routing: only the three documented operations are forwarded.
* Strict validation of `joke_id`, `term`, `page`, `limit` before anything leaves our server.
* A sliding-window limit of 30 upstream requests per minute; cache hits are free.
* 8-second timeout; 502/504 for failures; failures are never cached.
* Server listens on `127.0.0.1` only.
* No secrets exist; `.gitignore` excludes `.env`, keys and `node_modules`.

## 4. Implementation overview

| File | Responsibility |
| --- | --- |
| `public/openapi.yaml` | Specification: 3 operations, reusable parameters/headers/responses/schemas, examples copied from the official documentation |
| `public/index.html` | Loads Scalar 1.72.4 from jsDelivr, configures `url`, `theme`, `layout`, `defaultHttpClient`; shows an error message if the CDN is unreachable |
| `src/app.js` | `createApp()`: static files, `resolveRoute()` validation, cache lookup → limiter → upstream `fetch` → conditional caching |
| `src/cache.js` | `TtlCache` (Map-based, expiry, LRU eviction) |
| `src/rateLimiter.js` | `RateLimiter` (sliding window) |
| `server.js` | Reads `PORT`, `HOST`, `USER_AGENT`; starts the server |
| `tests/*.test.js`, `scripts/validate-spec.js` | Automated checks |

The network, the clock and the log are injected into `createApp()`. This is why the tests can simulate 10 seconds passing and a failing internet connection without waiting or touching the public API.

## 5. Testing

Full list: README section 10. Summary of what was actually executed on 21 October 2026 in the build environment (Node v22.22.2):

* **27 automated tests: 27 passed.** (cache, rate limiter, proxy behaviour, OpenAPI validity and consistency)
* `npm run validate`: the specification is valid OpenAPI 3.1.0.
* Manual `curl` checks against the local server: static files, input validation (400), unreachable-upstream handling (502).
* One automated test initially failed because of a mistake in the test (a literal `/../` is flattened by `fetch` before it is sent); we fixed the test to use the percent-encoded form, and the server code did not need to change.

**Not executed (environment limits):** any request to the real Dad Joke API, loading Scalar from the CDN, browser rendering, the built-in client, live cache demonstration, screenshots.
These must be done by the group before submission (README sections 8 and 10).

## 6. Challenges and lessons

* Understanding why the cache key must be built from validated, normalised parameters, not the raw URL.
* Keeping documentation and code consistent: our tests compare the YAML's paths, parameters and TTLs with the code.
* Being honest about unknowns: the official docs do not describe everything, so the spec states what is verified.

## 7. Limitations and future work

See README section 12.

## 8. References

See README section 13.
