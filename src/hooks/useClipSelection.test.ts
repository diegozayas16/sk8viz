// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import { probeDuration, useClipSelection } from './useClipSelection.ts';

const SMALL = ANALYSIS_LIMITS.maxClipBytes;
const LARGE = ANALYSIS_LIMITS.maxLargeClipBytes;

// A File whose reported size can exceed what the test actually allocates.
function fakeFile(name: string, type: string, size = 1000) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

// Stand-in for the <video> element probeDuration creates, so tests decide
// what metadata the "browser" reports and when.
interface FakeVideo {
  duration: number;
  currentTime: number;
  preload: string;
  src: string;
  onloadedmetadata: (() => void) | null;
  ondurationchange: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute: () => void;
  load: () => void;
}
let videos: FakeVideo[] = [];

beforeEach(() => {
  videos = [];
  let next = 0;
  URL.createObjectURL = vi.fn(() => `blob:clip-${++next}`);
  URL.revokeObjectURL = vi.fn();
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'video') return create(tag);
    const video: FakeVideo = {
      duration: NaN,
      currentTime: 0,
      preload: '',
      src: '',
      onloadedmetadata: null,
      ondurationchange: null,
      onerror: null,
      removeAttribute: () => {},
      load: () => {},
    };
    videos.push(video);
    return video as unknown as HTMLElement;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useClipSelection edge cases', () => {
  it('explains each kind of unusable file', async () => {
    const { result } = renderHook(() => useClipSelection(LARGE));
    const cases: [File, number | undefined, RegExp][] = [
      [fakeFile('notes.txt', 'text/plain'), undefined, /MP4, WebM, or MOV/],
      [fakeFile('empty.mp4', 'video/mp4', 0), undefined, /empty/],
      [fakeFile('huge.mp4', 'video/mp4', LARGE + 1), undefined, /limit is 100 MB/],
      [fakeFile('blip.webm', 'video/webm'), 0.4, /under 1 second/],
    ];
    for (const [file, duration, message] of cases) {
      await act(() => result.current.select(file, duration));
      expect(result.current.state).toMatchObject({ status: 'invalid', message: expect.stringMatching(message) });
    }
  });

  it('accepts .mov files whose browser type is blank', async () => {
    const { result } = renderHook(() => useClipSelection());
    await act(() => result.current.select(fakeFile('iphone.MOV', ''), 5));
    expect(result.current.state).toMatchObject({ status: 'ready', clip: { type: 'video/quicktime' } });
  });

  it('starts long clips with the first 60 s selected', async () => {
    const { result } = renderHook(() => useClipSelection(LARGE));
    await act(() => result.current.select(fakeFile('session.mp4', 'video/mp4'), 300));
    expect(result.current.state).toMatchObject({
      status: 'ready',
      clip: { window: { startSeconds: 0, endSeconds: ANALYSIS_LIMITS.maxWindowSeconds } },
    });
  });

  it('re-checks a big file once the larger limit arrives from the server', async () => {
    const { result, rerender } = renderHook(({ max }) => useClipSelection(max), { initialProps: { max: SMALL } });
    await act(() => result.current.select(fakeFile('phone.mp4', 'video/mp4', 20 * 1024 * 1024), 12));
    expect(result.current.state).toMatchObject({ status: 'invalid', message: expect.stringMatching(/limit is 4 MB/) });

    await act(async () => rerender({ max: LARGE }));
    expect(result.current.state).toMatchObject({ status: 'ready', clip: { file: { name: 'phone.mp4' } } });
  });

  it('does not bring back a rejected file after the user picked another one', async () => {
    const { result, rerender } = renderHook(({ max }) => useClipSelection(max), { initialProps: { max: SMALL } });
    await act(() => result.current.select(fakeFile('big.mp4', 'video/mp4', 20 * 1024 * 1024), 12));
    await act(() => result.current.select(fakeFile('small.mp4', 'video/mp4'), 4));
    await act(async () => rerender({ max: LARGE }));
    expect(result.current.state).toMatchObject({ status: 'ready', clip: { file: { name: 'small.mp4' } } });
  });

  it('keeps the newest clip when the user switches files mid-check', async () => {
    const { result } = renderHook(() => useClipSelection());
    let first!: Promise<void>;
    act(() => {
      first = result.current.select(fakeFile('first.mp4', 'video/mp4'));
    });
    await act(() => result.current.select(fakeFile('second.mp4', 'video/mp4'), 6));
    videos[0]!.duration = 9;
    await act(async () => {
      videos[0]!.onloadedmetadata?.();
      await first;
    });
    expect(result.current.state).toMatchObject({ status: 'ready', clip: { file: { name: 'second.mp4' }, durationSeconds: 6 } });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clip-1');
  });

  it('keeps the trim window valid however the sliders are dragged', async () => {
    const { result } = renderHook(() => useClipSelection());
    await act(() => result.current.select(fakeFile('a.mp4', 'video/mp4'), 20));
    act(() => result.current.setWindow({ startSeconds: 25, endSeconds: 20 }, 'start'));
    expect(result.current.state).toMatchObject({ clip: { window: { startSeconds: 19, endSeconds: 20 } } });
    act(() => result.current.setWindow({ startSeconds: 19, endSeconds: -3 }, 'end'));
    expect(result.current.state).toMatchObject({ clip: { window: { startSeconds: 0, endSeconds: 1 } } });
  });

  it('ignores trim changes when no clip is ready', () => {
    const { result } = renderHook(() => useClipSelection());
    act(() => result.current.setWindow({ startSeconds: 0, endSeconds: 5 }, 'end'));
    expect(result.current.state).toEqual({ status: 'empty' });
  });
});

describe('probeDuration', () => {
  it('reads a normal duration', async () => {
    const probe = probeDuration('blob:a');
    videos[0]!.duration = 7.5;
    videos[0]!.onloadedmetadata?.();
    expect(await probe).toBe(7.5);
  });

  it('finds the real length of Chrome WebM files that report Infinity', async () => {
    const probe = probeDuration('blob:a');
    const video = videos[0]!;
    video.duration = Infinity;
    video.onloadedmetadata?.();
    expect(video.currentTime).toBe(Number.MAX_SAFE_INTEGER);
    video.duration = 12.3;
    video.ondurationchange?.();
    expect(await probe).toBe(12.3);
  });

  it('gives up on unreadable files and on browsers that never answer', async () => {
    const broken = probeDuration('blob:a');
    videos[0]!.onerror?.();
    expect(await broken).toBeNull();

    vi.useFakeTimers();
    const silent = probeDuration('blob:b');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await silent).toBeNull();
  });
});
