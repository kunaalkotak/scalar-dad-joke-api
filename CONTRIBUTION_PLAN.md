# Contribution plan

**Rules (from the professor):** one repository per group; every member makes meaningful commits under their *own* identity; every member must be able to
explain *any* part of the project. Nobody commits on behalf of another member, and we never fake authors or history.

## 0. One-time setup (each member, on their own laptop)

```bash
git config --global user.name  "Your Real Name"
git config --global user.email "the-email-linked-to-your-GitHub-account"
git clone https://github.com/YOUR-GROUP/scalar-dad-joke-api.git
```

The project owner creates the repository on GitHub, pushes the first commit and adds the other members as collaborators.
The initial files in this folder were generated with an AI assistant — say so in your first commit message or in the report
(for example "Initial project skeleton generated with AI assistance, reviewed by the group"). Then each member does real work below.

**Workflow:** one branch per task (`git checkout -b feature/short-name`), small commits, push, open a Pull Request, **another member reviews it**, merge.

## 1. Task list (placeholders: rename roles and reassign if your group has a different size)

### [Member 1] — Specification lead
Real work: read the official Dad Joke docs and the OpenAPI "structure" page, then **improve and extend `public/openapi.yaml`**.
* Add a `contact` block and a `license` under `info` (use your real details).
* Try adding an `Accept: text/plain` example or a description of the `/j/{id}.png` image endpoint as *documented-only* operation, and validate it (`npm run validate`).
* Write the test or YAML change that would catch a mistake you deliberately introduce (break a `$ref`, watch `npm test` fail, fix it).
Suggested commits: `docs(spec): add contact and license to info` · `docs(spec): clarify pagination wording` · `test(spec): add case for unique operationIds`.
Must be able to explain: every field in the YAML, `$ref`, schemas vs parameters, why `3.1`.

### [Member 2] — Proxy and cache developer
Real work: own `src/app.js`, `src/cache.js`, `src/rateLimiter.js`.
* Implement one improvement and write its test, e.g. a log line with cache size, a configurable rate limit through an environment variable, or de-duplicating two identical in-flight requests.
* Add a test that proves the improvement.
Suggested commits: `feat(proxy): log cache size on each request` · `test(proxy): cover new behaviour` · `refactor(cache): add comments`.
Must be able to explain: request flow, cache key, TTL, LRU eviction, rate limit, why errors are not cached, why `Cache-Control: no-store`.

### [Member 3] — Scalar integration and testing
Real work: own `public/index.html`, `tests/`, manual browser testing.
* Run the whole app in a browser, capture the five screenshots (`screenshots/PENDING.md`), record observed results in README section 10.
* Experiment with two Scalar options from the official configuration docs (e.g. `layout`, `theme`, `hiddenClients`), keep the better one, and explain the choice in the report.
* Verify in the browser what actually happens when the CDN is blocked (the red message).
Suggested commits: `docs: add screenshots` · `docs: record manual test results` · `feat(ui): change Scalar theme`.
Must be able to explain: how `createApiReference` is called, what `url` does, what the built-in client does, how CORS is avoided.

### [Member 4] — Documentation and presentation
Real work: own README, report, slides and the viva material.
* Fill in README section 2 (names, Git usernames) and **rewrite section 9 in the group's own words**.
* Build the real slides from `PRESENTATION.md`; rehearse the demo with the whole group using `DEMO_CHECKLIST.md`.
* Check that README, report, slides and diagram all describe the same implementation.
Suggested commits: `docs: complete member table` · `docs: rewrite research answers` · `docs: add slides`.
Must be able to explain: the problem statement, architecture diagram, what is ours vs Scalar vs the external API.

## 2. Shared work (everyone)
* Review at least one Pull Request from another member.
* Run the tests and the demo on your own laptop.
* Read `VIVA_QA.md` and answer the questions aloud without looking.

## 3. Checking the Git history before submission
```bash
git shortlog -sne        # every member should appear, with their own name
git log --oneline --graph
```
If a member has no meaningful commit, they take one of the open improvements above now — do not let someone else commit it for them.
