import { ACCEPTED_VIDEO_TYPES, ANALYSIS_LIMITS, isAcceptedVideoType } from '../shared/analysis/limits.ts';
import type { AnalysisErrorCode, AnalyzeResponse, HealthResponse } from '../shared/analysis/schema.ts';
import type { ServerConfig } from './config.ts';
import { matchesVideoSignature, readLimitedBody } from './readBody.ts';
import type { ClipAnalyzer } from './types.ts';
import type { UsageLimiter } from './usageLimiter.ts';

// Platform-neutral handlers built on the standard Request/Response API, so
// they can be mounted in a Node server or a serverless function unchanged.

export interface RequestContext {
  clientId: string;
  // Aborted when the client disconnects.
  signal?: AbortSignal;
}

export interface LogEntry {
  requestId: string;
  outcome: 'success' | AnalysisErrorCode;
  durationMs: number;
  bytes?: number;
  tokens?: number;
  detail?: string;
}

export interface HandlerDeps {
  config: ServerConfig;
  analyzer: ClipAnalyzer | null;
  limiter: UsageLimiter;
  log?: (entry: LogEntry) => void;
  timeoutMs?: number;
}

const STATUS: Record<AnalysisErrorCode, number> = {
  invalid_request: 400,
  unsupported_media: 415,
  payload_too_large: 413,
  rate_limited: 429,
  busy: 503,
  quota_exceeded: 429,
  analysis_disabled: 503,
  timeout: 504,
  content_blocked: 422,
  invalid_model_output: 502,
  provider_error: 502,
  server_misconfigured: 500,
};

const MESSAGES: Record<AnalysisErrorCode, string> = {
  invalid_request: 'The request was not a valid clip upload.',
  unsupported_media: 'Use an MP4, WebM, or MOV video file.',
  payload_too_large: `Clips must be ${ANALYSIS_LIMITS.maxClipBytes / 1024 / 1024} MB or smaller.`,
  rate_limited: 'Too many analyses in a short time. Wait a moment and try again.',
  busy: 'The analyzer is busy right now. Try again shortly.',
  quota_exceeded: "Today's analysis limit has been reached. Try again tomorrow.",
  analysis_disabled: 'Live analysis is switched off right now.',
  timeout: 'The analysis took too long and was stopped.',
  content_blocked: 'The AI provider declined to analyze this clip.',
  invalid_model_output: "The AI returned a response we couldn't use. Try again or use a different clip.",
  provider_error: 'The AI provider had a problem processing this clip.',
  server_misconfigured: 'Live analysis is not configured on the server.',
};

function json(body: AnalyzeResponse | HealthResponse, status: number, retryAfterSeconds?: number): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (retryAfterSeconds) headers.set('Retry-After', String(retryAfterSeconds));
  return new Response(JSON.stringify(body), { status, headers });
}

export function liveUnavailableReason(config: ServerConfig): string | null {
  if (!config.analysisEnabled) return MESSAGES.analysis_disabled;
  if (!config.apiKey) return MESSAGES.server_misconfigured;
  return null;
}

export function createHealthHandler(config: ServerConfig) {
  return (): Response => {
    const reason = liveUnavailableReason(config);
    return json({ liveAnalysisAvailable: reason === null, reason }, 200);
  };
}

export function createAnalyzeHandler(deps: HandlerDeps) {
  const log = deps.log ?? ((entry: LogEntry) => console.log(JSON.stringify({ event: 'analyze', ...entry })));
  const timeoutMs = deps.timeoutMs ?? ANALYSIS_LIMITS.analysisTimeoutMs;

  return async (request: Request, ctx: RequestContext): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let bytes: number | undefined;

    const fail = (code: AnalysisErrorCode, extra: Partial<LogEntry> & { retryAfterSeconds?: number } = {}) => {
      const { retryAfterSeconds, ...logExtra } = extra;
      log({ requestId, outcome: code, durationMs: Date.now() - started, bytes, ...logExtra });
      return json(
        { ok: false, requestId, error: { code, message: MESSAGES[code], retryAfterSeconds } },
        STATUS[code],
        retryAfterSeconds,
      );
    };

    if (request.method !== 'POST') return fail('invalid_request', { detail: `method ${request.method}` });
    if (!deps.config.analysisEnabled) return fail('analysis_disabled');
    if (!deps.analyzer) return fail('server_misconfigured', { detail: 'missing api key' });

    const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!isAcceptedVideoType(contentType)) return fail('unsupported_media', { detail: `type ${contentType || 'none'}` });

    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > ANALYSIS_LIMITS.maxClipBytes) {
      return fail('payload_too_large', { detail: 'content-length' });
    }

    const slot = deps.limiter.tryAcquire(ctx.clientId);
    if (!slot.ok) return fail(slot.code, { retryAfterSeconds: slot.retryAfterSeconds });

    try {
      const body = await readLimitedBody(request.body, ANALYSIS_LIMITS.maxClipBytes);
      if (!body.ok) return fail(body.reason === 'too_large' ? 'payload_too_large' : 'invalid_request', { detail: body.reason });
      bytes = body.bytes.byteLength;

      if (!matchesVideoSignature(contentType, body.bytes)) return fail('unsupported_media', { detail: 'signature mismatch' });

      const signals = [AbortSignal.timeout(timeoutMs)];
      if (ctx.signal) signals.push(ctx.signal);

      const outcome = await deps.analyzer({
        bytes: body.bytes,
        mimeType: ACCEPTED_VIDEO_TYPES[contentType],
        signal: AbortSignal.any(signals),
      });

      if (!outcome.ok) {
        return fail(outcome.code, {
          detail: outcome.detail,
          tokens: outcome.tokens,
          retryAfterSeconds: outcome.retryAfterSeconds,
        });
      }

      log({ requestId, outcome: 'success', durationMs: Date.now() - started, bytes, tokens: outcome.tokens });
      return json({ ok: true, requestId, result: outcome.result }, 200);
    } catch {
      return fail('provider_error', { detail: 'unexpected error' });
    } finally {
      slot.release();
    }
  };
}
