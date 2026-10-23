# Presentation outline (10 minutes + 5 minutes questions)

Use this as the slide text. Suggested split: every member presents at least one slide (names in brackets are placeholders).
Timings add up to 10 minutes including the live demo.

| # | Slide | Time | Speaker (TODO) |
| - | --- | --- | --- |
| 1 | Title & team | 0:30 | [Member 4] |
| 2 | Problem: why unstructured API docs hurt | 1:00 | [Member 4] |
| 3 | What is OpenAPI? (structure of our YAML) | 1:30 | [Member 1] |
| 4 | Architecture | 1:00 | [Member 2] |
| 5 | **Live demo** (see DEMO_CHECKLIST.md) | 4:00 | [Member 3] + [Member 2] |
| 6 | Caching, rate limits, safety | 1:00 | [Member 2] |
| 7 | Testing: what we verified and what we did not | 0:45 | [Member 3] |
| 8 | Limitations, what we learned, thank you | 0:15 | [Member 4] |

## Slide 1 — Title
API Documentation with Scalar · Dad Joke API · group names and Git usernames.

## Slide 2 — The problem
* Text-only API descriptions: scattered, ambiguous, cannot be checked by a computer.
* Questions readers have: which URLs? which parameters? what does the answer look like?
* Our answer: one structured file + a tool that renders it.

## Slide 3 — OpenAPI
* Standard format (YAML/JSON) describing an API.
* Show `openapi.yaml` side by side with the rendered page: `info`, `servers`, `paths` → `get` → `parameters`, `responses`, `components.schemas`, `$ref`.
* Message: *change the file → the page changes.*

## Slide 4 — Architecture
* Show the Mermaid diagram from README section 4 (export it as an image or screenshot GitHub's rendering).
* Three owners: **we** built the spec, page, proxy; **Scalar** draws docs and the client; **icanhazdadjoke.com** supplies the jokes.

## Slide 5 — Live demo
Follow DEMO_CHECKLIST.md: random joke → joke by ID → search with pagination → repeat a request to show `X-Cache: HIT`.

## Slide 6 — Caching and respect for the public API
* Cache only HTTP 200 JSON. TTL: random 10 s, by ID 1 h, search 5 min. Max 100 entries (least-recently-used removed).
* 30 upstream requests per minute at most; input validation; custom `User-Agent`.
* **No load testing of the public API. No secrets in Git.**

## Slide 7 — Testing
* 27 automated tests (upstream is stubbed, so the public API is not contacted), valid OpenAPI 3.1.
* Honest note: live-API and browser checks were done by the group on [date] (TODO: fill in what you actually observed).

## Slide 8 — Limitations and learning
* Needs internet; third-party API; in-memory cache.
* Next steps: self-host Scalar bundle, more endpoints, CI.
