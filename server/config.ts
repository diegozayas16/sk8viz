// Server runtime configuration. Secrets are read here and never sent to the browser.

export interface ServerConfig {
  apiKey: string | null;
  model: string;
  // Tried once when the main model is overloaded (503). null disables it.
  fallbackModel: string | null;
  analysisEnabled: boolean;
  // When set, live analysis requires this code in the X-Access-Code header.
  accessCode: string | null;
  port: number;
  // Upstash Redis REST credentials for the shared rate limiter.
  redis: { url: string; token: string } | null;
  // Deployed functions run on many instances and must share limiter state.
  requireSharedLimiter: boolean;
}

// Model IDs come from https://ai.google.dev/gemini-api/docs/models (checked 2026-10-24).
// gemini-3.8-flash returned repeated 503 "high demand" errors on 2026-10-24.
const DEFAULT_MODEL = 'gemini-3.6-flash';
// Lighter model that stayed available while the main model returned 503s.
const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.API_PORT);
  // The Vercel Marketplace Upstash integration may set either naming scheme.
  const redisUrl = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim();
  const redisToken = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || null,
    model,
    fallbackModel: fallback.toLowerCase() === 'none' || fallback === model ? null : fallback,
    analysisEnabled: env.ANALYSIS_ENABLED?.trim().toLowerCase() !== 'false',
    accessCode: env.ANALYSIS_ACCESS_CODE?.trim() || null,
    port: Number.isInteger(port) && port > 0 ? port : 8787,
    redis: redisUrl && redisToken ? { url: redisUrl, token: redisToken } : null,
    requireSharedLimiter: env.VERCEL === '1',
  };
}
