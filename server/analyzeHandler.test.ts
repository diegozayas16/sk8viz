import { describe, expect, it } from 'vitest';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import { AnalyzeResponseSchema, type AnalysisResult } from '../shared/analysis/schema.ts';
import { createAnalyzeHandler, liveUnavailableReason, type HandlerDeps, type LogEntry } from './analyzeHandler.ts';
import type { ServerConfig } from './config.ts';
import type { ClipAnalyzer, ClipInput, ClipStore, StoredClipRead } from './types.ts';
import { createUsageLimiter } from './usageLimiter.ts';

const config: ServerConfig = {
  apiKey: 'test',
  model: 'test-model',
  fallbackModel: null,
  analysisEnabled: true,
  accessCode: null,
  port: 0,
  redis: null,
  requireSharedLimiter: false,
  blobToken: null,
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

function upload(
  body: RequestInit['body'],
  type = 'video/mp4',
  headers: Record<string, string> = {},
  query = '?start=0&end=3',
) {
  return new Request(`http://localhost/api/analyze${query}`, {
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

  it('requires the access code when one is configured, without using the limiter', async () => {
    let acquired = 0;
    const limiter = {
      tryAcquire: async () => {
        acquired += 1;
        return { ok: true as const, release: async () => {} };
      },
    };
    const { handler } = setup({ config: { ...config, accessCode: 'kickflip' }, limiter });
    expect((await handler(upload(mp4Bytes), { clientId: 'a' })).status).toBe(401);
    expect((await handler(upload(mp4Bytes, 'video/mp4', { 'X-Access-Code': 'nope' }), { clientId: 'a' })).status).toBe(401);
    expect(acquired).toBe(0);
    const ok = await handler(upload(mp4Bytes, 'video/mp4', { 'X-Access-Code': ' kickflip ' }), { clientId: 'a' });
    expect(ok.status).toBe(200);
    expect(acquired).toBe(1);
  });

  it('refunds daily usage only when the provider did not run the analysis', async () => {
    const refunds: (boolean | undefined)[] = [];
    const limiter = {
      tryAcquire: async () => ({
        ok: true as const,
        release: async (options?: { refund?: boolean }) => {
          refunds.push(options?.refund);
        },
      }),
    };
    const busy: ClipAnalyzer = async () => ({ ok: false, code: 'busy', detail: 'provider 503' });
    const badOutput: ClipAnalyzer = async () => ({ ok: false, code: 'invalid_model_output', detail: 'x' });
    await setup({ limiter }).handler(upload(mp4Bytes), { clientId: 'a' });
    await setup({ limiter, analyzer: busy }).handler(upload(mp4Bytes), { clientId: 'a' });
    await setup({ limiter, analyzer: badOutput }).handler(upload(mp4Bytes), { clientId: 'a' });
    await setup({ limiter }).handler(upload(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]), 'video/webm'), { clientId: 'a' });
    expect(refunds).toEqual([false, true, false, true]);
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

  it('requires a valid window for direct uploads', async () => {
    const { handler } = setup();
    expect((await handler(upload(mp4Bytes, 'video/mp4', {}, ''), { clientId: 'a' })).status).toBe(400);
    expect((await handler(upload(mp4Bytes, 'video/mp4', {}, '?start=0&end=61'), { clientId: 'a' })).status).toBe(400);
    expect((await handler(upload(mp4Bytes, 'video/mp4', {}, '?start=5&end=5.5'), { clientId: 'a' })).status).toBe(400);
    expect((await handler(upload(mp4Bytes, 'video/mp4', {}, '?start=x&end=3'), { clientId: 'a' })).status).toBe(400);
  });

  it('passes the window to the analyzer', async () => {
    const inputs: ClipInput[] = [];
    const analyzer: ClipAnalyzer = async (input) => {
      inputs.push(input);
      return { ok: true, result };
    };
    const { handler } = setup({ analyzer });
    await handler(upload(mp4Bytes, 'video/mp4', {}, '?start=2.5&end=62'), { clientId: 'a' });
    expect(inputs[0]?.window).toEqual({ startSeconds: 2.5, endSeconds: 62 });
  });
});

const PATHNAME = 'clips/0b6c7a4e-1f2d-4c3b-9a8e-123456789abc.mp4';

function fakeStore(read: StoredClipRead = { ok: true, bytes: mp4Bytes, contentType: 'video/mp4' }) {
  const deleted: string[] = [];
  const reads: string[] = [];
  const store: ClipStore = {
    read: async (pathname) => {
      reads.push(pathname);
      return read;
    },
    delete: async (pathname) => {
      deleted.push(pathname);
    },
  };
  return { store, deleted, reads };
}

function storedRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const validStored = { pathname: PATHNAME, window: { startSeconds: 1, endSeconds: 8 } };

describe('analyze handler with stored (large) clips', () => {
  it('analyzes a stored clip, passes the window, and deletes the clip', async () => {
    const { store, deleted, reads } = fakeStore();
    const inputs: ClipInput[] = [];
    const analyzer: ClipAnalyzer = async (input) => {
      inputs.push(input);
      return { ok: true, result };
    };
    const { handler, limiter } = setup({ clipStore: store, analyzer });
    const response = await handler(storedRequest(validStored), { clientId: 'a' });
    expect(response.status).toBe(200);
    expect(reads).toEqual([PATHNAME]);
    expect(inputs[0]).toMatchObject({ mimeType: 'video/mp4', window: { startSeconds: 1, endSeconds: 8 } });
    expect(deleted).toEqual([PATHNAME]);
    expect(limiter.activeCount()).toBe(0);
  });

  it('deletes the clip when the analysis fails, times out, or is rate limited', async () => {
    const failing = fakeStore();
    const bad: ClipAnalyzer = async () => ({ ok: false, code: 'invalid_model_output', detail: 'x' });
    await setup({ clipStore: failing.store, analyzer: bad }).handler(storedRequest(validStored), { clientId: 'a' });
    expect(failing.deleted).toEqual([PATHNAME]);

    const slow = fakeStore();
    const hang: ClipAnalyzer = ({ signal }) =>
      new Promise((resolve) => signal.addEventListener('abort', () => resolve({ ok: false, code: 'timeout', detail: 'aborted' })));
    const timedOut = await setup({ clipStore: slow.store, analyzer: hang, timeoutMs: 20 }).handler(storedRequest(validStored), {
      clientId: 'a',
    });
    expect(timedOut.status).toBe(504);
    expect(slow.deleted).toEqual([PATHNAME]);

    const limited = fakeStore();
    const limiter = { tryAcquire: async () => ({ ok: false as const, code: 'daily_limit_reached' as const, retryAfterSeconds: 60 }) };
    const response = await setup({ clipStore: limited.store, limiter }).handler(storedRequest(validStored), { clientId: 'a' });
    expect(response.status).toBe(429);
    expect(limited.reads).toEqual([]);
    expect(limited.deleted).toEqual([PATHNAME]);
  });

  it('rejects stored-clip requests when large uploads are not configured', async () => {
    const { handler } = setup();
    expect((await handler(storedRequest(validStored), { clientId: 'a' })).status).toBe(400);
  });

  it('rejects invalid pathnames and windows without touching storage', async () => {
    const { store, deleted, reads } = fakeStore();
    const { handler } = setup({ clipStore: store });
    const bad = [
      { ...validStored, pathname: 'clips/../secret.mp4' },
      { ...validStored, pathname: 'https://evil.example/clip.mp4' },
      { ...validStored, pathname: 'other/0b6c7a4e-1f2d-4c3b-9a8e-123456789abc.mp4' },
      { ...validStored, window: { startSeconds: 0, endSeconds: 90 } },
      { pathname: PATHNAME },
      'not an object',
    ];
    for (const body of bad) {
      expect((await handler(storedRequest(body), { clientId: 'a' })).status).toBe(400);
    }
    const garbled = new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect((await handler(garbled, { clientId: 'a' })).status).toBe(400);
    expect(reads).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it('maps storage problems to clear errors and refunds the attempt', async () => {
    const refunds: (boolean | undefined)[] = [];
    const limiter = {
      tryAcquire: async () => ({
        ok: true as const,
        release: async (options?: { refund?: boolean }) => {
          refunds.push(options?.refund);
        },
      }),
    };
    const cases: [StoredClipRead, number][] = [
      [{ ok: false, reason: 'not_found' }, 400],
      [{ ok: false, reason: 'too_large' }, 413],
      [{ ok: false, reason: 'unavailable' }, 503],
      [{ ok: true, bytes: mp4Bytes, contentType: 'image/png' }, 415],
      [{ ok: true, bytes: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]), contentType: 'video/webm' }, 415],
    ];
    for (const [read, status] of cases) {
      const { store, deleted } = fakeStore(read);
      const response = await setup({ clipStore: store, limiter }).handler(storedRequest(validStored), { clientId: 'a' });
      expect(response.status).toBe(status);
      expect(deleted).toEqual([PATHNAME]);
    }
    expect(refunds).toEqual([true, true, true, true, true]);
  });

  it('still answers when deleting the clip fails', async () => {
    const store: ClipStore = {
      read: async () => ({ ok: true, bytes: mp4Bytes, contentType: 'video/mp4' }),
      delete: async () => {
        throw new Error('blob down');
      },
    };
    const response = await setup({ clipStore: store }).handler(storedRequest(validStored), { clientId: 'a' });
    expect(response.status).toBe(200);
  });

  it('checks the access code before reading or deleting anything', async () => {
    const { store, deleted, reads } = fakeStore();
    const { handler } = setup({ clipStore: store, config: { ...config, accessCode: 'kickflip' } });
    expect((await handler(storedRequest(validStored), { clientId: 'a' })).status).toBe(401);
    expect(reads).toEqual([]);
    expect(deleted).toEqual([]);
  });
});
