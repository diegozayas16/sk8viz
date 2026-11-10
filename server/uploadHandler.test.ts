import { describe, expect, it, vi } from 'vitest';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import type { ServerConfig } from './config.ts';
import { createUploadHandler, type UploadHandlerDeps } from './uploadHandler.ts';

const config: ServerConfig = {
  apiKey: 'test',
  model: 'test-model',
  fallbackModel: null,
  analysisEnabled: true,
  supabase: null,
  port: 0,
  redis: null,
  requireSharedLimiter: false,
  blobToken: 'vercel_blob_rw_test',
  blobStoreId: null,
};

const PATHNAME = 'clips/0b6c7a4e-1f2d-4c3b-9a8e-123456789abc.mov';

function presignRequest(pathname = PATHNAME, headers: Record<string, string> = {}, type = 'blob.generate-presigned-url') {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ type, payload: { pathname, multipart: true, clientPayload: null } }),
  });
}

type GetSignedToken = (pathname: string, clientPayload: string | null, multipart: boolean) => Promise<unknown>;

// Fakes for the two Blob helpers. The presign fake runs getSignedToken the
// way the real helper does and echoes what it returned.
function setup(overrides: Partial<ServerConfig> = {}, auth: UploadHandlerDeps['auth'] = null) {
  const signToken = vi.fn(async (_options: Record<string, unknown>) => ({
    delegationToken: 'delegation',
    clientSigningToken: 'signing',
  }));
  const presign = vi.fn(async (options: { body: { payload: { pathname: string } }; getSignedToken: GetSignedToken }) => ({
    type: 'blob.generate-presigned-url' as const,
    issued: await options.getSignedToken(options.body.payload.pathname, null, true),
  }));
  const handler = createUploadHandler({
    config: { ...config, ...overrides },
    auth,
    presign: presign as unknown as UploadHandlerDeps['presign'],
    signToken: signToken as unknown as UploadHandlerDeps['signToken'],
  });
  return { handler, presign, signToken };
}

describe('upload handler', () => {
  it('signs an upload-only token for this one clip, with type, size, overwrite, and expiry limits', async () => {
    const { handler, signToken } = setup();
    const response = await handler(presignRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { issued: { urlOptions: Record<string, unknown> } };
    const limits = {
      allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maximumSizeInBytes: ANALYSIS_LIMITS.maxLargeClipBytes,
    };
    expect(signToken).toHaveBeenCalledWith(
      expect.objectContaining({ ...limits, pathname: PATHNAME, operations: ['put'], token: 'vercel_blob_rw_test' }),
    );
    expect(body.issued.urlOptions).toMatchObject({
      ...limits,
      addRandomSuffix: false,
      allowOverwrite: false,
      ttlDays: ANALYSIS_LIMITS.storedClipTtlDays,
    });
  });

  it('works with only a store ID (Vercel OIDC), passing no token so the SDK uses OIDC', async () => {
    const { handler, signToken } = setup({ blobToken: null, blobStoreId: 'store_abc' });
    expect((await handler(presignRequest())).status).toBe(200);
    expect(signToken.mock.calls[0]?.[0]).not.toHaveProperty('token');
  });

  it('is unavailable without Blob credentials or when live analysis is off', async () => {
    expect((await setup({ blobToken: null }).handler(presignRequest())).status).toBe(503);
    expect((await setup({ analysisEnabled: false }).handler(presignRequest())).status).toBe(503);
    expect((await setup({ apiKey: null }).handler(presignRequest())).status).toBe(503);
  });

  it('requires a signed-in user when sign-in is configured', async () => {
    const supabase = { url: 'https://p.supabase.co', publishableKey: 'sb_publishable_x' };
    const auth = async (request: Request) =>
      request.headers.get('authorization') === 'Bearer good' ? { id: 'user-1' } : null;
    const { handler, presign } = setup({ supabase }, auth);
    expect((await handler(presignRequest())).status).toBe(401);
    expect((await handler(presignRequest(PATHNAME, { Authorization: 'Bearer bad' }))).status).toBe(401);
    expect(presign).not.toHaveBeenCalled();
    expect((await handler(presignRequest(PATHNAME, { Authorization: 'Bearer good' }))).status).toBe(200);
    // No verifier wired: fail closed rather than let anyone upload.
    expect((await setup({ supabase }).handler(presignRequest(PATHNAME, { Authorization: 'Bearer good' }))).status).toBe(503);
  });

  it('refuses other pathnames, event types (including callbacks), and methods', async () => {
    const { handler, presign } = setup();
    expect((await handler(presignRequest('avatars/me.png'))).status).toBe(400);
    expect((await handler(presignRequest('clips/not-a-uuid.mp4'))).status).toBe(400);
    expect((await handler(presignRequest(PATHNAME, {}, 'blob.upload-completed'))).status).toBe(400);
    expect((await handler(presignRequest(PATHNAME, {}, 'blob.generate-client-token'))).status).toBe(400);
    expect((await handler(new Request('http://localhost/api/upload'))).status).toBe(405);
    expect(presign).not.toHaveBeenCalled();
  });

  it('returns a clean error when Blob fails', async () => {
    const presign = vi.fn(async () => {
      throw new Error('blob down');
    });
    const handler = createUploadHandler({ config, presign: presign as unknown as UploadHandlerDeps['presign'] });
    const response = await handler(presignRequest());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('blob down');
  });
});
