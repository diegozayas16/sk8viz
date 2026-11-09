import { createHash, timingSafeEqual } from 'node:crypto';
import { ACCEPTED_VIDEO_TYPES, ANALYSIS_LIMITS, isAcceptedVideoType } from '../shared/analysis/limits.ts';
import {
  ClipWindowSchema,
  StoredClipRequestSchema,
  type AnalysisErrorCode,
  type AnalyzeResponse,
  type ClipWindow,
  type HealthResponse,
} from '../shared/analysis/schema.ts';
import { largeUploadsConfigured, type ServerConfig } from './config.ts';
import { matchesVideoSignature, readLimitedBody } from './readBody.ts';
import type { ClipAnalyzer, ClipStore } from './types.ts';
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
  model?: string;
  detail?: string;
}

export interface HandlerDeps {
  config: ServerConfig;
  analyzer: ClipAnalyzer | null;
  limiter: UsageLimiter;
  // null when large uploads are not configured (no Blob token).
  clipStore?: ClipStore | null;
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
  daily_limit_reached: 429,
  access_denied: 401,
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
  payload_too_large: 'That clip is too large to analyze.',
  rate_limited: 'Too many analyses in a short time. Wait a moment and try again.',
  busy: 'The analyzer is busy right now. Try again shortly.',
  quota_exceeded: "Today's analysis limit has been reached. Try again tomorrow.",
  daily_limit_reached: `You've used your ${ANALYSIS_LIMITS.perClientDailyMax} analyses for today. Come back tomorrow!`,
  access_denied: 'Live analysis needs a valid access code.',
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
  if (config.requireSharedLimiter && !config.redis) return MESSAGES.server_misconfigured;
  return null;
}

export function createHealthHandler(config: ServerConfig) {
  return (): Response => {
    const reason = liveUnavailableReason(config);
    return json(
      {
        liveAnalysisAvailable: reason === null,
        reason,
        accessCodeRequired: config.accessCode !== null,
        largeUploadsAvailable: reason === null && largeUploadsConfigured(config),
      },
      200,
    );
  };
}

// Compares fixed-length digests so the check takes the same time for any guess.
export function accessCodeMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given.trim()), digest(expected));
}

// Outcomes where Gemini did not run the analysis, so the attempt should not
// count against the visitor's or the site's daily allowance.
const NOT_PROCESSED = new Set<AnalysisErrorCode>(['busy', 'quota_exceeded', 'server_misconfigured']);

// Small JSON bodies only: a stored-clip request is a pathname and two numbers.
const MAX_JSON_BYTES = 2048;

// Where the clip comes from: the request body (up to 4 MB) or Blob storage.
type ClipSource =
  | { kind: 'direct'; contentType: keyof typeof ACCEPTED_VIDEO_TYPES; body: ReadableStream<Uint8Array> | null }
  | { kind: 'stored'; pathname: string };

type ParsedRequest =
  | { ok: true; source: ClipSource; window: ClipWindow }
  | { ok: false; code: AnalysisErrorCode; detail: string };

// Direct uploads carry the window in the query string (?start=&end=).
function windowFromQuery(url: string): ClipWindow | null {
  const params = new URL(url).searchParams;
  const start = params.get('start');
  const end = params.get('end');
  if (start === null || end === null) return null;
  const parsed = ClipWindowSchema.safeParse({ startSeconds: Number(start), endSeconds: Number(end) });
  return parsed.success ? parsed.data : null;
}

async function parseRequest(request: Request, clipStore: ClipStore | null): Promise<ParsedRequest> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (contentType === 'application/json') {
    if (!clipStore) return { ok: false, code: 'invalid_request', detail: 'large uploads not configured' };
    const body = await readLimitedBody(request.body, MAX_JSON_BYTES);
    if (!body.ok) return { ok: false, code: 'invalid_request', detail: `json ${body.reason}` };
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(body.bytes));
    } catch {
      return { ok: false, code: 'invalid_request', detail: 'json unparseable' };
    }
    const parsed = StoredClipRequestSchema.safeParse(data);
    if (!parsed.success) return { ok: false, code: 'invalid_request', detail: 'json schema mismatch' };
    return { ok: true, source: { kind: 'stored', pathname: parsed.data.pathname }, window: parsed.data.window };
  }

  if (!isAcceptedVideoType(contentType)) {
    return { ok: false, code: 'unsupported_media', detail: `type ${contentType || 'none'}` };
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > ANALYSIS_LIMITS.maxClipBytes) {
    return { ok: false, code: 'payload_too_large', detail: 'content-length' };
  }
  const window = windowFromQuery(request.url);
  if (!window) return { ok: false, code: 'invalid_request', detail: 'missing or invalid window' };
  return { ok: true, source: { kind: 'direct', contentType, body: request.body }, window };
}

