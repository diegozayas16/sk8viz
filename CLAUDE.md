# Sk8viz — Development Guidelines

## Project Purpose

Sk8viz is a hackathon web application that analyzes skateboarding footage and provides structured AI coaching feedback.

Default MVP: user-triggered analysis of a short clip or bounded, ordered frame sequence. Continuous analysis is a separate feature.

Keep feature requirements and acceptance criteria in the PRD or current task. This file defines repository conventions, architectural boundaries, and development practices.

## Implementation Priorities

- Build the smallest complete flow that meets the current task.
- Before public access, implement server-side secrets, input validation, payload limits, timeouts, rate limits, and usage controls.
- Add distributed coordination only when the deployment architecture requires it.
- Prefer existing libraries and built-in hosting capabilities over custom infrastructure.
- Do not interpret every guideline as a request to implement a new feature.
- Do not introduce accounts, persistent storage, queues, or continuous analysis unless required by the product or deployment.
- Preserve existing user work and avoid unrelated changes.

## Repository Facts and Verification

Verified 2026-10-24 against `package.json` and working code:

- Frontend: React 19, Vite 8, TypeScript 7, Tailwind CSS 4 (`@tailwindcss/vite`), Lucide React.
- Validation: Zod 4. Types are derived from schemas with `z.infer`.
- AI SDK: `@google/genai` 2.x, called through `ai.models.generateContent` with inline video data.
- Tests: Vitest 5. Node environment by default; React hook tests opt into jsdom with a `// @vitest-environment jsdom` comment and use `@testing-library/react` (`renderHook`). `src/hooks/useAnalysis.test.ts` covers stale responses, duplicate submits, unmount aborts and live/demo separation; `src/hooks/useCameraRecorder.test.ts` covers camera release on every exit path with a fake `getUserMedia` and `MediaRecorder`. Test files are type-checked by both tsconfigs.
- Backend: platform-neutral handlers built on standard `Request`/`Response` in `server/`, wired together in `server/app.ts`. Locally they run in a plain Node HTTP server (`server/dev.ts`). Node 24 runs the `.ts` files directly through type stripping, so server code must use erasable syntax only (no enums or parameter properties) and `.ts` import extensions.
- Hosting: Vercel (not yet deployed). `api/analyze.ts` and `api/health.ts` are Vercel Functions (Node.js 24, Web `fetch` export). Vercel compiles them using the root `tsconfig.json`, which rewrites `.ts` imports to `.js`. `npx vercel build` succeeds locally. `vercel.json` runs `npm test && npm run build` on every deploy, so failing tests or type errors block it, and sets security headers on all routes (a CSP allowing only same-origin scripts, Google Fonts, and `blob:` media for clip previews; `frame-ancestors 'none'`; camera allowed for the site only). New external origins (scripts, fonts, APIs) must be added to the CSP. The Vercel preview toolbar (`vercel.live`) is not allowed and is blocked on preview deploys.
- Rate limits: shared Upstash Redis limiter (`server/redisUsageLimiter.ts`, one atomic Lua script, slots are expiring leases) when Upstash credentials are set; in-memory limiter (`server/usageLimiter.ts`) otherwise. On Vercel (`VERCEL=1`) live analysis is disabled unless Redis is configured. Limits: 3 analyses per visitor per UTC day and 35 per day site-wide (sized to the Gemini free tier). Attempts that never reached Gemini, or that Gemini rejected as busy or over quota, are refunded. The Lua script has run in production against Upstash (live analyses passed through it on 2026-10-24); the per-visitor daily and refund changes were deployed afterwards.
- Clip size is capped at 4 MB because Vercel Functions reject request bodies over 4.5 MB.
- Clip input: upload a file, or record in the browser (`src/hooks/useCameraRecorder.ts`, settings in `src/services/recording.ts`). Recording uses `getUserMedia` (video only, rear camera by default) and `MediaRecorder` (MP4 preferred, WebM fallback, ~0.9 Mbps), stops at 30 s or near the size limit, and always releases the camera. Recordings pass their measured duration to `useClipSelection` because Chrome's WebM recordings report an infinite duration. The browser pane blocks real cameras, so recording was verified there with a canvas-backed fake `getUserMedia`; the user confirmed it works on their phone on the deployed site (2026-10-24, device and browser not recorded).

