# Viva practice questions (every member should be able to answer every question)

Answers are short on purpose. If you cannot explain one in your own words, open the file named in brackets and read the code.

## A. OpenAPI
**1. What is OpenAPI?** A standard format (YAML or JSON) for describing an HTTP API: its servers, paths, parameters, responses and data shapes, so humans and programs can read it. [`public/openapi.yaml`]

**2. Name the main top-level fields of our file.** `openapi`, `info`, `externalDocs`, `servers`, `tags`, `paths`, `components`.

**3. What does `$ref` do and why use it?** It points to a reusable definition, e.g. `#/components/schemas/Joke`. We write a schema or parameter once and reuse it, so a change happens in one place.

**4. What is the difference between `parameters` and `schemas`?** A parameter is an input (path or query value) with a name and location. A schema describes the *shape/type* of data; parameters and response bodies both use schemas.

**5. Which parameters does `/search` have? Which are required?** `term`, `page`, `limit`. None is required. Defaults: page 1, limit 20, max 30.

**6. What is `operationId`?** A unique name for an operation (`getRandomJoke`, `getJokeById`, `searchJokes`) used by tools, e.g. for code generation.

**7. Why OpenAPI 3.1 and how would a nullable field be written?** 3.1 is current and uses full JSON Schema, which let us validate examples with a standard validator. Nullable: `type: [string, 'null']` (3.0 used `nullable: true`). None of the fields in the official examples is null, so we marked none.

**8. How did you validate the spec?** `npm run validate` (swagger-parser) checks structure and `$ref`s; `tests/openapi.test.js` also checks that examples fit their schemas and that the YAML matches the code. A deliberately broken file is rejected by a test.

## B. Scalar
**9. What is Scalar?** An open-source tool that turns an OpenAPI file into an interactive reference page with a built-in API client.

**10. How does Scalar build the page?** It downloads the file from `url`, parses it, resolves `$ref`s and draws sidebar, operations, parameter tables, schemas, examples and code samples from that data. Nothing is hand-written. [`public/index.html`]

**11. If I change `maximum: 30` to `maximum: 50` and refresh, what happens?** The documentation shows 50, because the page is computed from the file. The real API's behaviour does not change — only our description of it (and a test would fail because it checks 30).

**12. Show the embedding code and explain each line.** Div `#app`; script tag loading `@scalar/api-reference@1.72.4` from jsDelivr (creates global `Scalar`); `Scalar.createApiReference('#app', { url: '/openapi.yaml', theme, layout, defaultHttpClient })`.

**13. CDN versus framework integration?** CDN: one script tag, no install, needs internet, version in the URL. Framework package (Express, Fastify, Laravel, Vue/React component...): installed as a dependency, can generate and serve the spec from the same app, more setup. We chose the CDN for simplicity.

**14. Why did you not set `proxyUrl`?** Scalar's hosted proxy cannot reach `localhost` and would send traffic through a third party. Our page and `/api` come from the same server, so there is no cross-origin request.

**15. Why is the version pinned?** So the demo behaves the same on the day; unpinned URLs get the newest release automatically.

## C. The built-in client
**16. What does it do?** Lets you choose an operation, fill parameters, send a real HTTP request from the browser and inspect status, headers and body.

**17. Is Scalar the Dad Joke API?** No. Scalar is only the documentation/client UI. The jokes come from icanhazdadjoke.com.

**18. Follow one click on "Send" end to end.** Browser → `GET http://localhost:3000/api/search?term=cat` → our proxy validates → cache lookup → (miss) rate-limit check → `GET https://icanhazdadjoke.com/search?term=cat` with `Accept: application/json` → response → cache it (if 200 JSON) → back to the browser with `X-Cache`.

## D. The Dad Joke API
**19. Why must `Accept: application/json` be sent?** The API chooses the format from `Accept`; the default is HTML, and `curl` gets plain text. Without the header we would not get JSON.

