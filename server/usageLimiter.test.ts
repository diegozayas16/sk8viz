import { describe, expect, it } from 'vitest';
import { createUsageLimiter, type UsageLimits } from './usageLimiter.ts';

const limits: UsageLimits = {
  perClientWindowMs: 60_000,
  perClientMaxRequests: 2,
  maxActivePerClient: 1,
  maxGlobalConcurrent: 2,
  maxDailyAnalyses: 10,
};

describe('createUsageLimiter', () => {
  it('allows one active request per client and releases idempotently', () => {
    const limiter = createUsageLimiter(limits, () => 0);
    const first = limiter.tryAcquire('a');
    expect(first.ok).toBe(true);
    expect(limiter.tryAcquire('a')).toMatchObject({ ok: false, code: 'rate_limited' });
    if (first.ok) {
      first.release();
      first.release();
    }
    expect(limiter.activeCount()).toBe(0);
  });

  it('enforces the sliding window per client', () => {
    let time = 0;
    const limiter = createUsageLimiter(limits, () => time);
    for (let i = 0; i < 2; i++) {
      const slot = limiter.tryAcquire('a');
      if (slot.ok) slot.release();
    }
    const blocked = limiter.tryAcquire('a');
    expect(blocked).toMatchObject({ ok: false, code: 'rate_limited' });
    time = 60_001;
    expect(limiter.tryAcquire('a').ok).toBe(true);
  });

  it('enforces global concurrency across clients', () => {
    const limiter = createUsageLimiter(limits, () => 0);
    expect(limiter.tryAcquire('a').ok).toBe(true);
    expect(limiter.tryAcquire('b').ok).toBe(true);
    expect(limiter.tryAcquire('c')).toMatchObject({ ok: false, code: 'busy' });
  });

  it('enforces the daily quota and resets the next day', () => {
    let time = 0;
    const limiter = createUsageLimiter({ ...limits, maxDailyAnalyses: 1 }, () => time);
    const slot = limiter.tryAcquire('a');
    if (slot.ok) slot.release();
    expect(limiter.tryAcquire('b')).toMatchObject({ ok: false, code: 'quota_exceeded' });
    time = 24 * 60 * 60 * 1000;
    expect(limiter.tryAcquire('b').ok).toBe(true);
  });
});