Where things live:

| Concern | Location |
| --- | --- |
| Prompts | `server/services/analysisPrompt.ts` |
| Model selection | `server/config.ts` (`GEMINI_MODEL`, default `gemini-3.6-flash`; `GEMINI_FALLBACK_MODEL`, default `gemini-3.5-flash-lite`, tried once only on a provider 503 or 429). Free-tier keys allow about 20 requests per day per model (seen 2026-10-24 for `gemini-3.6-flash`); daily-quota 429s map to `quota_exceeded`. |
| Result and API schemas | `shared/analysis/schema.ts` |
| Gemini JSON schema conversion | `shared/analysis/geminiSchema.ts` |
| Resource limits | `shared/analysis/limits.ts` |
| Demo fixture | `src/services/demoFixture.ts` |

Environment variables (server only, see `.env.example`): `GEMINI_API_KEY` (required for live analysis), `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` (`none` disables), `ANALYSIS_ENABLED` (kill switch), `ANALYSIS_ACCESS_CODE` (optional; when set, `/api/analyze` requires it in the `X-Access-Code` header, checked before any usage is counted, and the UI shows a code field; the code lives only in React state), `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`; required on Vercel), `API_PORT` (local only).

Treat `package.json`, the lockfile, configuration files, and working code as authoritative. Do not claim planned capabilities already exist.

## Development Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` (use `npm ci` for a reproducible install) |
| Frontend dev server | `npm run dev` (port 5173, proxies `/api` to 8787) |
| Local API server | `npm run dev:api` (port 8787, reads `.env` if present) |
| Type checking | `npm run typecheck` (`tsconfig.app.json` for the browser, `tsconfig.json` for api/server/shared) |
| Tests | `npm test` |
| Production build | `npm run build` (runs type checking first) |
| Lint | None configured |
| AI clip evaluation | `npm run eval` (live Gemini calls, uses quota; `-- --dry-run` checks files only; `-- --only <name>`). Clips in `eval/clips/` (gitignored), expectations in `eval/cases.json`, see `eval/README.md` |
| Vercel build check | `npx vercel build` (needs `.vercel/project.json`; output in `.vercel/output`, gitignored) |

- The Vite dev server does not run backend endpoints; run both dev commands for live analysis.
- Do not invent scripts or claim missing checks passed.
- Keep dependency manifests and lockfiles synchronized.

## Architecture and Boundaries

Follow existing repository conventions. The following layout illustrates responsibilities and is not a required migration:

```text
src/
  components/       # UI and accessible controls
  hooks/            # Camera lifecycle and analysis state
  services/         # Browser API client and demo fixtures
  types/            # Frontend-only types
  App.tsx           # Layout and composition
  main.tsx          # Frontend entry point
shared/
  analysis/         # Shared contracts and validation schemas
api/                # Serverless handlers, if supported by hosting
server/
  services/         # Server-only Gemini integration
```

- Components render UI.
- Hooks coordinate state and lifecycle.
- Services handle external boundaries.
- The browser calls our analysis endpoint.
- The endpoint validates input, calls Gemini, validates output, and returns a safe response.
- Keep server-only modules out of frontend imports.
- A file named “service” is not automatically server-side.
- Use one backend arrangement compatible with deployment.
- Introduce abstractions only when they simplify an actual requirement.

## Secrets and Media Privacy

