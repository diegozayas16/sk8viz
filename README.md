# Sk8viz

Film or upload a short skateboarding clip and get AI coaching feedback: what
happened in the clip, which trick it looks like, whether it was landed, and a
few specific tips. Live at <https://sk8viz.vercel.app>.

The clip is sent to Google Gemini for analysis. It is not kept or logged:
clips over 4 MB pass through temporary private storage and are deleted as soon
as the analysis finishes. Note that on Gemini's free tier, Google may use
submitted content to improve its products; use a paid API key if that matters.
When the footage does not clearly show skateboarding, the app says there is
not enough evidence instead of guessing. A demo mode shows sample feedback,
clearly labeled, without using your footage.

## How it works

1. The browser records a clip (up to 30 seconds) or takes an uploaded file
   (MP4, WebM or MOV, up to 100 MB). The user trims it to the part with the
   trick (at most 60 seconds); only that part is analyzed.
2. Clips up to 4 MB are posted straight to `/api/analyze`. Bigger clips are
   uploaded from the browser to private Vercel Blob storage with a short-lived
   token from `/api/upload`, then `/api/analyze` is called with the clip's
   storage name.
3. The server checks the file type, size, trim window and usage limits, sends
   the clip to Gemini (inline, or through Gemini's Files API for big clips)
   with a JSON schema for the answer, and checks the answer against that
   schema before returning it. Stored clips and Gemini files are deleted
   whether the analysis worked or not.
4. The browser checks the response again and shows the result.

| Folder | What it holds |
| --- | --- |
| `src/` | React app: components, hooks for camera and analysis state, API client |
| `shared/analysis/` | Zod schemas and limits used by both browser and server |
| `server/` | Request handler, rate limiting, Gemini call and prompt |
| `api/` | Vercel Functions that wrap the handlers in `server/` |
| `eval/` | Manual accuracy check against your own clips (see `eval/README.md`) |

## Run it locally

Needs Node.js 24.

```bash
npm install
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (get one at
<https://aistudio.google.com/apikey>). Without a key the app still runs, and
demo mode works.

Start the API server and the web app in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev
```

Then open <http://localhost:5173>.

## Settings

All settings are server-side environment variables; none reach the browser.
`.env.example` describes each one.

| Variable | Needed | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For live analysis | Gemini API key |
| `GEMINI_MODEL` | No | Main model (default `gemini-3.6-flash`) |
| `GEMINI_FALLBACK_MODEL` | No | Tried once when the main model is busy; `none` turns it off |
| `ANALYSIS_ENABLED` | No | `false` switches live analysis off |
| `ANALYSIS_ACCESS_CODE` | No | When set, visitors must enter this code to analyze |
| `BLOB_READ_WRITE_TOKEN` | For clips over 4 MB, locally | Vercel Blob token for temporary clip storage |
| `BLOB_STORE_ID` | For clips over 4 MB, on Vercel | Set by connecting a Blob store; used with Vercel OIDC |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | On Vercel | Shared rate limits across function instances |

## Limits

To protect the free Gemini quota, each visitor gets 10 analyses per day (UTC)
and the whole site 35. One analysis runs at a time per visitor, and each one
times out after 2 minutes. Gemini's cost depends on how many seconds it
watches, not on file size, which is why clips are trimmed to at most 60
seconds. Attempts that never reached Gemini, or that Gemini
turned away as busy or over its quota, do not count. The values live in
`shared/analysis/limits.ts`.

## Checks

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type checks the browser and server code |
| `npm test` | Runs the unit and integration tests |
| `npm run build` | Type checks, then builds the web app into `dist/` |
| `npm run eval` | Runs real clips through Gemini (uses quota) |

## Deploy

The project deploys to Vercel from the `main` branch. Each deploy runs the
tests and the type check first, and a failure stops the deploy. Vercel needs
`GEMINI_API_KEY` and Upstash Redis credentials; without Redis, live analysis
stays off on Vercel. For clips over 4 MB, create a Blob store in the Vercel
dashboard (Storage → Create → Blob) and connect it to the project; that sets
`BLOB_STORE_ID`, which the app uses with Vercel's built-in OIDC sign-in.
Preview deployments only see variables enabled for Preview, so enable
`GEMINI_API_KEY` for Preview too if you want to test there.

`vercel.json` also sets security headers, including a Content Security Policy
that only allows the site's own scripts and Google Fonts.
