import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import { toGeminiResponseSchema } from '../../shared/analysis/geminiSchema.ts';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import { AnalysisResultSchema } from '../../shared/analysis/schema.ts';
import type { ClipAnalyzer } from '../types.ts';
import { SYSTEM_INSTRUCTION, USER_PROMPT } from './analysisPrompt.ts';

const BLOCKED_FINISH_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
]);

export function createGeminiAnalyzer(apiKey: string, model: string): ClipAnalyzer {
  // The SDK retries up to 5 times by default, which can silently outlast the
  // analysis timeout and duplicate billed work. Use our own retry limit.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 + ANALYSIS_LIMITS.maxProviderRetries } },
  });
  const responseJsonSchema = toGeminiResponseSchema();

  return async ({ bytes, mimeType, signal }) => {
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: USER_PROMPT },
              {
                inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') },
                videoMetadata: { fps: ANALYSIS_LIMITS.videoSampleFps },
              },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema,
          temperature: 0.2,
          maxOutputTokens: 8192,
          abortSignal: signal,
        },
      });
    } catch (error) {
      // Aborting stops waiting on the client side only; the provider may
      // still finish (and bill) the request.
      if (signal.aborted) return { ok: false, code: 'timeout', detail: 'aborted' };
      if (error instanceof ApiError) {
        if (error.status === 429 || error.status === 503) {
          return { ok: false, code: 'busy', detail: `provider ${error.status}`, retryAfterSeconds: 30 };
        }
        if (error.status === 401 || error.status === 403) {
          return { ok: false, code: 'server_misconfigured', detail: `provider ${error.status}` };
        }
        return { ok: false, code: 'provider_error', detail: `provider ${error.status}` };
      }
      return { ok: false, code: 'provider_error', detail: 'request failed' };
    }

    const tokens = response.usageMetadata?.totalTokenCount;

    if (response.promptFeedback?.blockReason) {
      return { ok: false, code: 'content_blocked', detail: `prompt ${response.promptFeedback.blockReason}`, tokens };
    }
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
      return { ok: false, code: 'content_blocked', detail: `finish ${finishReason}`, tokens };
    }

    const text = response.text;
    if (!text) return { ok: false, code: 'invalid_model_output', detail: `empty (${finishReason ?? 'none'})`, tokens };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, code: 'invalid_model_output', detail: `unparseable (${finishReason ?? 'none'})`, tokens };
    }

    const validated = AnalysisResultSchema.safeParse(parsed);
    if (!validated.success) return { ok: false, code: 'invalid_model_output', detail: 'schema mismatch', tokens };

    return { ok: true, result: validated.data, tokens };
  };
}
