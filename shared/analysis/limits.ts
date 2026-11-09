// Central resource limits for clip analysis. Shared by the browser (early,
// friendly rejection) and the server (actual enforcement).
//
// Vercel Functions reject request bodies over 4.5 MB, so clips sent straight
// to /api/analyze are capped at 4 MB. Larger clips go from the browser to
// Vercel Blob storage first (see /api/upload), and the server reads them from
// there. They are deleted right after analysis.

export const ANALYSIS_LIMITS = {
  // Largest clip sent directly in the analyze request (and inline to Gemini).
  maxClipBytes: 4 * 1024 * 1024,
  // Largest clip uploaded through Vercel Blob. Gemini gets these through its
  // Files API, which accepts up to 2 GB.
  maxLargeClipBytes: 100 * 1024 * 1024,
  // Longest stretch of a clip Gemini analyzes. Users trim to this window; the
  // server enforces it and sends it to Gemini as start/end offsets, so the
  // rest of the clip is never processed (cost grows with seconds analyzed,
  // not file size).
  maxWindowSeconds: 60,
  minWindowSeconds: 1,
  // In-browser recordings stop here so they always fit the direct 4 MB path.
  maxRecordingSeconds: 30,
  // Frames per second Gemini samples from the clip (provider default is 1,
  // max 24). Tricks happen in under a second, so 1 fps misses the pop and
  // flight. Token cost grows linearly with this value.
  videoSampleFps: 8,
  // Covers reading a stored clip, Gemini's file processing, and the analysis.
  // vercel.json gives api/analyze.ts a longer maxDuration than this.
  analysisTimeoutMs: 120_000,
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
  slotLeaseMs: 4 * 60_000,
  // Backup cleanup: Vercel deletes any stored clip after this many days, even
  // if the analysis never ran (for example, the visitor closed the tab).
  storedClipTtlDays: 1,
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

const EXTENSIONS: Record<AcceptedVideoType, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

// Stored clips live under clips/<random UUID>.<ext>. The server only reads,
// issues upload tokens for, and deletes pathnames of exactly this shape.
export const STORED_CLIP_PATHNAME = /^clips\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|mov)$/;

export function storedClipPathname(id: string, type: AcceptedVideoType): string {
  return `clips/${id}.${EXTENSIONS[type]}`;
}