type LoadedClip =
  | { ok: true; bytes: Uint8Array; contentType: keyof typeof ACCEPTED_VIDEO_TYPES }
  | { ok: false; code: AnalysisErrorCode; detail: string; retryAfterSeconds?: number };

async function loadClip(source: ClipSource, clipStore: ClipStore | null, signal: AbortSignal): Promise<LoadedClip> {
  if (source.kind === 'direct') {
    const body = await readLimitedBody(source.body, ANALYSIS_LIMITS.maxClipBytes);
    if (!body.ok) {
      return { ok: false, code: body.reason === 'too_large' ? 'payload_too_large' : 'invalid_request', detail: body.reason };
    }
    return { ok: true, bytes: body.bytes, contentType: source.contentType };
  }

  if (!clipStore) return { ok: false, code: 'invalid_request', detail: 'large uploads not configured' };
  const stored = await clipStore.read(source.pathname, ANALYSIS_LIMITS.maxLargeClipBytes, signal);
  if (!stored.ok) {
    if (stored.reason === 'too_large') return { ok: false, code: 'payload_too_large', detail: 'stored clip' };
    if (stored.reason === 'unavailable') {
      return { ok: false, code: 'busy', detail: 'clip storage unavailable', retryAfterSeconds: 30 };
    }
    return { ok: false, code: 'invalid_request', detail: `stored clip ${stored.reason}` };
  }
  // Blob storage only accepted these types (see the upload handler), but the
  // stored value is checked again rather than trusted.
  const contentType = stored.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!isAcceptedVideoType(contentType)) return { ok: false, code: 'unsupported_media', detail: `stored type ${contentType}` };
  return { ok: true, bytes: stored.bytes, contentType };
}

export function createAnalyzeHandler(deps: HandlerDeps) {
  const log = deps.log ?? ((entry: LogEntry) => console.log(JSON.stringify({ event: 'analyze', ...entry })));
  const timeoutMs = deps.timeoutMs ?? ANALYSIS_LIMITS.analysisTimeoutMs;
  const clipStore = deps.clipStore ?? null;

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
    if (deps.config.accessCode && !accessCodeMatches(request.headers.get('x-access-code'), deps.config.accessCode)) {
      return fail('access_denied');
    }

    const parsed = await parseRequest(request, clipStore);
    if (!parsed.ok) return fail(parsed.code, { detail: parsed.detail });
    const { source, window } = parsed;
    const analyzer = deps.analyzer;

    const run = async (): Promise<Response> => {
      let slot;
      try {
        slot = await deps.limiter.tryAcquire(ctx.clientId);
      } catch {
        // Fail closed: without the shared limiter we cannot enforce usage limits.
        return fail('busy', { detail: 'limiter unavailable', retryAfterSeconds: 30 });
      }
      if (!slot.ok) return fail(slot.code, { retryAfterSeconds: slot.retryAfterSeconds });

      // Rejections before the provider call are free; see NOT_PROCESSED for after.
      let refund = true;
      try {
        const signals = [AbortSignal.timeout(timeoutMs)];
        if (ctx.signal) signals.push(ctx.signal);
        const signal = AbortSignal.any(signals);

        const clip = await loadClip(source, clipStore, signal);
        if (!clip.ok) return fail(clip.code, { detail: clip.detail, retryAfterSeconds: clip.retryAfterSeconds });
        bytes = clip.bytes.byteLength;

        if (!matchesVideoSignature(clip.contentType, clip.bytes)) {
          return fail('unsupported_media', { detail: 'signature mismatch' });
        }

        refund = false;
        const outcome = await analyzer({
          bytes: clip.bytes,
          mimeType: ACCEPTED_VIDEO_TYPES[clip.contentType],
          signal,
          window,
        });

        if (!outcome.ok) {
          refund = NOT_PROCESSED.has(outcome.code);
          return fail(outcome.code, {
            detail: outcome.detail,
            tokens: outcome.tokens,
            model: outcome.model,
            retryAfterSeconds: outcome.retryAfterSeconds,
          });
        }

        log({
          requestId,
          outcome: 'success',
          durationMs: Date.now() - started,
          bytes,
          tokens: outcome.tokens,
          model: outcome.model,
        });
        return json({ ok: true, requestId, result: outcome.result }, 200);
      } catch {
        return fail('provider_error', { detail: 'unexpected error' });
      } finally {
        // A failed release is not fatal: the slot's lease expires on its own.
        await slot.release({ refund }).catch(() => {});
      }
    };

    try {
      return await run();
    } finally {
      // Stored clips are deleted on every path (success, failure, rate limit).
      // If this delete fails, the blob still expires on its own (storedClipTtlDays).
      if (source.kind === 'stored' && clipStore) await clipStore.delete(source.pathname).catch(() => {});
    }
  };
}