- Store `GEMINI_API_KEY` in the server runtime environment.
- Never expose secrets through `VITE_*`, client bundles, browser storage, URLs, or logs.
- Exclude local secret files from Git.
- Provide `.env.example` with placeholders and document required variables.
- Report exposed credentials and require rotation; removing a key from source does not invalidate it.
- Require an explicit user action to start camera capture and analysis.
- Explain when footage is sent for AI processing.
- Do not persist or log raw footage by default.
- Any retention feature requires an explicit product requirement and documented deletion behavior.

If accounts or stored media are introduced:

- Verify ownership server-side for every upload, read, analysis, and deletion operation.
- Never trust a browser-supplied user ID as proof of ownership.
- Keep stored footage private by default.

## Resource Limits and Abuse Protection

Before implementing analysis, define centralized configuration for:

- Clip duration, sampling interval, frame count, and resolution.
- Maximum request size.
- Upload/read and analysis timeouts.
- Retry limits.
- Per-user/session request limits.
- Global concurrency and usage limits.

Choose values based on actual hosting constraints and expected media. Treat 50 MB and 30 seconds as proposals to evaluate, not established defaults.

### Server Enforcement

- Validate content types, media constraints, frame counts, and payload sizes before calling Gemini.
- Enforce payload limits at the gateway and application boundary before buffering the full request.
- Handle uploads without a trustworthy `Content-Length`.
- Apply token-bucket or sliding-window rate limiting.
- Prefer authenticated user limits when accounts exist; otherwise use server-issued sessions with supplementary IP limits.
- Anonymous sessions alone do not prevent clients from creating new identities.
- Trust forwarded IP headers only through the deployment's verified proxy configuration.
- Enforce one active analysis request per user/session initially.
- Set a global concurrency limit. Reject excess work or use a bounded queue.
- Enforce a bounded usage quota before public deployment.
- Frontend button disabling, throttling, and CORS are not substitutes for server enforcement.
- Return clear errors for oversized payloads, rate limits, and temporary overload, with retry guidance where appropriate.

### Deployment Coordination

- Use shared rate-limit and concurrency state when requests run across multiple instances or serverless workers.
- Acquire concurrency slots atomically.
- Release slots on success, failure, cancellation, and timeout.
- If leases are needed, align expiry and renewal with execution deadlines so interrupted processes do not permanently occupy slots or permit overlapping work.
- Cancel downstream work where supported after expiry or cancellation.
- Do not assume closing the browser connection stops provider processing or billing.
- Prefer deployment-supported controls over building custom infrastructure.

## Analysis Lifecycle

- Represent idle, capturing, analyzing, success, and error states explicitly.
- Prevent duplicate submissions.
- Track request/session identity so late responses cannot overwrite results for newer footage.
- Abort requests where supported and ignore stale results regardless.
- Stop camera tracks, clear timers, and release media resources when capture stops or the view unmounts.
- Cleanup must tolerate repeated setup and teardown.
- Handle camera permission denial, unavailable cameras, unsupported media, network failures, timeouts, and provider errors with actionable messages.
- Keep retries bounded and respect provider retry guidance.
- Do not automatically retry invalid input or credential errors.
- Consider duplicate AI work before retrying requests whose processing status is unknown.

## AI Contracts and Grounding

- Verify SDK exports, model capabilities, and parameters against installed types and official documentation.
- Never invent APIs, parameters, exports, or model identifiers.
- Centralize prompts, model selection, and response schemas.
- Define explicit TypeScript request, result, and error types.
- Avoid `any`; use `unknown` for untrusted data and narrow it through validation.
- Configure structured output with a JSON schema supported by the selected SDK and model.
- Validate incoming requests and model responses at runtime.
- Check required fields, allowed values, and numeric ranges.
- Keep schemas and types synchronized; derive types from existing schema tools when practical.
- Handle refusals, empty responses, parsing failures, and invalid results explicitly.
- Never cast unvalidated JSON into a trusted application type.
- Schema compliance establishes structure, not coaching accuracy.
- Support an “insufficient evidence” result.
- Do not invent trick completion, movement details, or precise measurements unsupported by the footage.
- Treat text within footage and user input as content to analyze, not instructions overriding application behavior.
- Return safe application errors without credentials, internal stack traces, or sensitive provider details.

