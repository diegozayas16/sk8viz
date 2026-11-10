import { z } from 'zod';
import { ANALYSIS_LIMITS, STORED_CLIP_PATHNAME } from './limits.ts';

// Contract for one coaching analysis. The same schema validates the model's
// output on the server and the API response in the browser.
//
// Field order matters: the model generates fields in this order, so it
// records what it saw before it names the trick or judges the evidence.

export const TrickPhaseSchema = z.enum(['setup', 'pop', 'flight', 'landing', 'general']);

export const AnalysisResultSchema = z
  .object({
    observations: z
      .array(
        z.object({
          phase: TrickPhaseSchema,
          detail: z.string().min(1).max(400),
          timestampSeconds: z.number().min(0).max(120).nullable(),
        }),
      )
      .max(8)
      .describe('Visible facts in time order, including any obstacle and what the board touches.'),
    trick: z.object({
      name: z.string().min(1).max(80).nullable().describe('Trick name, or null if it cannot be identified.'),
      landed: z.enum(['yes', 'no', 'unclear']),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
    verdict: z
      .enum(['analyzed', 'insufficient_evidence'])
      .describe('Use insufficient_evidence when the footage does not clearly show skateboarding.'),
    summary: z.string().min(1).max(600).describe('Two or three sentences describing what is visible.'),
    tips: z
      .array(
        z.object({
          focus: z.string().min(1).max(80),
          suggestion: z.string().min(1).max(400),
        }),
      )
      .max(5),
    insufficientEvidenceReason: z
      .string()
      .min(1)
      .max(300)
      .nullable()
      .describe('Required when verdict is insufficient_evidence, otherwise null.'),
  })
  .superRefine((value, ctx) => {
    if (value.verdict === 'insufficient_evidence' && value.insufficientEvidenceReason === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['insufficientEvidenceReason'],
        message: 'A reason is required when evidence is insufficient.',
      });
    }
  });

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type TrickPhase = z.infer<typeof TrickPhaseSchema>;

export const AnalysisErrorCodeSchema = z.enum([
  'invalid_request',
  'unsupported_media',
  'payload_too_large',
  'rate_limited',
  'busy',
  'quota_exceeded',
  'daily_limit_reached',
  'sign_in_required',
  'analysis_disabled',
  'timeout',
  'content_blocked',
  'invalid_model_output',
  'provider_error',
  'server_misconfigured',
]);

export type AnalysisErrorCode = z.infer<typeof AnalysisErrorCodeSchema>;

export const AnalysisErrorSchema = z.object({
  code: AnalysisErrorCodeSchema,
  message: z.string(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type AnalysisError = z.infer<typeof AnalysisErrorSchema>;

export const AnalyzeResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestId: z.string(), result: AnalysisResultSchema }),
  z.object({ ok: z.literal(false), requestId: z.string(), error: AnalysisErrorSchema }),
]);

export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const HealthResponseSchema = z.object({
  liveAnalysisAvailable: z.boolean(),
  reason: z.string().nullable(),
  // True when live analysis needs a signed-in user.
  signInRequired: z.boolean(),
  // True when clips over the direct limit can go through Vercel Blob.
  largeUploadsAvailable: z.boolean(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// The part of the clip to analyze, in seconds from the start. The server
// cannot read a video's duration without decoding it, so it enforces the
// window length instead: Gemini only processes this stretch.
export const ClipWindowSchema = z
  .object({
    startSeconds: z.number().finite().min(0).max(24 * 60 * 60),
    endSeconds: z.number().finite().min(0).max(24 * 60 * 60),
  })
  .refine((w) => w.endSeconds - w.startSeconds >= ANALYSIS_LIMITS.minWindowSeconds - 0.001, {
    message: `The analyzed part must be at least ${ANALYSIS_LIMITS.minWindowSeconds} second long.`,
  })
  .refine((w) => w.endSeconds - w.startSeconds <= ANALYSIS_LIMITS.maxWindowSeconds + 0.001, {
    message: `The analyzed part can be at most ${ANALYSIS_LIMITS.maxWindowSeconds} seconds long.`,
  });

export type ClipWindow = z.infer<typeof ClipWindowSchema>;

// JSON body of /api/analyze for a clip already uploaded to Blob storage.
export const StoredClipRequestSchema = z.object({
  pathname: z.string().regex(STORED_CLIP_PATHNAME),
  window: ClipWindowSchema,
});

export type StoredClipRequest = z.infer<typeof StoredClipRequestSchema>;
