import { ANALYSIS_LIMITS, storedClipPathname } from '../../shared/analysis/limits.ts';
import {
  AnalyzeResponseSchema,
  HealthResponseSchema,
  type AnalysisResult,
  type HealthResponse,
  type StoredClipRequest,
} from '../../shared/analysis/schema.ts';
import type { ClientError, SelectedClip } from '../types/analysis.ts';

// Browser client for our own API. The Gemini key never reaches the browser.

// Bigger files upload in parallel parts, with retries for failed parts.
const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024;

export type AnalyzeOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: ClientError } | { ok: false; aborted: true };

// Clips up to the direct limit are posted to /api/analyze as before. Larger
// clips are uploaded straight to private Blob storage (with a token from
// /api/upload), then /api/analyze reads them from there and deletes them.
export async function analyzeClip(
  clip: SelectedClip,
  accessCode: string,
  signal: AbortSignal,
  onUploadProgress?: (percent: number) => void,
): Promise<AnalyzeOutcome> {
  const codeHeader: Record<string, string> = accessCode.trim() ? { 'X-Access-Code': accessCode.trim() } : {};
  const { startSeconds, endSeconds } = clip.window;

  let request: RequestInit;
  let url: string;
  if (clip.file.size <= ANALYSIS_LIMITS.maxClipBytes) {
    url = `/api/analyze?start=${startSeconds}&end=${endSeconds}`;
    request = { method: 'POST', headers: { 'Content-Type': clip.type, ...codeHeader }, body: clip.file, signal };
  } else {
    const pathname = storedClipPathname(crypto.randomUUID(), clip.type);
    try {
      // Loaded only when needed, so small clips never download the upload code.
      const { upload } = await import('@vercel/blob/client');
      await upload(pathname, clip.file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
        headers: codeHeader,
        contentType: clip.type,
        multipart: clip.file.size > MULTIPART_THRESHOLD_BYTES,
        abortSignal: signal,
        onUploadProgress: ({ percentage }) => onUploadProgress?.(Math.round(percentage)),
      });
    } catch {
      if (signal.aborted) return { ok: false, aborted: true };
      return {
        ok: false,
        error: {
          code: 'upload_failed',
          message: "Couldn't upload your clip. Check your connection and access code, then try again.",
        },
      };
    }
    url = '/api/analyze';
    const body: StoredClipRequest = { pathname, window: clip.window };
    request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...codeHeader },
      body: JSON.stringify(body),
      signal,
    };
  }

  let response: Response;
  try {
    response = await fetch(url, request);
  } catch {
    if (signal.aborted) return { ok: false, aborted: true };
    return { ok: false, error: { code: 'network', message: "Couldn't reach the analysis server. Check your connection." } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (signal.aborted) return { ok: false, aborted: true };
    return { ok: false, error: { code: 'bad_response', message: `The server sent an unexpected response (${response.status}).` } };
  }

  const parsed = AnalyzeResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: { code: 'bad_response', message: 'The server sent a response in an unexpected format.' } };
  }
  return parsed.data.ok ? { ok: true, result: parsed.data.result } : { ok: false, error: parsed.data.error };
}

export async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  try {
    const response = await fetch('/api/health', { signal });
    const parsed = HealthResponseSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to the unreachable state below.
  }
  return {
    liveAnalysisAvailable: false,
    reason: "Can't reach the analysis server.",
    accessCodeRequired: false,
    largeUploadsAvailable: false,
  };
}
