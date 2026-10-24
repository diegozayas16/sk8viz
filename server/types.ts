import type { AnalysisErrorCode, AnalysisResult } from '../shared/analysis/schema.ts';

export interface ClipInput {
  bytes: Uint8Array;
  mimeType: string;
  signal: AbortSignal;
}

// `detail` is for server logs only and must not contain secrets or payload data.
// `model` is the model that produced the outcome (the fallback, if it was used).
export type AnalyzerOutcome =
  | { ok: true; result: AnalysisResult; tokens?: number; model?: string }
  | { ok: false; code: AnalysisErrorCode; detail: string; retryAfterSeconds?: number; tokens?: number; model?: string };

export type ClipAnalyzer = (input: ClipInput) => Promise<AnalyzerOutcome>;
