import { AnalyzeResponseSchema, HealthResponseSchema, type AnalysisResult, type HealthResponse } from '../../shared/analysis/schema.ts';
import type { ClientError, SelectedClip } from '../types/analysis.ts';

// Browser client for our own API. The Gemini key never reaches the browser.

export type AnalyzeOutcome = { ok: true; result: AnalysisResult } | { ok: false; error: ClientError } | { ok: false; aborted: true };

export async function analyzeClip(clip: SelectedClip, accessCode: string, signal: AbortSignal): Promise<AnalyzeOutcome> {
  const headers: Record<string, string> = { 'Content-Type': clip.type };
  if (accessCode.trim()) headers['X-Access-Code'] = accessCode.trim();

  let response: Response;
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers,
      body: clip.file,
      signal,
    });
  } catch {
    if (signal.aborted) return { ok: false, aborted: true };
    return { ok: false, error: { code: 'network', message: "Couldn't reach the analysis server. Check your connection." } };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (signal.aborted) return { ok: false, aborted: true };
    return { ok: false, error: { code: 'bad_response', message: `The server sent an unexpected response (${response.status}).` } };
  }

  const parsed = AnalyzeResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: { code: 'bad_response', message: 'The server sent a response in an unexpected format.' } };
  }
  return parsed.data.ok ? { ok: true, result: parsed.data.result } : { ok: false, error: parsed.data.error };
}

export async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  try {
    const response = await fetch('/api/health', { signal });
    const parsed = HealthResponseSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to the unreachable state below.
  }
  return { liveAnalysisAvailable: false, reason: "Can't reach the analysis server.", accessCodeRequired: false };
}
