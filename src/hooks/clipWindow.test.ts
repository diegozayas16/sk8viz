import { describe, expect, it } from 'vitest';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import { ClipWindowSchema } from '../../shared/analysis/schema.ts';
import { clampWindow, defaultWindow } from './useClipSelection.ts';

const MAX = ANALYSIS_LIMITS.maxWindowSeconds;

describe('trim window', () => {
  it('defaults to the whole clip, or the first allowed stretch of a long one', () => {
    expect(defaultWindow(12)).toEqual({ startSeconds: 0, endSeconds: 12 });
    expect(defaultWindow(300)).toEqual({ startSeconds: 0, endSeconds: MAX });
  });

  it('drags the end along when the start moves past the max length', () => {
    expect(clampWindow({ startSeconds: 100, endSeconds: 30 }, 300, 'start')).toEqual({ startSeconds: 100, endSeconds: 101 });
    expect(clampWindow({ startSeconds: 10, endSeconds: 200 }, 300, 'start')).toEqual({ startSeconds: 10, endSeconds: 10 + MAX });
  });

  it('drags the start along when the end moves', () => {
    expect(clampWindow({ startSeconds: 0, endSeconds: 200 }, 300, 'end')).toEqual({ startSeconds: 200 - MAX, endSeconds: 200 });
    expect(clampWindow({ startSeconds: 5, endSeconds: 5.2 }, 300, 'end')).toEqual({ startSeconds: 4.2, endSeconds: 5.2 });
  });

  it('stays inside the clip at both edges', () => {
    expect(clampWindow({ startSeconds: 20, endSeconds: 20 }, 20, 'start')).toEqual({ startSeconds: 19, endSeconds: 20 });
    expect(clampWindow({ startSeconds: 0, endSeconds: 0 }, 20, 'end')).toEqual({ startSeconds: 0, endSeconds: 1 });
  });

  it('always produces a window the server accepts', () => {
    for (const [start, end, duration, moved] of [
      [0, 500, 400, 'end'],
      [399, 2, 400, 'start'],
      [3, 3, 3, 'start'],
      [12.3, 80.1, 90, 'end'],
    ] as const) {
      const window = clampWindow({ startSeconds: start, endSeconds: end }, duration, moved);
      expect(ClipWindowSchema.safeParse(window).success).toBe(true);
    }
  });
});
