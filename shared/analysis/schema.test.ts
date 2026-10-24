import { describe, expect, it } from 'vitest';
import { toGeminiResponseSchema } from './geminiSchema.ts';
import { AnalysisResultSchema } from './schema.ts';

const validResult = {
  verdict: 'analyzed',
  summary: 'A skater attempts an ollie on flat ground.',
  trick: { name: 'Ollie', landed: 'yes', confidence: 'medium' },
  observations: [{ phase: 'pop', detail: 'Tail hits the ground with a clear snap.', timestampSeconds: 1.2 }],
  tips: [{ focus: 'Front foot', suggestion: 'Slide the front foot higher to level the board.' }],
  insufficientEvidenceReason: null,
};

describe('AnalysisResultSchema', () => {
  it('accepts a valid result', () => {
    expect(AnalysisResultSchema.safeParse(validResult).success).toBe(true);
  });

  it('requires a reason when evidence is insufficient', () => {
    const result = AnalysisResultSchema.safeParse({ ...validResult, verdict: 'insufficient_evidence' });
    expect(result.success).toBe(false);
  });

  it('rejects values outside allowed enums and ranges', () => {
    expect(AnalysisResultSchema.safeParse({ ...validResult, trick: { ...validResult.trick, landed: 'maybe' } }).success).toBe(false);
    expect(
      AnalysisResultSchema.safeParse({
        ...validResult,
        observations: [{ ...validResult.observations[0], timestampSeconds: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe('toGeminiResponseSchema', () => {
  it('keeps structure and drops unsupported keywords', () => {
    const schema = toGeminiResponseSchema();
    const json = JSON.stringify(schema);
    expect(json).not.toContain('minLength');
    expect(json).not.toContain('maxLength');
    expect(json).not.toContain('$schema');
    expect(json).toContain('insufficientEvidenceReason');
    expect(json).toContain('"required"');
  });
});
