import { describe, expect, it } from 'vitest';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import { AnalyzeResponseSchema, type AnalysisResult } from '../shared/analysis/schema.ts';
import { createAnalyzeHandler, liveUnavailableReason, type HandlerDeps, type LogEntry } from './analyzeHandler.ts';
import type { ServerConfig } from './config.ts';
import type { ClipAnalyzer } from './types.ts';
import { createUsageLimiter } from './usageLimiter.ts';

const config: ServerConfig = {
  apiKey: 'test',
  model: 'test-model',
  analysisEnabled: true,
  port: 0,
  redis: null,
  requireSharedLimiter: false,
};

const result: AnalysisResult = {
  verdict: 'analyzed',
  summary: 'An ollie on flat ground.',
  trick: { name: 'Ollie', landed: 'yes', confidence: 'high' },
  observations: [],
  tips: [],
  insufficientEvidenceReason: null,
};

// Minimal MP4 header: box size, then "ftyp".
const mp4Bytes = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

function setup(overrides: Partial<HandlerDeps> = {}) {
  const logs: LogEntry[] = [];
  const limiter = createUsageLimiter(ANALYSIS_LIMITS);
  const analyzer: ClipAnalyzer = async () => ({ ok: true, result });
  const handler = createAnalyzeHandler({ config, analyzer, limiter, log: (e) => logs.push(e), ...overrides });
  return { handler, limiter, logs };
}

function upload(body: RequestInit['body'], type = 'video/mp4', headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': type, ...headers },
    body,
    duplex: 'half',
  } as RequestInit);
}

async function parse(response: Response) {
  return AnalyzeResponseSchema.parse(await response.json());
}

describe('analyze handler', () => {
  it('returns a validated result for a valid clip', async () => {
    const { handler, limiter } = setup();
    const response = await handler(upload(mp4Bytes), { clientId: 'a' });
    expect(response.status).toBe(200);
    expect(await parse(response)).toMatchObject({ ok: true, result });
    expect(limiter.activeCount()).toBe(0);
  });

  it('rejects unsupported content types', async () => {
    const { handler } = setup();
    const response = await handler(upload(mp4Bytes, 'image/png'), { clientId: 'a' });
    expect(response.status).toBe(415);
  });

  it('rejects a body whose signature does not match its type', async () => {
    const { handler } = setup();
    const response = await handler(upload(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'video/webm'), { clientId: 'a' });
    expect(response.status).toBe(415);
  });

  it('rejects oversized bodies without a Content-Length header', async () => {
    const { handler, limiter } = setup();
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > ANALYSIS_LIMITS.maxClipBytes) controller.close();
        else {
          sent += chunk.byteLength;
          controller.enqueue(chunk);
        }
      },
    });
    const response = await handler(upload(stream), { clientId: 'a' });
    expect(response.status).toBe(413);
    expect(limiter.activeCount()).toBe(0);
  });

  it('rejects a declared Content-Length over the limit before reading', async () => {
    const { handler } = setup();
    const response = await handler(
      upload(mp4Bytes, 'video/mp4', { 'Content-Length': String(ANALYSIS_LIMITS.maxClipBytes + 1) }),
      { clientId: 'a' },
    );
    expect(response.status).toBe(413);
  });

  it('allows only one active analysis per client', async () => {
    let finish: () => void = () => {};
    const analyzer: ClipAnalyzer = () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true, result });
      });
    const { handler } = setup({ analyzer });
    const first = handler(upload(mp4Bytes), { clientId: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    const second = await handler(upload(mp4Bytes), { clientId: 'a' });
    expect(second.status).toBe(429);
    expect(second.headers.get('Retry-After')).toBeTruthy();
    finish();
    expect((await first).status).toBe(200);
  });

  it('times out, returns 504, and releases the slot', async () => {
    const analyzer: ClipAnalyzer = ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ ok: false, code: 'timeout', detail: 'aborted' }));
      });
    const { handler, limiter } = setup({ analyzer, timeoutMs: 20 });
    const response = await handler(upload(mp4Bytes), { clientId: 'a' });
    expect(response.status).toBe(504);
    expect(limiter.activeCount()).toBe(0);
  });

  it('releases the slot when the analyzer throws', async () => {
    const analyzer: ClipAnalyzer = async () => {
      throw new Error('boom');
    };
    const { handler, limiter } = setup({ analyzer });
    const response = await handler(upload(mp4Bytes), { clientId: 'a' });
    expect(response.status).toBe(502);
    expect(limiter.activeCount()).toBe(0);
  });

  it('reports disabled and misconfigured states without calling the analyzer', async () => {
    const disabled = setup({ config: { ...config, analysisEnabled: false } });
    expect((await disabled.handler(upload(mp4Bytes), { clientId: 'a' })).status).toBe(503);
    const noKey = setup({ analyzer: null });
    expect((await noKey.handler(upload(mp4Bytes), { clientId: 'a' })).status).toBe(500);
  });

  it('fails closed with 503 when the limiter store is unreachable', async () => {
    let called = false;
    const analyzer: ClipAnalyzer = async () => {
      called = true;
      return { ok: true, result };
    };
    const limiter = {
      tryAcquire: async () => {
        throw new Error('redis down');
      },
    };
    const { handler } = setup({ analyzer, limiter });
    const response = await handler(upload(mp4Bytes), { clientId: 'a' });
    expect(response.status).toBe(503);
    expect(called).toBe(false);
  });

  it('reports live analysis unavailable when a deployment has no shared limiter', () => {
    expect(liveUnavailableReason({ ...config, requireSharedLimiter: true, redis: null })).not.toBeNull();
    expect(liveUnavailableReason({ ...config, requireSharedLimiter: true, redis: { url: 'u', token: 't' } })).toBeNull();
  });

  it('does not leak provider details in error responses', async () => {
    const analyzer: ClipAnalyzer = async () => ({ ok: false, code: 'provider_error', detail: 'provider 500 secret-ish' });
    const { handler, logs } = setup({ analyzer });
    const body = await (await handler(upload(mp4Bytes), { clientId: 'a' })).text();
    expect(body).not.toContain('secret-ish');
    expect(logs[0]?.detail).toContain('provider 500');
  });
});
