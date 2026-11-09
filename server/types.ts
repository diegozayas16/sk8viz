import type { AnalysisErrorCode, AnalysisResult, ClipWindow } from '../shared/analysis/schema.ts';

export interface ClipInput {
  bytes: Uint8Array;
  mimeType: string;
  signal: AbortSignal;
  // Only this part of the clip is analyzed. Omitted: the whole clip.
  window?: ClipWindow;
}

// `detail` is for server logs only and must not contain secrets or payload data.
// `model` is the model that produced the outcome (the fallback, if it was used).
export type AnalyzerOutcome =
  | { ok: true; result: AnalysisResult; tokens?: number; model?: string }
  | { ok: false; code: AnalysisErrorCode; detail: string; retryAfterSeconds?: number; tokens?: number; model?: string };

export type ClipAnalyzer = (input: ClipInput) => Promise<AnalyzerOutcome>;

export type StoredClipRead =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; reason: 'not_found' | 'too_large' | 'empty' | 'unavailable' };

// Temporary storage for clips over the direct upload limit (Vercel Blob in
// production, a fake in tests).
export interface ClipStore {
  read(pathname: string, maxBytes: number, signal: AbortSignal): Promise<StoredClipRead>;
  delete(pathname: string): Promise<void>;
}
