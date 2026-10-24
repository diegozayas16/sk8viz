// Central resource limits for clip analysis. Shared by the browser (early,
// friendly rejection) and the server (actual enforcement).
//
// Vercel Functions reject request bodies over 4.5 MB, so clips are capped at
// 4 MB. (Gemini's inline video limit, ~20 MB per request, is not the binding
// constraint.) Larger clips would need direct-to-storage uploads.

export const ANALYSIS_LIMITS = {
  maxClipBytes: 4 * 1024 * 1024,
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
  // Analyses per visitor per UTC day, so one person cannot use the whole quota.
  perClientDailyMax: 10,
  // Sized to the Gemini free tier: ~20 requests/day per model, main + fallback.
  // Raise this if billing is enabled on the Gemini key.
  maxDailyAnalyses: 35,
  // How long a concurrency slot is held if a function dies without releasing
  // it. Must exceed the analysis timeout so a live request never loses its slot.
  slotLeaseMs: 2 * 60_000,
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
