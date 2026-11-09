import { Loader2 } from 'lucide-react';
import { useId, useRef } from 'react';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import type { ClipWindow } from '../../shared/analysis/schema.ts';
import type { ClipSelectionState } from '../hooks/useClipSelection.ts';

export type WindowChangeHandler = (next: ClipWindow, moved: 'start' | 'end') => void;

interface ClipStatusProps {
  state: ClipSelectionState;
  onWindowChange?: WindowChangeHandler;
  disabled?: boolean;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

// Checking / invalid / preview states for the selected clip, shared by the
// upload and record views. The preview includes the trim control: only the
// chosen part is analyzed, which is faster, cheaper and usually more accurate.
export function ClipStatus({ state, onWindowChange, disabled }: ClipStatusProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startId = useId();
  const endId = useId();

  if (state.status === 'checking') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Checking {state.fileName}…
      </p>
    );
  }
  if (state.status === 'invalid') {
    return (
      <p className="border border-danger/60 p-3 text-sm text-danger" role="alert">
        {state.message}
      </p>
    );
  }
  if (state.status !== 'ready') return null;

  const { clip } = state;
  const { startSeconds, endSeconds } = clip.window;
  const canTrim = onWindowChange !== undefined && clip.durationSeconds > ANALYSIS_LIMITS.minWindowSeconds;

  const move = (moved: 'start' | 'end', value: number) => {
    onWindowChange?.(
      moved === 'start' ? { startSeconds: value, endSeconds } : { startSeconds, endSeconds: value },
      moved,
    );
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = value;
    }
  };

  // While playing, loop inside the chosen part so the user sees exactly what
  // will be analyzed.
  const keepInWindow = () => {
    const video = videoRef.current;
    if (!video || video.paused || !canTrim) return;
    if (video.currentTime < startSeconds - 0.25 || video.currentTime >= endSeconds) video.currentTime = startSeconds;
  };

  const slider =
    'h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <figure className="flex flex-col gap-2">
      <video
        ref={videoRef}
        src={clip.previewUrl}
        controls
        muted
        playsInline
        onTimeUpdate={keepInWindow}
        className="aspect-video w-full border border-line bg-black"
      />
      <figcaption className="truncate font-mono text-xs text-muted">
        {clip.file.name} · {clip.durationSeconds.toFixed(1)} s · {(clip.file.size / 1024 / 1024).toFixed(1)} MB
      </figcaption>
      {canTrim && (
        <fieldset className="mt-1 flex flex-col gap-1 border border-line p-3" disabled={disabled}>
          <legend className="eyebrow px-1">Trim to the trick</legend>
          <p className="text-sm text-muted">
            Only this part is analyzed (up to {ANALYSIS_LIMITS.maxWindowSeconds} s). A few seconds around the trick
            works best.
          </p>
          <label htmlFor={startId} className="mt-1 flex justify-between font-mono text-xs text-muted">
            <span>Start</span>
            <span>{formatTime(startSeconds)}</span>
          </label>
          <input
            id={startId}
            type="range"
            min={0}
            max={clip.durationSeconds}
            step={0.1}
            value={startSeconds}
            onChange={(event) => move('start', Number(event.target.value))}
            className={slider}
          />
          <label htmlFor={endId} className="flex justify-between font-mono text-xs text-muted">
            <span>End</span>
            <span>{formatTime(endSeconds)}</span>
          </label>
          <input
            id={endId}
            type="range"
            min={0}
            max={clip.durationSeconds}
            step={0.1}
            value={endSeconds}
            onChange={(event) => move('end', Number(event.target.value))}
            className={slider}
          />
          <p className="font-mono text-xs text-ink" aria-live="polite">
            Analyzing {formatTime(startSeconds)} – {formatTime(endSeconds)} ({(endSeconds - startSeconds).toFixed(1)} s)
          </p>
        </fieldset>
      )}
    </figure>
  );
}
