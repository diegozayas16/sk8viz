---
paths:
  - "server/usageLimiter.ts"
  - "server/redisUsageLimiter.ts"
  - "server/analyzeHandler.ts"
  - "shared/analysis/limits.ts"
---

# Usage limits

- 10 analyses per user per UTC day, 35/day site-wide. Limiter key is
  `user:<id>` when sign-in is configured, else the client IP (local dev only).
- Analysis timeout 120 s; `vercel.json` gives `api/analyze.ts` `maxDuration` 180.
- Attempts that never reached Gemini, or that Gemini rejected as busy/over
  quota, are refunded (`NOT_PROCESSED`).
- On Vercel (`VERCEL=1`) live analysis is off unless Redis is configured. The
  Redis Lua script is atomic; slots are expiring leases (`slotLeaseMs` must
  exceed the analysis timeout). Limiter errors fail closed (`busy`).
