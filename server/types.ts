import type { AnalysisErrorCode, AnalysisResult } from '../shared/analysis/schema.ts';

export interface ClipInput {
  bytes: Uint8Array;
  mimeType: string;
  signal: AbortSignal;
}

// `detail` is for server logs only and must not contain secrets or payload data.
export type AnalyzerOutcome =
  | { ok: true; result: AnalysisResult; tokens?: number }
  | { ok: false; code: AnalysisErrorCode; detail: string; retryAfterSeconds?: number; tokens?: number };

export type ClipAnalyzer = (input: ClipInput) => Promise<AnalyzerOutcome>;
