import { Redis } from '@upstash/redis';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import { createAuthVerifier, createSupabaseTokenVerifier } from './auth.ts';
import { createAnalyzeHandler, createHealthHandler, liveUnavailableReason } from './analyzeHandler.ts';
import { largeUploadsConfigured, type ServerConfig } from './config.ts';
import { createRedisUsageLimiter } from './redisUsageLimiter.ts';
import { createBlobClipStore } from './services/blobStore.ts';
import { createGeminiAnalyzer } from './services/gemini.ts';
import { createUploadHandler } from './uploadHandler.ts';
import { createUsageLimiter, type UsageLimiter } from './usageLimiter.ts';

// Wires the handlers for a runtime: the local dev server or a Vercel function.

function createLimiter(config: ServerConfig): UsageLimiter {
  if (config.redis) return createRedisUsageLimiter(new Redis(config.redis), ANALYSIS_LIMITS);
  return createUsageLimiter(ANALYSIS_LIMITS);
}

export function createApp(config: ServerConfig) {
  const analyzer =
    liveUnavailableReason(config) === null && config.apiKey ? createGeminiAnalyzer(config.apiKey, config.model, config.fallbackModel) : null;
  const auth = config.supabase ? createAuthVerifier(createSupabaseTokenVerifier(config.supabase)) : null;
  return {
    analyze: createAnalyzeHandler({
      config,
      analyzer,
      limiter: createLimiter(config),
      auth,
      clipStore: largeUploadsConfigured(config) ? createBlobClipStore(config.blobToken) : null,
    }),
    upload: createUploadHandler({ config, auth }),
    health: createHealthHandler(config),
  };
}
