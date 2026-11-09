import { ApiError, FileState, FinishReason, GoogleGenAI, type Part } from '@google/genai';
import { toGeminiResponseSchema } from '../../shared/analysis/geminiSchema.ts';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import { AnalysisResultSchema, type ClipWindow } from '../../shared/analysis/schema.ts';
import type { AnalyzerOutcome, ClipAnalyzer } from '../types.ts';
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

// Gemini reads offsets as protobuf durations, e.g. "1.5s".
function offset(seconds: number): string {
  return `${Number(seconds.toFixed(3))}s`;
}

function videoMetadata(window: ClipWindow | undefined) {
  return {
    fps: ANALYSIS_LIMITS.videoSampleFps,
    ...(window && { startOffset: offset(window.startSeconds), endOffset: offset(window.endSeconds) }),
  };
}

// How often to check whether Gemini has finished processing an uploaded file.
const FILE_POLL_MS = 1000;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Maps an SDK error to an outcome the handler understands.
function providerFailure(error: unknown, signal: AbortSignal, model: string): AnalyzerOutcome {
  // Aborting stops waiting on the client side only; the provider may
  // still finish (and bill) the request.
  if (signal.aborted) return { ok: false, code: 'timeout', detail: 'aborted', model };
  if (error instanceof ApiError) {
    const detail = `provider ${error.status}`;
    if (isDailyQuota(error)) return { ok: false, code: 'quota_exceeded', detail: `${detail} (daily quota)`, model };
    if (error.status === 429 || error.status === 503) {
      return { ok: false, code: 'busy', detail, retryAfterSeconds: 30, model };
    }
    if (error.status === 401 || error.status === 403) return { ok: false, code: 'server_misconfigured', detail, model };
    return { ok: false, code: 'provider_error', detail, model };
  }
  // Logged only, never returned to the client. The SDK sends the API key in
  // a header, so error messages do not contain it.
  const reason = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : 'unknown';
  return { ok: false, code: 'provider_error', detail: `request failed (${reason})`, model };
}

export function createGeminiAnalyzer(apiKey: string, model: string, fallbackModel: string | null): ClipAnalyzer {
  // The SDK retries up to 5 times by default, which can silently outlast the
  // analysis timeout and duplicate billed work. Use our own retry limit.
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 + ANALYSIS_LIMITS.maxProviderRetries } },
  });
  const responseJsonSchema = toGeminiResponseSchema();

  // Clips up to the direct limit go inline (as before). Larger ones go through
  // the Files API, since inline requests are limited to about 20 MB in total.
  // Uploaded files are deleted after the analysis; Google also removes them
  // automatically after 48 hours.
  const prepareVideo = async (
    bytes: Uint8Array,
    mimeType: string,
    window: ClipWindow | undefined,
    signal: AbortSignal,
  ): Promise<{ part: Part; fileName: string | null }> => {
    if (bytes.byteLength <= ANALYSIS_LIMITS.maxClipBytes) {
      return {
        part: { inlineData: { mimeType, data: Buffer.from(bytes).toString('base64') }, videoMetadata: videoMetadata(window) },
        fileName: null,
      };
    }
    let file = await ai.files.upload({
      file: new Blob([new Uint8Array(bytes)], { type: mimeType }),
      config: { mimeType, abortSignal: signal },
    });
    const fileName = file.name ?? null;
    try {
      while (file.state === FileState.PROCESSING && fileName) {
        await wait(FILE_POLL_MS, signal);
        file = await ai.files.get({ name: fileName, config: { abortSignal: signal } });
      }
      if (file.state === FileState.FAILED || !file.uri) throw new Error(`file processing ${file.state ?? 'unknown'}`);
    } catch (error) {
      if (fileName) await ai.files.delete({ name: fileName }).catch(() => {});
      throw error;
    }
    return { part: { fileData: { fileUri: file.uri, mimeType }, videoMetadata: videoMetadata(window) }, fileName };
  };

  async function analyze(videoPart: Part, signal: AbortSignal): Promise<AnalyzerOutcome> {
    const generate = (modelId: string) =>
      ai.models.generateContent({
        model: modelId,
        contents: [{ role: 'user', parts: [{ text: USER_PROMPT }, videoPart] }],
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
      return providerFailure(error, signal, usedModel);
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
  }

  return async ({ bytes, mimeType, signal, window }) => {
    let video;
    try {
      video = await prepareVideo(bytes, mimeType, window, signal);
    } catch (error) {
      return providerFailure(error, signal, model);
    }

    try {
      return await analyze(video.part, signal);
    } finally {
      if (video.fileName) await ai.files.delete({ name: video.fileName }).catch(() => {});
    }
  };
}
