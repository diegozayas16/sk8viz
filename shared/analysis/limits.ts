// Central resource limits for clip analysis. Shared by the browser (early,
// friendly rejection) and the server (actual enforcement).
//
// Inline video sent to Gemini must keep the whole request under ~20 MB, and
// base64 encoding inflates bytes by ~4/3, so raw clips are capped at 12 MB.
// These values are starting points to revisit once hosting is chosen.

export const ANALYSIS_LIMITS = {
  maxClipBytes: 12 * 1024 * 1024,
  // Checked in the browser from video metadata; the server cannot verify
  // duration without decoding the file.
  maxClipSeconds: 30,
  // Frames per second Gemini samples from the clip (provider default is 1,
  // max 24). Tricks happen in under a second, so 1 fps misses the pop and
  // flight. Token cost grows linearly with this value.
  videoSampleFps: 8,
  analysisTimeoutMs: 60_000,
  // No automatic server-side retries: a timed-out request may still be
  // processed (and billed) by the provider.
  maxProviderRetries: 0,
  perClientWindowMs: 10 * 60_000,
  perClientMaxRequests: 5,
  maxActivePerClient: 1,
  maxGlobalConcurrent: 2,
  maxDailyAnalyses: 100,
} as const;

// Browser-reported type -> type sent to Gemini.
export const ACCEPTED_VIDEO_TYPES = {
  'video/mp4': 'video/mp4',
  'video/webm': 'video/webm',
  'video/quicktime': 'video/mov',
} as const satisfies Record<string, string>;

export type AcceptedVideoType = keyof typeof ACCEPTED_VIDEO_TYPES;

export function isAcceptedVideoType(type: string): type is AcceptedVideoType {
  return Object.hasOwn(ACCEPTED_VIDEO_TYPES, type);
}
