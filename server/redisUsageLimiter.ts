import type { Redis } from '@upstash/redis';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DAY_MS, type AcquireResult, type UsageLimiter, type UsageLimits } from './usageLimiter.ts';

// Shared limiter for deployed functions, where requests are spread across
// instances. All checks and the slot grab run in one Lua script, so they are
// atomic in Redis. Each slot is a lease that expires on its own if a function
// dies before releasing it.

const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local leaseMs = tonumber(ARGV[3])
local dayEnd = tonumber(ARGV[4])
local leaseId = ARGV[5]

redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)

if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[9]) then
  return {0, 'quota_exceeded', math.ceil((dayEnd - now) / 1000)}
end
if tonumber(redis.call('GET', KEYS[5]) or '0') >= tonumber(ARGV[10]) then
  return {0, 'daily_limit_reached', math.ceil((dayEnd - now) / 1000)}
end

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - windowMs)
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[6]) then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return {0, 'rate_limited', math.max(1, math.ceil((tonumber(oldest[2]) + windowMs - now) / 1000))}
end
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[7]) then
  return {0, 'rate_limited', 5}
end
if redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[8]) then
  return {0, 'busy', 10}
end

redis.call('ZADD', KEYS[2], now, leaseId)
redis.call('PEXPIRE', KEYS[2], windowMs)
redis.call('INCR', KEYS[1])
redis.call('PEXPIREAT', KEYS[1], dayEnd + 3600000)
redis.call('INCR', KEYS[5])
redis.call('PEXPIREAT', KEYS[5], dayEnd + 3600000)
redis.call('ZADD', KEYS[3], now + leaseMs, leaseId)
redis.call('PEXPIRE', KEYS[3], leaseMs)
redis.call('ZADD', KEYS[4], now + leaseMs, leaseId)
redis.call('PEXPIRE', KEYS[4], leaseMs)
return {1}
`;

// Gives back the daily counts for an attempt the provider never ran. Never
// goes below zero (the day's keys may have expired in between).
const REFUND_SCRIPT = `
for i = 1, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') > 0 then redis.call('DECR', KEYS[i]) end
end
return 1
`;

const ScriptResultSchema = z.union([
  z.tuple([z.literal(1)]),
  z.tuple([
    z.literal(0),
    z.enum(['rate_limited', 'busy', 'quota_exceeded', 'daily_limit_reached']),
    z.number(),
  ]),
]);

const PREFIX = 'sk8viz:limits';

// Client IDs are IP addresses; store only a hash of them.
function hashClient(clientId: string): string {
  return createHash('sha256').update(clientId).digest('hex').slice(0, 32);
}

export function createRedisUsageLimiter(
  redis: Redis,
  limits: UsageLimits & { slotLeaseMs: number },
  now: () => number = Date.now,
): UsageLimiter {
  return {
    async tryAcquire(clientId) {
      const time = now();
      const day = Math.floor(time / DAY_MS);
      const client = hashClient(clientId);
      const leaseId = randomUUID();
      const clientActiveKey = `${PREFIX}:active:${client}`;
      const globalActiveKey = `${PREFIX}:active:global`;
      const quotaKey = `${PREFIX}:quota:${day}`;
      const clientDayKey = `${PREFIX}:day:${day}:${client}`;

      const raw = await redis.eval<(string | number)[], unknown>(
        ACQUIRE_SCRIPT,
        [quotaKey, `${PREFIX}:history:${client}`, clientActiveKey, globalActiveKey, clientDayKey],
        [
          time,
          limits.perClientWindowMs,
          limits.slotLeaseMs,
          (day + 1) * DAY_MS,
          leaseId,
          limits.perClientMaxRequests,
          limits.maxActivePerClient,
          limits.maxGlobalConcurrent,
          limits.maxDailyAnalyses,
          limits.perClientDailyMax,
        ],
      );

      const result = ScriptResultSchema.parse(raw);
      if (result[0] === 0) return { ok: false, code: result[1], retryAfterSeconds: result[2] };

      let released = false;
      const acquired: AcquireResult = {
        ok: true,
        async release(options) {
          if (released) return;
          released = true;
          await Promise.all([
            redis.zrem(clientActiveKey, leaseId),
            redis.zrem(globalActiveKey, leaseId),
            options?.refund ? redis.eval(REFUND_SCRIPT, [quotaKey, clientDayKey], []) : null,
          ]);
        },
      };
      return acquired;
    },
  };
}
