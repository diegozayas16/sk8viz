import type { AnalysisResult } from '../../shared/analysis/schema.ts';

// Deterministic sample output for visual development and tests. Always shown
// with the demo label; never substituted for a failed live analysis.

export const DEMO_RESULT: AnalysisResult = {
  verdict: 'analyzed',
  summary:
    'A skater rolls toward the camera on flat ground and attempts a kickflip. The board flips fully, and the skater catches it with both feet but lands with weight on the heels.',
  trick: { name: 'Kickflip', landed: 'yes', confidence: 'medium' },
  observations: [
    { phase: 'setup', detail: 'Front foot is angled across the board just behind the front bolts.', timestampSeconds: 0.8 },
    { phase: 'pop', detail: 'Strong tail pop; the flick comes off the heel-side edge of the nose.', timestampSeconds: 1.6 },
    { phase: 'flight', detail: 'Board completes one full rotation slightly behind the skater.', timestampSeconds: 1.9 },
    { phase: 'landing', detail: 'Lands with shoulders leaning back and a short wobble before rolling away.', timestampSeconds: 2.3 },
  ],
  tips: [
    { focus: 'Shoulders', suggestion: 'Keep shoulders level and over the board through the flick so the board stays under you.' },
    { focus: 'Flick direction', suggestion: 'Flick forward and out, not just sideways, to bring the board up in front of your feet.' },
    { focus: 'Landing', suggestion: 'Bend your knees more on impact and aim to land over the bolts to cut the wobble.' },
  ],
  insufficientEvidenceReason: null,
};
