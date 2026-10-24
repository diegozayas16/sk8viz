// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraRecorder } from './useCameraRecorder.ts';

// Fake camera streams: each track records whether it was stopped.
interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
}
const streams: { tracks: FakeTrack[] }[] = [];
function fakeStream() {
  const stream = { tracks: [{ stop: vi.fn() }] };
  streams.push(stream);
  return { getTracks: () => stream.tracks } as unknown as MediaStream;
}

// Minimal MediaRecorder: stop() emits one chunk, then fires onstop.
class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type.startsWith('video/webm');
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['video-bytes'], { type: 'video/webm' }) });
    this.onstop?.();
  }
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  streams.length = 0;
  getUserMedia = vi.fn(async () => fakeStream());
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const allTracksStopped = (index: number) => streams[index]?.tracks.every((t) => t.stop.mock.calls.length > 0);

async function startCamera(hook: { current: ReturnType<typeof useCameraRecorder> }) {
  await act(async () => hook.current.start());
}

describe('useCameraRecorder', () => {
  it('does not touch the camera until start is called', () => {
    renderHook(() => useCameraRecorder(vi.fn()));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('stops the camera when the component unmounts', async () => {
    const { result: hook, unmount } = renderHook(() => useCameraRecorder(vi.fn()));
    await startCamera(hook);
    expect(hook.current.state.status).toBe('ready');
    unmount();
    expect(allTracksStopped(0)).toBe(true);
  });

  it('delivers the recording and releases the camera when recording stops', async () => {
    const onRecorded = vi.fn();
    const { result: hook } = renderHook(() => useCameraRecorder(onRecorded));
    await startCamera(hook);
    act(() => hook.current.record());
    expect(hook.current.state.status).toBe('recording');
    act(() => hook.current.stop());

    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [file] = onRecorded.mock.calls[0] as [File, number];
    expect(file.type).toBe('video/webm');
    expect(hook.current.state.status).toBe('off');
    expect(allTracksStopped(0)).toBe(true);
  });

  it('discards the recording when cancelled mid-recording', async () => {
    const onRecorded = vi.fn();
    const { result: hook } = renderHook(() => useCameraRecorder(onRecorded));
    await startCamera(hook);
    act(() => hook.current.record());
    act(() => hook.current.close());
    expect(onRecorded).not.toHaveBeenCalled();
    expect(allTracksStopped(0)).toBe(true);
  });

  it('stops a camera that finishes starting after the view was closed', async () => {
    let finishStart: (stream: MediaStream) => void = () => {};
    getUserMedia.mockImplementationOnce(() => new Promise((resolve) => (finishStart = resolve)));
    const { result: hook } = renderHook(() => useCameraRecorder(vi.fn()));
    act(() => hook.current.start());
    act(() => hook.current.close());
    await act(async () => finishStart(fakeStream()));
    expect(allTracksStopped(0)).toBe(true);
    expect(hook.current.state.status).toBe('off');
  });

  it('releases the old camera when flipping', async () => {
    const { result: hook } = renderHook(() => useCameraRecorder(vi.fn()));
    await startCamera(hook);
    await act(async () => hook.current.flip());
    expect(allTracksStopped(0)).toBe(true);
    expect(hook.current.facing).toBe('user');
    expect(hook.current.state.status).toBe('ready');
  });

  it('explains a blocked camera permission', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const { result: hook } = renderHook(() => useCameraRecorder(vi.fn()));
    await startCamera(hook);
    expect(hook.current.state).toMatchObject({ status: 'error', message: expect.stringMatching(/blocked/) });
  });
});
