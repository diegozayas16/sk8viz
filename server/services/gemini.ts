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

// 503 (overloaded) and 429 (rate or quota limit, which Google applies per
// model) mean the request was not processed, so trying the fallback model
// once does not duplicate billed work.
function shouldFallBack(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 503 || error.status === 429);
}

// Free-tier keys hit per-day request quotas (e.g. 20/day per model). Google
// names the exhausted quota in the error message.
function isDailyQuota(error: ApiError): boolean {
  return error.status === 429 && /PerDay/.test(error.message);
}

export function createGeminiAnalyzer(apiKey: string, model: string, fallbackModel: string | null): ClipAnalyzer {
  // The SDK retries up to 5 times by default, which can silently outlast the
  // analysis timeout and duplicate billed work. Use our own retry limit.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 + ANALYSIS_LIMITS.maxProviderRetries } },
  });
  const responseJsonSchema = toGeminiResponseSchema();

  return async ({ bytes, mimeType, signal }) => {
    const video = Buffer.from(bytes).toString('base64');
    const generate = (modelId: string) =>
      ai.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: USER_PROMPT },
              {
                inlineData: { mimeType, data: video },
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

    let usedModel = model;
    let response;
    try {
      try {
        response = await generate(model);
      } catch (error) {
        if (!fallbackModel || signal.aborted || !shouldFallBack(error)) throw error;
        usedModel = fallbackModel;
        response = await generate(fallbackModel);
      }
    } catch (error) {
      // Aborting stops waiting on the client side only; the provider may
      // still finish (and bill) the request.
      if (signal.aborted) return { ok: false, code: 'timeout', detail: 'aborted', model: usedModel };
      if (error instanceof ApiError) {
        const detail = `provider ${error.status}`;
        if (isDailyQuota(error)) {
          return { ok: false, code: 'quota_exceeded', detail: `${detail} (daily quota)`, model: usedModel };
        }
        if (error.status === 429 || error.status === 503) {
          return { ok: false, code: 'busy', detail, retryAfterSeconds: 30, model: usedModel };
        }
        if (error.status === 401 || error.status === 403) {
          return { ok: false, code: 'server_misconfigured', detail, model: usedModel };
        }
        return { ok: false, code: 'provider_error', detail, model: usedModel };
      }
      // Logged only, never returned to the client. The SDK sends the API key in
      // a header, so error messages do not contain it.
      const reason = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : 'unknown';
      return { ok: false, code: 'provider_error', detail: `request failed (${reason})`, model: usedModel };
    }

    const tokens = response.usageMetadata?.totalTokenCount;
    const meta = { tokens, model: usedModel };

    if (response.promptFeedback?.blockReason) {
      return { ok: false, code: 'content_blocked', detail: `prompt ${response.promptFeedback.blockReason}`, ...meta };
    }
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
      return { ok: false, code: 'content_blocked', detail: `finish ${finishReason}`, ...meta };
    }

    const text = response.text;
    if (!text) return { ok: false, code: 'invalid_model_output', detail: `empty (${finishReason ?? 'none'})`, ...meta };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, code: 'invalid_model_output', detail: `unparseable (${finishReason ?? 'none'})`, ...meta };
    }

    const validated = AnalysisResultSchema.safeParse(parsed);
    if (!validated.success) {
      // Field paths only, so logs never contain model output.
      const fields = [...new Set(validated.error.issues.map((issue) => issue.path.join('.') || '(root)'))].join(', ');
      return { ok: false, code: 'invalid_model_output', detail: `schema mismatch at ${fields}`.slice(0, 200), ...meta };
    }

    return { ok: true, result: validated.data, ...meta };
  };
}
