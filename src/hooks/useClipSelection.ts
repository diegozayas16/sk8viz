import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYSIS_LIMITS, isAcceptedVideoType, type AcceptedVideoType } from '../../shared/analysis/limits.ts';
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

function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const done = (value: number | null) => {
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

export function useClipSelection() {
  const [state, setState] = useState<ClipSelectionState>({ status: 'empty' });
  const urlRef = useRef<string | null>(null);
  const tokenRef = useRef(0);

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
      if (!file) return setState({ status: 'empty' });

      const type = resolveType(file);
      if (!type) return setState({ status: 'invalid', message: 'Choose an MP4, WebM, or MOV video file.' });
      if (file.size > ANALYSIS_LIMITS.maxClipBytes) {
        const maxMb = ANALYSIS_LIMITS.maxClipBytes / 1024 / 1024;
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
      if (duration > ANALYSIS_LIMITS.maxClipSeconds) {
        URL.revokeObjectURL(url);
        return setState({
          status: 'invalid',
          message: `That clip is ${Math.round(duration)} seconds. Trim it to ${ANALYSIS_LIMITS.maxClipSeconds} seconds or less.`,
        });
      }

      urlRef.current = url;
      setState({ status: 'ready', clip: { file, type, previewUrl: url, durationSeconds: duration } });
    },
    [releaseUrl],
  );

  return { state, select };
}
