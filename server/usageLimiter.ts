import type { AnalysisErrorCode } from '../shared/analysis/schema.ts';

// Rate, concurrency and quota limits. createUsageLimiter keeps state in
// memory, which is correct only while all requests reach a single process
// (the local dev server). Deployed functions use the Redis-backed limiter in
// redisUsageLimiter.ts so every instance shares the same counters.

export interface UsageLimits {
  perClientWindowMs: number;
  perClientMaxRequests: number;
  perClientDailyMax: number;
  maxActivePerClient: number;
  maxGlobalConcurrent: number;
  maxDailyAnalyses: number;
}

export type LimitErrorCode = Extract<
  AnalysisErrorCode,
  'rate_limited' | 'busy' | 'quota_exceeded' | 'daily_limit_reached'
>;

export interface ReleaseOptions {
  // Give back the daily counts when the provider never ran the analysis
  // (rejected input, overload, quota), so those attempts are free.
  refund?: boolean;
}

export type AcquireResult =
  | { ok: true; release: (options?: ReleaseOptions) => Promise<void> }
  | { ok: false; code: LimitErrorCode; retryAfterSeconds: number };

export interface UsageLimiter {
  tryAcquire(clientId: string): Promise<AcquireResult>;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function createUsageLimiter(
  limits: UsageLimits,
  now: () => number = Date.now,
): UsageLimiter & { activeCount(): number } {
  const history = new Map<string, number[]>();
  const activeByClient = new Map<string, number>();
  const usedTodayByClient = new Map<string, number>();
  let globalActive = 0;
  let quotaDay = Math.floor(now() / DAY_MS);
  let quotaUsed = 0;

  function acquire(clientId: string): AcquireResult {
    const time = now();

    const day = Math.floor(time / DAY_MS);
    if (day !== quotaDay) {
      quotaDay = day;
      quotaUsed = 0;
      usedTodayByClient.clear();
    }
    const untilTomorrow = Math.ceil(((day + 1) * DAY_MS - time) / 1000);
    if (quotaUsed >= limits.maxDailyAnalyses) {
      return { ok: false, code: 'quota_exceeded', retryAfterSeconds: untilTomorrow };
    }
    const clientUsedToday = usedTodayByClient.get(clientId) ?? 0;
    if (clientUsedToday >= limits.perClientDailyMax) {
      return { ok: false, code: 'daily_limit_reached', retryAfterSeconds: untilTomorrow };
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
    usedTodayByClient.set(clientId, clientUsedToday + 1);
    activeByClient.set(clientId, clientActive + 1);
    globalActive += 1;

    let released = false;
    return {
      ok: true,
      async release(options) {
        if (released) return;
        released = true;
        globalActive -= 1;
        const remaining = (activeByClient.get(clientId) ?? 1) - 1;
        if (remaining <= 0) activeByClient.delete(clientId);
        else activeByClient.set(clientId, remaining);
        if (options?.refund && quotaDay === day) {
          quotaUsed = Math.max(0, quotaUsed - 1);
          usedTodayByClient.set(clientId, Math.max(0, (usedTodayByClient.get(clientId) ?? 1) - 1));
        }
      },
    };
  }

  return {
    // The checks and updates run synchronously, so they are atomic within one process.
    tryAcquire: async (clientId) => acquire(clientId),
    activeCount: () => globalActive,
  };
}
