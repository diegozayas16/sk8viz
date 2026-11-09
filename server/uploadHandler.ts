import { handleUpload } from '@vercel/blob/client';
import { z } from 'zod';
import { ACCEPTED_VIDEO_TYPES, ANALYSIS_LIMITS, STORED_CLIP_PATHNAME } from '../shared/analysis/limits.ts';
import { accessCodeMatches, liveUnavailableReason } from './analyzeHandler.ts';
import type { ServerConfig } from './config.ts';
import { readLimitedBody } from './readBody.ts';

// POST /api/upload: gives the browser a short-lived token to upload one clip
// straight to Vercel Blob. Big videos never pass through our function, so the
// 4.5 MB function body limit does not apply to them.
//
// Only token requests are accepted. We do not use Blob's upload-completed
// callback: the browser calls /api/analyze itself when the upload finishes.

const TokenRequestSchema = z.object({
  type: z.literal('blob.generate-client-token'),
  payload: z.object({
    pathname: z.string().regex(STORED_CLIP_PATHNAME),
    multipart: z.boolean(),
    clientPayload: z.string().nullable(),
  }),
});

// Upload tokens stay valid long enough for a slow phone connection.
const TOKEN_VALID_MS = 15 * 60_000;
const MAX_REQUEST_BYTES = 4096;

export interface UploadHandlerDeps {
  config: ServerConfig;
  // Injected in tests; defaults to the Vercel Blob helper.
  issueToken?: typeof handleUpload;
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function createUploadHandler({ config, issueToken = handleUpload }: UploadHandlerDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    if (liveUnavailableReason(config) !== null || !config.blobToken) {
      return reply({ error: 'Large uploads are not available right now.' }, 503);
    }
    if (config.accessCode && !accessCodeMatches(request.headers.get('x-access-code'), config.accessCode)) {
      return reply({ error: 'Live analysis needs a valid access code.' }, 401);
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

    try {
      const result = await issueToken({
        body: parsed.data,
        request,
        token: config.blobToken,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: Object.keys(ACCEPTED_VIDEO_TYPES),
          maximumSizeInBytes: ANALYSIS_LIMITS.maxLargeClipBytes,
          // The browser picks a random UUID name; never replace an existing clip.
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + TOKEN_VALID_MS,
          // Backup cleanup in case /api/analyze never runs for this clip.
          ttlDays: ANALYSIS_LIMITS.storedClipTtlDays,
        }),
      });
      return reply(result, 200);
    } catch {
      return reply({ error: "Couldn't start the upload. Try again shortly." }, 502);
    }
  };
}
