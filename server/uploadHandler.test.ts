import { describe, expect, it, vi } from 'vitest';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import type { ServerConfig } from './config.ts';
import { createUploadHandler } from './uploadHandler.ts';

const config: ServerConfig = {
  apiKey: 'test',
  model: 'test-model',
  fallbackModel: null,
  analysisEnabled: true,
  accessCode: null,
  port: 0,
  redis: null,
  requireSharedLimiter: false,
  blobToken: 'vercel_blob_rw_test',
};

const PATHNAME = 'clips/0b6c7a4e-1f2d-4c3b-9a8e-123456789abc.mov';

function tokenRequest(pathname = PATHNAME, headers: Record<string, string> = {}, type = 'blob.generate-client-token') {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ type, payload: { pathname, multipart: true, clientPayload: null } }),
  });
}

function setup(overrides: Partial<ServerConfig> = {}) {
  const issueToken = vi.fn(async (options: { onBeforeGenerateToken: (...args: never[]) => Promise<unknown> }) => ({
    type: 'blob.generate-client-token' as const,
    clientToken: 'client-token',
    constraints: await options.onBeforeGenerateToken(),
  }));
  const handler = createUploadHandler({
    config: { ...config, ...overrides },
    issueToken: issueToken as unknown as Parameters<typeof createUploadHandler>[0]['issueToken'],
  });
  return { handler, issueToken };
}

describe('upload handler', () => {
  it('issues a token limited to video types, the size cap, no overwrite, and auto-expiry', async () => {
    const { handler, issueToken } = setup();
    const response = await handler(tokenRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { clientToken: string; constraints: Record<string, unknown> };
    expect(body.clientToken).toBe('client-token');
    expect(body.constraints).toMatchObject({
      allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maximumSizeInBytes: ANALYSIS_LIMITS.maxLargeClipBytes,
      addRandomSuffix: false,
      allowOverwrite: false,
      ttlDays: ANALYSIS_LIMITS.storedClipTtlDays,
    });
    expect(issueToken).toHaveBeenCalledWith(expect.objectContaining({ token: 'vercel_blob_rw_test' }));
  });

  it('is unavailable without a Blob token or when live analysis is off', async () => {
    expect((await setup({ blobToken: null }).handler(tokenRequest())).status).toBe(503);
    expect((await setup({ analysisEnabled: false }).handler(tokenRequest())).status).toBe(503);
    expect((await setup({ apiKey: null }).handler(tokenRequest())).status).toBe(503);
  });

  it('requires the access code when one is configured', async () => {
    const { handler, issueToken } = setup({ accessCode: 'kickflip' });
    expect((await handler(tokenRequest())).status).toBe(401);
    expect((await handler(tokenRequest(PATHNAME, { 'X-Access-Code': 'nope' }))).status).toBe(401);
    expect(issueToken).not.toHaveBeenCalled();
    expect((await handler(tokenRequest(PATHNAME, { 'X-Access-Code': 'kickflip' }))).status).toBe(200);
  });

  it('refuses other pathnames, event types, and methods', async () => {
    const { handler, issueToken } = setup();
    expect((await handler(tokenRequest('avatars/me.png'))).status).toBe(400);
    expect((await handler(tokenRequest('clips/not-a-uuid.mp4'))).status).toBe(400);
    expect((await handler(tokenRequest(PATHNAME, {}, 'blob.upload-completed'))).status).toBe(400);
    expect((await handler(new Request('http://localhost/api/upload'))).status).toBe(405);
    expect(issueToken).not.toHaveBeenCalled();
  });

  it('returns a clean error when Blob fails', async () => {
    const issueToken = vi.fn(async () => {
      throw new Error('blob down');
    });
    const handler = createUploadHandler({
      config,
      issueToken: issueToken as unknown as Parameters<typeof createUploadHandler>[0]['issueToken'],
    });
    const response = await handler(tokenRequest());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('blob down');
  });
});
