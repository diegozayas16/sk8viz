// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult } from '../../shared/analysis/schema.ts';
import type { AnalyzeOutcome } from '../services/analysisClient.ts';
import { DEMO_RESULT } from '../services/demoFixture.ts';
import type { SelectedClip } from '../types/analysis.ts';
import { useAnalysis } from './useAnalysis.ts';

// Each analyzeClip call returns a promise the test resolves by hand, so the
// order in which responses arrive can be controlled.
type Progress = (percent: number) => void;
const pending: { resolve: (outcome: AnalyzeOutcome) => void; signal: AbortSignal; progress?: Progress }[] = [];
const analyzeClip = vi.fn(
  (_clip: SelectedClip, _code: string, signal: AbortSignal, progress?: Progress) =>
    new Promise<AnalyzeOutcome>((resolve) => pending.push({ resolve, signal, progress })),
);
vi.mock('../services/analysisClient.ts', () => ({
  analyzeClip: (clip: SelectedClip, code: string, signal: AbortSignal, progress?: Progress) =>
    analyzeClip(clip, code, signal, progress),
}));

const clip = (name: string): SelectedClip => ({
  file: new File(['x'], name, { type: 'video/mp4' }),
  type: 'video/mp4',
  previewUrl: `blob:${name}`,
  durationSeconds: 3,
  window: { startSeconds: 0, endSeconds: 3 },
});

const result = (summary: string): AnalysisResult => ({ ...DEMO_RESULT, summary });

beforeEach(() => {
  pending.length = 0;
  analyzeClip.mockClear();
});

describe('useAnalysis', () => {
  it('ignores a late response for an older clip after reset', async () => {
    const { result: hook } = renderHook(() => useAnalysis());

    act(() => void hook.current.run('live', clip('old.mp4')));
    act(() => hook.current.reset());
    act(() => void hook.current.run('live', clip('new.mp4')));
    expect(pending).toHaveLength(2);
    expect(pending[0]?.signal.aborted).toBe(true);

    await act(async () => pending[1]?.resolve({ ok: true, result: result('new clip') }));
    await act(async () => pending[0]?.resolve({ ok: true, result: result('old clip') }));

    expect(hook.current.state).toMatchObject({ status: 'success', mode: 'live', result: { summary: 'new clip' } });
  });

  it('does not send a second request while one is in flight', () => {
    const { result: hook } = renderHook(() => useAnalysis());
    act(() => void hook.current.run('live', clip('a.mp4')));
    act(() => void hook.current.run('live', clip('a.mp4')));
    expect(analyzeClip).toHaveBeenCalledTimes(1);
    expect(hook.current.state.status).toBe('analyzing');
  });

  it('aborts the request when the component unmounts', () => {
    const { result: hook, unmount } = renderHook(() => useAnalysis());
    act(() => void hook.current.run('live', clip('a.mp4')));
    unmount();
    expect(pending[0]?.signal.aborted).toBe(true);
  });

  it('keeps demo results labeled as demo and never calls the API', () => {
    const { result: hook } = renderHook(() => useAnalysis());
    act(() => void hook.current.run('demo', null));
    expect(hook.current.state).toMatchObject({ status: 'success', mode: 'demo', result: DEMO_RESULT });
    expect(analyzeClip).not.toHaveBeenCalled();
  });

  it('shows live errors instead of substituting demo data', async () => {
    const { result: hook } = renderHook(() => useAnalysis());
    act(() => void hook.current.run('live', clip('a.mp4')));
    await act(async () => pending[0]?.resolve({ ok: false, error: { code: 'busy', message: 'Busy' } }));
    expect(hook.current.state).toEqual({ status: 'error', error: { code: 'busy', message: 'Busy' } });
  });

  it('shows upload progress, but not from an older request', async () => {
    const { result: hook } = renderHook(() => useAnalysis());
    act(() => void hook.current.run('live', clip('old.mp4')));
    act(() => pending[0]?.progress?.(40));
    expect(hook.current.state).toEqual({ status: 'analyzing', mode: 'live', uploadPercent: 40 });

    act(() => hook.current.reset());
    act(() => void hook.current.run('live', clip('new.mp4')));
    act(() => pending[0]?.progress?.(90));
    expect(hook.current.state).toEqual({ status: 'analyzing', mode: 'live' });
  });

  it('ignores upload progress that arrives after the result', async () => {
    const { result: hook } = renderHook(() => useAnalysis());
    act(() => void hook.current.run('live', clip('a.mp4')));
    await act(async () => pending[0]?.resolve({ ok: true, result: result('done') }));
    act(() => pending[0]?.progress?.(100));
    expect(hook.current.state).toMatchObject({ status: 'success', result: { summary: 'done' } });
  });
});
