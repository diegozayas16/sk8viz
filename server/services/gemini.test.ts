import { ApiError } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult } from '../../shared/analysis/schema.ts';
import { createGeminiAnalyzer } from './gemini.ts';

// Replaces the SDK client so tests control each generateContent call.
const generateContent = vi.fn();
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const result: AnalysisResult = {
  observations: [],
  trick: { name: 'Ollie', landed: 'yes', confidence: 'high' },
  verdict: 'analyzed',
  summary: 'Nice ollie!',
  tips: [],
  insufficientEvidenceReason: null,
};

const okResponse = { text: JSON.stringify(result), candidates: [{ finishReason: 'STOP' }] };
const input = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'video/mp4', signal: new AbortController().signal });
const modelsCalled = () => generateContent.mock.calls.map(([params]) => (params as { model: string }).model);

beforeEach(() => {
  generateContent.mockReset();
});

describe('createGeminiAnalyzer fallback', () => {
  it('uses the main model when it succeeds', async () => {
    generateContent.mockResolvedValueOnce(okResponse);
    const outcome = await createGeminiAnalyzer('key', 'main', 'backup')(input());
    expect(outcome).toMatchObject({ ok: true, model: 'main' });
    expect(modelsCalled()).toEqual(['main']);
  });

  it('tries the fallback model once when the main model is overloaded', async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: 'overloaded', status: 503 }));
    generateContent.mockResolvedValueOnce(okResponse);
    const outcome = await createGeminiAnalyzer('key', 'main', 'backup')(input());
    expect(outcome).toMatchObject({ ok: true, model: 'backup' });
    expect(modelsCalled()).toEqual(['main', 'backup']);
  });

  it('returns busy without a third attempt when both models are overloaded', async () => {
    generateContent.mockImplementation(async () => {
      throw new ApiError({ message: 'overloaded', status: 503 });
    });
    const outcome = await createGeminiAnalyzer('key', 'main', 'backup')(input());
    expect(outcome).toMatchObject({ ok: false, code: 'busy', model: 'backup' });
    expect(modelsCalled()).toEqual(['main', 'backup']);
  });

  it('falls back when the main model is out of quota', async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: 'quota PerDay exceeded', status: 429 }));
    generateContent.mockResolvedValueOnce(okResponse);
    const outcome = await createGeminiAnalyzer('key', 'main', 'backup')(input());
    expect(outcome).toMatchObject({ ok: true, model: 'backup' });
  });

  it('reports quota_exceeded when both models hit a daily quota, busy for per-minute limits', async () => {
    generateContent.mockImplementation(async () => {
      throw new ApiError({ message: '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}', status: 429 });
    });
    expect(await createGeminiAnalyzer('key', 'main', 'backup')(input())).toMatchObject({ code: 'quota_exceeded' });
    generateContent.mockImplementation(async () => {
      throw new ApiError({ message: '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel"}', status: 429 });
    });
    expect(await createGeminiAnalyzer('key', 'main', 'backup')(input())).toMatchObject({ code: 'busy' });
  });

  it('does not fall back for other errors or when disabled', async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: 'bad request', status: 400 }));
    expect(await createGeminiAnalyzer('key', 'main', 'backup')(input())).toMatchObject({ code: 'provider_error' });
    generateContent.mockRejectedValueOnce(new ApiError({ message: 'overloaded', status: 503 }));
    expect(await createGeminiAnalyzer('key', 'main', null)(input())).toMatchObject({ code: 'busy' });
    expect(modelsCalled()).toEqual(['main', 'main']);
  });
});
