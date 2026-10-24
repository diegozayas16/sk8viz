import { z } from 'zod';
import type { AnalysisResult } from '../shared/analysis/schema.ts';

// Expected observations for one evaluation clip. Every field is optional;
// only the fields given are checked. Coaching wording is never compared.
export const EvalCaseSchema = z.object({
  file: z.string().min(1),
  notes: z.string().default(''),
  expect: z
    .object({
      verdict: z.enum(['analyzed', 'insufficient_evidence']).optional(),
      // Matched case-insensitively as a substring of the model's trick name,
      // so "kickflip" matches "Kickflip". Use "none" to expect no trick name.
      trick: z.string().min(1).optional(),
      landed: z.enum(['yes', 'no', 'unclear']).optional(),
    })
    .default({}),
});

export const EvalCasesSchema = z.array(EvalCaseSchema);

export type EvalCase = z.infer<typeof EvalCaseSchema>;

export interface Check {
  field: 'verdict' | 'trick' | 'landed';
  expected: string;
  actual: string;
  pass: boolean;
}

export function compareResult(expect: EvalCase['expect'], result: AnalysisResult): Check[] {
  const checks: Check[] = [];
  if (expect.verdict) {
    checks.push({
      field: 'verdict',
      expected: expect.verdict,
      actual: result.verdict,
      pass: result.verdict === expect.verdict,
    });
  }
  if (expect.trick) {
    const actual = result.trick.name ?? 'none';
    const wanted = expect.trick.trim().toLowerCase();
    const pass = wanted === 'none' ? result.trick.name === null : actual.toLowerCase().includes(wanted);
    checks.push({ field: 'trick', expected: expect.trick, actual, pass });
  }
  if (expect.landed) {
    checks.push({
      field: 'landed',
      expected: expect.landed,
      actual: result.trick.landed,
      pass: result.trick.landed === expect.landed,
    });
  }
  return checks;
}
