import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYSIS_LIMITS, isAcceptedVideoType, type AcceptedVideoType } from '../../shared/analysis/limits.ts';
import type { ClipWindow } from '../../shared/analysis/schema.ts';
import type { SelectedClip } from '../types/analysis.ts';

export type ClipSelectionState =
  | { status: 'empty' }
  | { status: 'checking'; fileName: string }
  | { status: 'ready'; clip: SelectedClip }
  | { status: 'invalid'; message: string };

const EXTENSION_TYPES: Record<string, AcceptedVideoType> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

// Some browsers report an empty type for .mov files, so fall back to the extension.
function resolveType(file: File): AcceptedVideoType | null {
  if (isAcceptedVideoType(file.type)) return file.type;
  if (file.type) return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? null;
}

// How long to wait for the browser to report a duration before giving up.
const PROBE_TIMEOUT_MS = 8000;

// Reads a video's duration from its metadata. WebM files recorded by Chrome
// (for example, an earlier Sk8viz recording uploaded later) report an
// infinite duration until the browser seeks to the end, so seek far ahead and
// wait for the real value.
export function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), PROBE_TIMEOUT_MS);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return done(video.duration);
      if (video.duration !== Infinity) return done(null);
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration)) done(video.duration);
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

// Starts with the first part of the clip, up to the longest allowed window.
export function defaultWindow(durationSeconds: number): ClipWindow {
  return { startSeconds: 0, endSeconds: Math.min(durationSeconds, ANALYSIS_LIMITS.maxWindowSeconds) };
}

// Keeps a window inside the clip and within the allowed length. `moved` is the
// handle the user dragged; the other handle follows when needed.
export function clampWindow(next: ClipWindow, durationSeconds: number, moved: 'start' | 'end'): ClipWindow {
  const min = Math.min(ANALYSIS_LIMITS.minWindowSeconds, durationSeconds);
  const max = ANALYSIS_LIMITS.maxWindowSeconds;
  let start = Math.min(Math.max(next.startSeconds, 0), durationSeconds);
  let end = Math.min(Math.max(next.endSeconds, 0), durationSeconds);
  if (moved === 'start') {
    start = Math.min(start, durationSeconds - min);
    if (end - start < min) end = start + min;
    if (end - start > max) end = start + max;
  } else {
    end = Math.max(end, min);
    if (end - start < min) start = end - min;
    if (end - start > max) start = end - max;
  }
  return { startSeconds: Math.max(0, start), endSeconds: Math.min(end, durationSeconds) };
}

// maxBytes depends on whether large uploads are available on the server.
export function useClipSelection(maxBytes: number = ANALYSIS_LIMITS.maxClipBytes) {
  const [state, setState] = useState<ClipSelectionState>({ status: 'empty' });
  const urlRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  // A file rejected only for its size, so it can be re-checked if the limit
  // grows (the server's large-upload limit arrives after the page loads).
  const tooLargeRef = useRef<{ file: File; knownDurationSeconds?: number } | null>(null);

  const releaseUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => releaseUrl, [releaseUrl]);

  // knownDurationSeconds skips the metadata probe. Browser recordings need
  // this: Chrome's WebM recordings report an infinite duration.
  const select = useCallback(
    async (file: File | null, knownDurationSeconds?: number) => {
      const token = ++tokenRef.current;
      releaseUrl();
      tooLargeRef.current = null;
      if (!file) return setState({ status: 'empty' });

      const type = resolveType(file);
      if (!type) return setState({ status: 'invalid', message: 'Choose an MP4, WebM, or MOV video file.' });
      if (file.size === 0) return setState({ status: 'invalid', message: 'That file is empty. Choose another clip.' });
      if (file.size > maxBytes) {
        tooLargeRef.current = { file, knownDurationSeconds };
        const maxMb = maxBytes / 1024 / 1024;
        return setState({ status: 'invalid', message: `That clip is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${maxMb} MB.` });
      }

      setState({ status: 'checking', fileName: file.name });
      const url = URL.createObjectURL(file);
      const duration = knownDurationSeconds ?? (await probeDuration(url));
      if (token !== tokenRef.current) return URL.revokeObjectURL(url);

      if (duration === null) {
        URL.revokeObjectURL(url);
        return setState({ status: 'invalid', message: "This browser can't read that video. Try an MP4 file." });
      }
      if (duration < ANALYSIS_LIMITS.minWindowSeconds) {
        URL.revokeObjectURL(url);
        return setState({
          status: 'invalid',
          message: `That clip is under ${ANALYSIS_LIMITS.minWindowSeconds} second long. Record or choose a longer one.`,
        });
      }

      // Longer clips are fine: the user trims them to the analyzed window.
      urlRef.current = url;
      setState({
        status: 'ready',
        clip: { file, type, previewUrl: url, durationSeconds: duration, window: defaultWindow(duration) },
      });
    },
    [releaseUrl, maxBytes],
  );

  // When the limit grows, give a file rejected for size another chance.
  useEffect(() => {
    const rejected = tooLargeRef.current;
    if (rejected && rejected.file.size <= maxBytes) void select(rejected.file, rejected.knownDurationSeconds);
  }, [maxBytes, select]);

  const setWindow = useCallback((next: ClipWindow, moved: 'start' | 'end') => {
    setState((current) =>
      current.status === 'ready'
        ? { status: 'ready', clip: { ...current.clip, window: clampWindow(next, current.clip.durationSeconds, moved) } }
        : current,
    );
  }, []);

  return { state, select, setWindow };
}
