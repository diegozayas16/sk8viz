import { Redis } from '@upstash/redis';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import { createAnalyzeHandler, createHealthHandler, liveUnavailableReason } from './analyzeHandler.ts';
import type { ServerConfig } from './config.ts';
import { createRedisUsageLimiter } from './redisUsageLimiter.ts';
import { createGeminiAnalyzer } from './services/gemini.ts';
import { createUsageLimiter, type UsageLimiter } from './usageLimiter.ts';

// Wires the handlers for a runtime: the local dev server or a Vercel function.

function createLimiter(config: ServerConfig): UsageLimiter {
  if (config.redis) return createRedisUsageLimiter(new Redis(config.redis), ANALYSIS_LIMITS);
  return createUsageLimiter(ANALYSIS_LIMITS);
}

export function createApp(config: ServerConfig) {
  const analyzer =
    liveUnavailableReason(config) === null && config.apiKey ? createGeminiAnalyzer(config.apiKey, config.model, config.fallbackModel) : null;
  return {
    analyze: createAnalyzeHandler({ config, analyzer, limiter: createLimiter(config) }),
    health: createHealthHandler(config),
  };
}
