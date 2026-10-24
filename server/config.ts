// Server runtime configuration. Secrets are read here and never sent to the browser.

export interface ServerConfig {
  apiKey: string | null;
  model: string;
  analysisEnabled: boolean;
  port: number;
}

// Model IDs come from https://ai.google.dev/gemini-api/docs/models (checked 2026-10-24).
const DEFAULT_MODEL = 'gemini-3.8-flash';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.API_PORT);
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || null,
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    analysisEnabled: env.ANALYSIS_ENABLED?.trim().toLowerCase() !== 'false',
    port: Number.isInteger(port) && port > 0 ? port : 8787,
  };
}
