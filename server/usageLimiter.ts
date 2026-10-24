import type { AnalysisErrorCode } from '../shared/analysis/schema.ts';

// In-memory rate, concurrency and quota limits. This is correct only while
// all requests reach a single process. Serverless or multi-instance hosting
// needs this state moved to a shared store (see CLAUDE.md, Deployment Coordination).

export interface UsageLimits {
  perClientWindowMs: number;
  perClientMaxRequests: number;
  maxActivePerClient: number;
  maxGlobalConcurrent: number;
  maxDailyAnalyses: number;
}

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; code: Extract<AnalysisErrorCode, 'rate_limited' | 'busy' | 'quota_exceeded'>; retryAfterSeconds: number };

export interface UsageLimiter {
  tryAcquire(clientId: string): AcquireResult;
  activeCount(): number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createUsageLimiter(limits: UsageLimits, now: () => number = Date.now): UsageLimiter {
  const history = new Map<string, number[]>();
  const activeByClient = new Map<string, number>();
  let globalActive = 0;
  let quotaDay = Math.floor(now() / DAY_MS);
  let quotaUsed = 0;

  return {
    // Synchronous, so checks and the slot update happen atomically.
    tryAcquire(clientId) {
      const time = now();

      const day = Math.floor(time / DAY_MS);
      if (day !== quotaDay) {
        quotaDay = day;
        quotaUsed = 0;
      }
      if (quotaUsed >= limits.maxDailyAnalyses) {
        return { ok: false, code: 'quota_exceeded', retryAfterSeconds: Math.ceil(((day + 1) * DAY_MS - time) / 1000) };
      }

      const recent = (history.get(clientId) ?? []).filter((t) => time - t < limits.perClientWindowMs);
      history.set(clientId, recent);
      const oldest = recent[0];
      if (recent.length >= limits.perClientMaxRequests && oldest !== undefined) {
        return {
          ok: false,
          code: 'rate_limited',
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + limits.perClientWindowMs - time) / 1000)),
        };
      }

      const clientActive = activeByClient.get(clientId) ?? 0;
      if (clientActive >= limits.maxActivePerClient) {
        return { ok: false, code: 'rate_limited', retryAfterSeconds: 5 };
      }
      if (globalActive >= limits.maxGlobalConcurrent) {
        return { ok: false, code: 'busy', retryAfterSeconds: 10 };
      }

      recent.push(time);
      quotaUsed += 1;
      activeByClient.set(clientId, clientActive + 1);
      globalActive += 1;

      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          globalActive -= 1;
          const remaining = (activeByClient.get(clientId) ?? 1) - 1;
          if (remaining <= 0) activeByClient.delete(clientId);
          else activeByClient.set(clientId, remaining);
        },
      };
    },
    activeCount: () => globalActive,
  };
}
