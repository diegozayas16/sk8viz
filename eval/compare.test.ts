import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../shared/analysis/schema.ts';
import { compareResult, EvalCasesSchema } from './compare.ts';

const result = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
  observations: [],
  trick: { name: 'Kickflip', landed: 'no', confidence: 'medium' },
  verdict: 'analyzed',
  summary: 'Nice try!',
  tips: [],
  insufficientEvidenceReason: null,
  ...overrides,
});

describe('compareResult', () => {
  it('passes matching fields, case-insensitively for trick names', () => {
    const checks = compareResult({ verdict: 'analyzed', trick: 'kickflip', landed: 'no' }, result());
    expect(checks.map((c) => c.pass)).toEqual([true, true, true]);
  });

  it('fails a wrong trick or landing', () => {
    const checks = compareResult({ trick: 'ollie', landed: 'yes' }, result());
    expect(checks.map((c) => c.pass)).toEqual([false, false]);
  });

  it('supports expecting no trick name', () => {
    const none = result({ trick: { name: null, landed: 'unclear', confidence: 'low' } });
    expect(compareResult({ trick: 'none' }, none)[0]?.pass).toBe(true);
    expect(compareResult({ trick: 'none' }, result())[0]?.pass).toBe(false);
  });

  it('checks only the fields that were given', () => {
    expect(compareResult({}, result())).toEqual([]);
  });
});

describe('EvalCasesSchema', () => {
  it('accepts the committed cases file shape and rejects bad values', () => {
    expect(EvalCasesSchema.safeParse([{ file: 'a.mp4', expect: { landed: 'yes' } }]).success).toBe(true);
    expect(EvalCasesSchema.safeParse([{ file: 'a.mp4', expect: { landed: 'maybe' } }]).success).toBe(false);
  });
});
