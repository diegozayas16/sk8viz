import { Camera, Circle, Loader2, RotateCcw, Square, SwitchCamera, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import type { ClipSelectionState } from '../hooks/useClipSelection.ts';
import { useCameraRecorder } from '../hooks/useCameraRecorder.ts';
import { ClipStatus } from './ClipStatus.tsx';

interface CameraRecorderProps {
  clipState: ClipSelectionState;
  onRecorded: (file: File, durationSeconds: number) => void;
  disabled?: boolean;
}

const BUTTON =
  'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:cursor-not-allowed disabled:opacity-50';

function formatClock(seconds: number) {
  const whole = Math.floor(seconds);
  return `0:${String(whole).padStart(2, '0')}`;
}

export function CameraRecorder({ clipState, onRecorded, disabled }: CameraRecorderProps) {
  const camera = useCameraRecorder(onRecorded);
  const videoRef = useRef<HTMLVideoElement>(null);
  const live = camera.state.status === 'ready' || camera.state.status === 'recording';

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera.stream;
  }, [camera.stream, live]);

  if (camera.state.status === 'starting') {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-zinc-900 p-5 text-sm text-zinc-300" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Starting camera… allow camera access if your browser asks.
      </p>
    );
  }

  if (live) {
    const recording = camera.state.status === 'recording';
    const elapsed = camera.state.status === 'recording' ? camera.state.elapsedSeconds : 0;
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Camera preview"
            className={`aspect-video w-full object-cover ${camera.facing === 'user' ? '-scale-x-100' : ''}`}
          />
          {recording && (
            <p
              className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold tabular-nums"
              role="timer"
            >
              <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-red-500" />
              {formatClock(elapsed)} / {formatClock(ANALYSIS_LIMITS.maxClipSeconds)}
            </p>
          )}
        </div>
        <p className="sr-only" role="status">
          {recording ? 'Recording started.' : 'Camera is on. Press Record when ready.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {recording ? (
            <button type="button" onClick={camera.stop} className={`${BUTTON} flex-1 bg-red-500 text-white hover:bg-red-400`}>
              <Square aria-hidden="true" className="size-4 fill-current" />
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={camera.record}
                disabled={disabled}
                className={`${BUTTON} flex-1 bg-red-500 text-white hover:bg-red-400`}
              >
                <Circle aria-hidden="true" className="size-4 fill-current" />
                Record
              </button>
              <button type="button" onClick={camera.flip} className={`${BUTTON} bg-zinc-800 hover:bg-zinc-700`}>
                <SwitchCamera aria-hidden="true" className="size-4" />
                <span className="sr-only sm:not-sr-only">Flip camera</span>
              </button>
              <button type="button" onClick={camera.close} className={`${BUTTON} bg-zinc-800 hover:bg-zinc-700`}>
                <X aria-hidden="true" className="size-4" />
                <span className="sr-only sm:not-sr-only">Cancel</span>
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Recording stops automatically at {ANALYSIS_LIMITS.maxClipSeconds} seconds. Point the camera so your whole body
          and board stay in frame.
        </p>
      </div>
    );
  }

  const hasClip = clipState.status === 'ready';
  return (
    <div className="space-y-3">
      {camera.state.status === 'error' && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
          {camera.state.message}
        </p>
      )}
      <ClipStatus state={clipState} />
      <button
        type="button"
        onClick={camera.start}
        disabled={disabled}
        className={`${BUTTON} w-full ${hasClip ? 'bg-zinc-800 hover:bg-zinc-700' : 'border-2 border-dashed border-zinc-700 bg-transparent py-5 hover:border-lime-400'}`}
      >
        {hasClip ? <RotateCcw aria-hidden="true" className="size-5" /> : <Camera aria-hidden="true" className="size-6 text-lime-400" />}
        {hasClip ? 'Record again' : camera.state.status === 'error' ? 'Try the camera again' : 'Start camera'}
      </button>
      {!hasClip && (
        <p className="text-xs text-zinc-500">
          Your browser will ask to use the camera. The video stays on your device until you click Analyze.
        </p>
      )}
    </div>
  );
}
