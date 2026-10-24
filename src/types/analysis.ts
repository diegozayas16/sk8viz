import type { AcceptedVideoType } from '../../shared/analysis/limits.ts';
import type { AnalysisErrorCode, AnalysisResult } from '../../shared/analysis/schema.ts';

export type AnalysisMode = 'live' | 'demo';

export interface SelectedClip {
  file: File;
  type: AcceptedVideoType;
  previewUrl: string;
  durationSeconds: number;
}

export interface ClientError {
  code: AnalysisErrorCode | 'network' | 'bad_response' | 'no_clip';
  message: string;
  retryAfterSeconds?: number;
}

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing'; mode: AnalysisMode }
  | { status: 'success'; mode: AnalysisMode; result: AnalysisResult }
  | { status: 'error'; error: ClientError };