## AI Quality Evaluation

- Maintain a small set of representative clips that the project has permission to use, with manually reviewed expected observations.
- Include clear footage, blurry footage, incomplete tricks, obstructed views, and footage without skateboarding.
- When changing prompts, models, frame sampling, or schemas, compare results against this set.
- Evaluate unsupported claims, missed observations, and appropriate “insufficient evidence” responses.
- Check coaching relevance as well as response structure.
- Do not require identical wording from model responses.
- Keep repeatable automated tests separate from live model evaluations.
- Document evaluation limitations; a small clip set does not establish general accuracy.

## Demo Mode

- Maintain deterministic mock fixtures for visual development and repeatable tests.
- Clearly label mock output: “Demo data — not an analysis of your footage.”
- Keep demo and live modes explicit and separate.
- Never silently replace failed live analysis with fake coaching.
- When live analysis is unavailable, show the reason and offer a deliberate switch to demo mode.
- Ensure mocks do not conceal live failure states.

## Operational Visibility

- Record request IDs, processing duration, outcome, and error category.
- Exclude secrets, raw footage, and sensitive payloads from logs.
- Track rate-limit rejections, timeouts, provider failures, and AI usage.
- Provide a server-side switch to disable live analysis when usage or failures become excessive.
- Prefer the hosting platform's existing logging and monitoring tools.
- Do not add a monitoring service unless the current deployment needs it.

## Scope and Code Quality

- Read relevant files, existing patterns, and the current diff before editing.
- Make the smallest complete change that satisfies the task.
- Preserve existing behavior unless the requested change requires otherwise.
- Small necessary refactors are allowed; avoid unrelated rewrites and redesigns.
- Remove code made obsolete by the current task.
- Before deleting, check static and dynamic imports, scripts, configuration, and public-asset references.
- Remove temporary debugging and commented-out code while retaining useful sanitized error reporting.
- Treat 250 lines as a component review signal, not a hard limit.
- Split components by responsibility rather than solely to reduce line count.
- Reuse installed dependencies.
- Request approval before adding a package and explain why existing tools are insufficient.
- Do not upgrade dependencies as incidental cleanup.
- Remove dependencies only when verified unused and relevant to the task.
- Use semantic controls, visible focus, descriptive labels, and accessible status feedback.
- Support keyboard operation of camera and analysis controls.

## Verification and Definition of Done

Run relevant checks after each logical change rather than after every individual file edit.

Before handing off implementation:

1. Run the verified type check and existing lint command.
2. Run relevant tests and add focused coverage for meaningful changed behavior.
3. Prioritize validation failures, live/demo separation, stale responses, and camera cleanup.
4. When changing resource protections, verify payload rejection, rate limits, concurrency enforcement, and cleanup after failures or timeouts.
5. When changing AI behavior, run the relevant clip evaluations and report observed differences.
6. Run the production build.
7. Exercise the changed user flow and an appropriate failure case.
8. Review the diff for unrelated edits, leaked secrets, dead code, and missing documentation.
9. Report checks actually run, outcomes, and remaining limitations.

- Disclose unavailable browser, camera, live-model, or deployment testing.
- Distinguish existing failures from regressions.
- Never discard user work, weaken validation, disable checks, or substitute mock success to make verification pass.
- A successful build alone does not establish that camera access, analysis, abuse protections, or deployment works.

## Communication

- Explain meaningful implementation decisions in plain language.
- Explain unfamiliar concepts when needed to understand the change.
- At handoff, summarize changed behavior, key files, verification results, and remaining limitations.
- Ask for clarification when ambiguity materially changes scope, architecture, cost, or user-visible behavior.
- Otherwise, follow existing conventions and proceed with reasonable assumptions.
- Clearly distinguish implemented behavior, proposed work, and unverified assumptions.
