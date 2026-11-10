import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { z } from 'zod';
import { ACCEPTED_VIDEO_TYPES, ANALYSIS_LIMITS, STORED_CLIP_PATHNAME } from '../shared/analysis/limits.ts';
import { checkSignIn, liveUnavailableReason } from './analyzeHandler.ts';
import type { AuthVerifier } from './auth.ts';
import { largeUploadsConfigured, type ServerConfig } from './config.ts';
import { readLimitedBody } from './readBody.ts';

// POST /api/upload: gives the browser a short-lived presigned URL to upload
// one clip straight to Vercel Blob. Big videos never pass through our
// function, so the 4.5 MB function body limit does not apply to them.
//
// Uses Blob's presigned flow, which works with both a read-write token and
// Vercel's OIDC login (newer store connections only set BLOB_STORE_ID).
//
// Only presign requests are accepted. We do not use Blob's upload-completed
// callback: the browser calls /api/analyze itself when the upload finishes.

const TokenRequestSchema = z.object({
  type: z.literal('blob.generate-presigned-url'),
  payload: z.object({
    pathname: z.string().regex(STORED_CLIP_PATHNAME),
    multipart: z.boolean(),
    clientPayload: z.string().nullable(),
  }),
});

// Upload tokens stay valid long enough for a slow phone connection.
const TOKEN_VALID_MS = 15 * 60_000;
const MAX_REQUEST_BYTES = 4096;

// handleUploadPresigned insists on a webhook key, which it only uses to verify
// upload-completed callbacks. Vercel sets BLOB_WEBHOOK_PUBLIC_KEY; locally we
// fall back to a placeholder, since TokenRequestSchema rejects callbacks
// before the helper runs and the key is never used.
const UNUSED_WEBHOOK_KEY = 'unused-upload-completed-callbacks-are-rejected';

export interface UploadHandlerDeps {
  config: ServerConfig;
  // Required when config.supabase is set.
  auth?: AuthVerifier | null;
  // Injected in tests; default to the Vercel Blob helpers.
  presign?: typeof handleUploadPresigned;
  signToken?: typeof issueSignedToken;
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function createUploadHandler({
  config,
  auth = null,
  presign = handleUploadPresigned,
  signToken = issueSignedToken,
}: UploadHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    if (liveUnavailableReason(config) !== null || !largeUploadsConfigured(config)) {
      return reply({ error: 'Large uploads are not available right now.' }, 503);
    }
    const signIn = await checkSignIn(config, auth, request);
    if (!signIn.ok) {
      return signIn.code === 'sign_in_required'
        ? reply({ error: 'Sign in to upload a clip.' }, 401)
        : reply({ error: 'Large uploads are not available right now.' }, 503);
    }

    const raw = await readLimitedBody(request.body, MAX_REQUEST_BYTES);
    if (!raw.ok) return reply({ error: 'Invalid upload request.' }, 400);
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(raw.bytes));
    } catch {
      return reply({ error: 'Invalid upload request.' }, 400);
    }
    const parsed = TokenRequestSchema.safeParse(data);
    if (!parsed.success) return reply({ error: 'Invalid upload request.' }, 400);

    // A read-write token when configured; otherwise the SDK uses OIDC + BLOB_STORE_ID.
    const blobAuth = config.blobToken ? { token: config.blobToken } : {};
    const constraints = {
      allowedContentTypes: Object.keys(ACCEPTED_VIDEO_TYPES),
      maximumSizeInBytes: ANALYSIS_LIMITS.maxLargeClipBytes,
      validUntil: Date.now() + TOKEN_VALID_MS,
    };

    try {
      const result = await presign({
        body: parsed.data,
        request,
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || UNUSED_WEBHOOK_KEY,
        getSignedToken: async (pathname) => ({
          // Scoped to this one clip name, upload only.
          token: await signToken({ ...blobAuth, ...constraints, pathname, operations: ['put'] }),
          urlOptions: {
            ...constraints,
            // The browser picks a random UUID name; never replace an existing clip.
            addRandomSuffix: false,
            allowOverwrite: false,
            // Backup cleanup in case /api/analyze never runs for this clip.
            ttlDays: ANALYSIS_LIMITS.storedClipTtlDays,
          },
        }),
      });
      return reply(result, 200);
    } catch {
      return reply({ error: "Couldn't start the upload. Try again shortly." }, 502);
    }
  };
}
