import type { Redis } from '@upstash/redis';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import { createRedisUsageLimiter } from './redisUsageLimiter.ts';

// The Lua script itself runs only against a real Redis; these tests cover how
// the limiter interprets script results and releases slots.

function fakeRedis(evalResult: unknown) {
  const removed: [string, string][] = [];
  const keys: string[][] = [];
  const redis = {
    eval: async (_script: string, k: string[]) => {
      keys.push(k);
      return evalResult;
    },
    zrem: async (key: string, member: string) => {
      removed.push([key, member]);
      return 1;
    },
  } as unknown as Redis;
  return { redis, removed, keys };
}

describe('createRedisUsageLimiter', () => {
  it('returns a slot whose release removes both leases exactly once', async () => {
    const { redis, removed } = fakeRedis([1]);
    const slot = await createRedisUsageLimiter(redis, ANALYSIS_LIMITS).tryAcquire('1.2.3.4');
    expect(slot.ok).toBe(true);
    if (slot.ok) {
      await slot.release();
      await slot.release();
    }
    expect(removed).toHaveLength(2);
    expect(removed[0]?.[1]).toBe(removed[1]?.[1]);
  });

  it('maps rejections to error codes and retry times', async () => {
    const { redis } = fakeRedis([0, 'rate_limited', 85]);
    expect(await createRedisUsageLimiter(redis, ANALYSIS_LIMITS).tryAcquire('a')).toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 85,
    });
  });

  it('throws on an unexpected script result so the handler fails closed', async () => {
    const { redis } = fakeRedis(['weird']);
    await expect(createRedisUsageLimiter(redis, ANALYSIS_LIMITS).tryAcquire('a')).rejects.toThrow();
  });

  it('does not put raw client IPs in Redis keys', async () => {
    const { redis, keys } = fakeRedis([1]);
    await createRedisUsageLimiter(redis, ANALYSIS_LIMITS).tryAcquire('203.0.113.7');
    expect(keys.flat().join(' ')).not.toContain('203.0.113.7');
  });
});
