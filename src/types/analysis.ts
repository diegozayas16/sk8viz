import type { AcceptedVideoType } from '../../shared/analysis/limits.ts';
import type { AnalysisErrorCode, AnalysisResult, ClipWindow } from '../../shared/analysis/schema.ts';

export type AnalysisMode = 'live' | 'demo';

export interface SelectedClip {
  file: File;
  type: AcceptedVideoType;
  previewUrl: string;
  durationSeconds: number;
  // The part the user trimmed to; only this is analyzed.
  window: ClipWindow;
}

export interface ClientError {
  code: AnalysisErrorCode | 'network' | 'bad_response' | 'no_clip' | 'upload_failed';
  message: string;
  retryAfterSeconds?: number;
}

export type AnalysisState =
  | { status: 'idle' }
  // uploadPercent is set while a large clip uploads to storage.
  | { status: 'analyzing'; mode: AnalysisMode; uploadPercent?: number }
  | { status: 'success'; mode: AnalysisMode; result: AnalysisResult }
  | { status: 'error'; error: ClientError };
