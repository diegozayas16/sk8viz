import type { AnalysisResult } from '../../shared/analysis/schema.ts';

// Deterministic sample output for visual development and tests. Always shown
// with the demo label; never substituted for a failed live analysis.

export const DEMO_RESULT: AnalysisResult = {
  verdict: 'analyzed',
  summary:
    'Nice work — I saw you commit to that kickflip and get the board all the way around! You caught it with both feet and rode away. Your weight drifted onto your heels on the landing, which is a really common thing to tighten up next.',
  trick: { name: 'Kickflip', landed: 'yes', confidence: 'medium' },
  observations: [
    { phase: 'setup', detail: 'You set your front foot at a good angle just behind the front bolts.', timestampSeconds: 0.8 },
    { phase: 'pop', detail: 'You got a strong snap on the tail, and your flick came off the edge of the nose.', timestampSeconds: 1.6 },
    { phase: 'flight', detail: 'The board did a full rotation, just slightly behind you.', timestampSeconds: 1.9 },
    { phase: 'landing', detail: 'You landed with your shoulders leaning back and had a little wobble, but you stayed on and rolled away.', timestampSeconds: 2.3 },
  ],
  tips: [
    { focus: 'Shoulders', suggestion: 'Next time, try keeping your shoulders level and over the board as you flick. It helps the board stay right under you.' },
    { focus: 'Flick direction', suggestion: 'Try flicking forward and out, not just sideways. That brings the board up in front of your feet where it is easier to catch.' },
    { focus: 'Landing', suggestion: 'Bend your knees a bit more when you land and aim for the bolts. That will smooth out the wobble — you are close!' },
  ],
  insufficientEvidenceReason: null,
};
