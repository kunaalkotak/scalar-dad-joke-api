# Demo checklist — 10 minutes

## The day before (TODO group)
- [ ] Fresh clone on the laptop you will present with, `node -v` shows v20 or newer.
- [ ] `npm install`, `npm test` (27 pass), `npm run validate` (VALID).
- [ ] `USER_AGENT` in `server.js` contains your real repository URL.
- [ ] `npm start`; open http://localhost:3000/ ; send each operation once. Everything works?
- [ ] Screenshots captured and added to the README (see `screenshots/PENDING.md`).
- [ ] Every member has made real commits under their own identity: `git shortlog -sne`.
- [ ] Backup plan: a screen recording of a successful run, in case the internet fails.

## 10 minutes before
- [ ] Wi-Fi works (Scalar CDN and the Dad Joke API need internet). Phone hotspot ready as a fallback.
- [ ] Two windows ready: browser (http://localhost:3000/) and the terminal running `npm start` (font enlarged).
- [ ] Browser developer tools → Network tab open, "Disable cache" off (our server already sends `no-store`).
- [ ] Do NOT click Send repeatedly "just to test". Cached answers are the point; the limit is 30 upstream requests per minute.

## Demo script (≈ 4 minutes of the 10)
1. **(0:30)** Show the terminal: "the server prints where everything is" → show http://localhost:3000/ . Point out the title, sidebar with 3 operations, and the server selector (local proxy is the default).
2. **(0:45) Random joke** — open *Retrieve a random joke* → open the built-in client → **Send**. Show status 200 and the JSON (`id`, `joke`, `status`). Show response headers: `X-Cache: MISS`.
3. **(0:30) Repeat within 10 s** — Send again. Same joke, `X-Cache: HIT`; terminal shows `cache HIT`. Explain: no request reached the public API. Wait 10 s → send → `MISS`, a new joke.
4. **(0:45) Joke by ID** — *Retrieve a particular joke*, `joke_id = R7UfaahVfFd` (example is pre-filled) → Send → 200. Then enter an invalid ID such as `bad id!` → 400 from our proxy (explain it is validation, before the real API).
5. **(1:00) Search and pagination** — *Search jokes*: `term = hipster` → Send. Explain `results`, `total_jokes`, `total_pages`. Then `term = cat`, `limit = 5`, `page = 1`, then `page = 2`. Explain pagination.
6. **(0:30) Spec drives the page** — open `public/openapi.yaml` in an editor, change a `summary`, refresh the browser, show the change. Undo it (`git checkout public/openapi.yaml`).

## Remaining minutes
Architecture slide, caching/safety slide, testing slide (see PRESENTATION.md). Run `npm test` live only if time allows (about 2 seconds, no internet needed).

## If something goes wrong
| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Blank page and the red "Scalar could not be loaded" box | No internet / CDN blocked | Switch Wi-Fi or use the hotspot; reload |
| Response is `502 Could not reach the Dad Joke API` | No internet or the API is down | Check connection; explain the error handling; show the recording |
| Response is `429` from the proxy | More than 30 upstream requests in a minute | Wait for `Retry-After` seconds; explain it is protecting the public API |
| Port 3000 already in use | Another program | `PORT=4000 npm start` and edit the server URL in `openapi.yaml` (README section 7) |
| Page opened as `127.0.0.1` | Spec server is `localhost` | Use http://localhost:3000/ |
