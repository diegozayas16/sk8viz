import { describe, expect, it } from 'vitest';
import { createUsageLimiter, type UsageLimits } from './usageLimiter.ts';

const limits: UsageLimits = {
  perClientWindowMs: 60_000,
  perClientMaxRequests: 2,
  perClientDailyMax: 10,
  maxActivePerClient: 1,
  maxGlobalConcurrent: 2,
  maxDailyAnalyses: 10,
};

describe('createUsageLimiter', () => {
  it('allows one active request per client and releases idempotently', async () => {
    const limiter = createUsageLimiter(limits, () => 0);
    const first = await limiter.tryAcquire('a');
    expect(first.ok).toBe(true);
    expect(await limiter.tryAcquire('a')).toMatchObject({ ok: false, code: 'rate_limited' });
    if (first.ok) {
      await first.release();
      await first.release();
    }
    expect(limiter.activeCount()).toBe(0);
  });

  it('enforces the sliding window per client', async () => {
    let time = 0;
    const limiter = createUsageLimiter(limits, () => time);
    for (let i = 0; i < 2; i++) {
      const slot = await limiter.tryAcquire('a');
      if (slot.ok) await slot.release();
    }
    expect(await limiter.tryAcquire('a')).toMatchObject({ ok: false, code: 'rate_limited' });
    time = 60_001;
    expect((await limiter.tryAcquire('a')).ok).toBe(true);
  });

  it('enforces global concurrency across clients', async () => {
    const limiter = createUsageLimiter(limits, () => 0);
    expect((await limiter.tryAcquire('a')).ok).toBe(true);
    expect((await limiter.tryAcquire('b')).ok).toBe(true);
    expect(await limiter.tryAcquire('c')).toMatchObject({ ok: false, code: 'busy' });
  });

  it('limits each visitor per day and refunds attempts the provider never ran', async () => {
    let time = 0;
    const limiter = createUsageLimiter({ ...limits, perClientDailyMax: 2, perClientMaxRequests: 99 }, () => time);
    const first = await limiter.tryAcquire('a');
    if (first.ok) await first.release({ refund: true });
    for (let i = 0; i < 2; i++) {
      const slot = await limiter.tryAcquire('a');
      if (slot.ok) await slot.release();
    }
    expect(await limiter.tryAcquire('a')).toMatchObject({ ok: false, code: 'daily_limit_reached' });
    expect((await limiter.tryAcquire('b')).ok).toBe(true);
    time = 24 * 60 * 60 * 1000;
    expect((await limiter.tryAcquire('a')).ok).toBe(true);
  });

  it('enforces the daily quota and resets the next day', async () => {
    let time = 0;
    const limiter = createUsageLimiter({ ...limits, maxDailyAnalyses: 1 }, () => time);
    const slot = await limiter.tryAcquire('a');
    if (slot.ok) await slot.release();
    expect(await limiter.tryAcquire('b')).toMatchObject({ ok: false, code: 'quota_exceeded' });
    time = 24 * 60 * 60 * 1000;
    expect((await limiter.tryAcquire('b')).ok).toBe(true);
  });
});