**20. What does the API ask of clients?** A custom `User-Agent` naming the project and a contact. We send one (`server.js`).

**21. What does the search response contain?** `results` (array of jokes with `id`, `joke`), `current_page`, `limit`, `next_page`, `previous_page`, `search_term`, `status`, `total_jokes`, `total_pages`.

**22. Explain pagination.** Results come in pages: `limit` jokes per page, `page` chooses which. `total_pages` tells you when to stop.

**23. What do we NOT know about the API?** Its numeric rate limit, the error body for unknown IDs, behaviour for invalid `page`/`limit`, and CORS rules are not in the official docs. We say so in the spec and README.

## E. Proxy, cache, safety
**24. Why a proxy at all?** To cache responses, limit upstream requests, always send the JSON header, and avoid depending on browser CORS behaviour. [`src/app.js`]

**25. What is cached? What is not?** Only HTTP 200 JSON responses to `GET`. Errors (404, 429, 5xx), failures and non-JSON responses are never cached.

**26. TTLs and why?** Random joke 10 s (so it still changes), joke by ID 1 hour (it never changes), search 5 minutes. [`DEFAULTS` in `src/app.js`]

**27. How is the cache key made?** Upstream path + query, with `term`, `page`, `limit` in a fixed order. `?term=cat` ≠ `?term=dog`; `?page=2&term=cat` = `?term=cat&page=2`.

**28. What happens when the cache is full?** The least recently used entry is evicted (max 100). Expired entries are removed when requested. [`src/cache.js`]

**29. How does the rate limiter work?** A sliding window: at most 30 requests to the public API in any 60 seconds. Cache hits are free. Over the limit → `429` with `Retry-After`, nothing sent upstream. [`src/rateLimiter.js`]

**30. How can you prove the cache works?** `X-Cache: MISS` then `HIT` on identical requests, the server log line, and the automated test that counts upstream calls (1 call for 2 requests).

**31. Why `Cache-Control: no-store`?** So the browser does not keep its own copy; every request reaches our server and `X-Cache` shows what *our* cache did.

**32. Does the proxy fake responses?** No. On a miss it forwards the request to the real API and returns the real body.

**33. What stops the proxy from reaching other websites?** Allow-list routing: only three route patterns, with validated values, are turned into upstream URLs; the upstream host is fixed.

**34. What can go wrong and what does the proxy do?** No internet → 502; API too slow (8 s) → 504; bad input → 400; too many requests → 429; unknown route → 404.

**35. Why do the tests inject `fetch`, the clock and the log?** So tests can simulate the network and the passage of time without waiting or contacting the public API.

## F. Process and ethics
**36. What is `.gitignore` doing here and why no `.env`?** It keeps `node_modules`, `.env`, keys and local files out of Git. The Dad Joke API needs no key, so no `.env` exists.

**37. Can you load test this API?** No. It is a free public service; we never run loops, stress tests or load tests against it. Tests use a stub.

**38. What did you test and what did you not?** 27 automated tests plus manual local checks; live API, CDN rendering and screenshots were done by the group on [date] (fill in). Be honest about anything you did not do.

**39. What did each member contribute?** Answer from `git shortlog -sne` and `CONTRIBUTION_PLAN.md`. Be specific: file, change, why.

**40. How did you use AI tools?** State plainly what was AI-assisted, and show that you understand and reviewed it. [`CONTRIBUTION_PLAN.md` section 0]

## G. Extension questions examiners like
* How would you add a fourth endpoint? *(YAML path + a branch in `resolveRoute` + a test; the consistency test will fail until both match.)*
* How would you make the cache survive restarts or work on several servers? *(Redis or similar; out of scope.)*
* What would change if the API needed a key? *(Store it in `.env`, read it with `process.env`, add `.env` to `.gitignore` — already done — and never log it.)*
* Why does the page need internet even though the server is local? *(Scalar is loaded from a CDN; the proxy contacts the real API.)*
