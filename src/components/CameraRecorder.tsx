import { Camera, Circle, Loader2, RotateCcw, Square, SwitchCamera, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import type { ClipSelectionState } from '../hooks/useClipSelection.ts';
import { useCameraRecorder } from '../hooks/useCameraRecorder.ts';
import { ClipStatus } from './ClipStatus.tsx';
import { CornerMarks } from './CornerMarks.tsx';

interface CameraRecorderProps {
  clipState: ClipSelectionState;
  onRecorded: (file: File, durationSeconds: number) => void;
  disabled?: boolean;
}

const BUTTON =
  'flex min-h-14 items-center justify-center gap-2 px-4 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50';
const RECORD_BUTTON = `${BUTTON} display flex-1 bg-rec text-xl leading-none text-white font-stretch-condensed hover:bg-[#ff5a50]`;
const QUIET_BUTTON = `${BUTTON} border border-edge hover:border-ink`;

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
      <p className="flex items-center gap-2 border border-line bg-surface p-5 text-sm text-body" role="status">
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
        <div className="relative overflow-hidden border border-line bg-black">
          <CornerMarks />
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
              className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 bg-ground/80 px-2.5 py-1 font-mono text-[13px] tabular-nums"
              role="timer"
            >
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-rec" />
              {formatClock(elapsed)} / {formatClock(ANALYSIS_LIMITS.maxClipSeconds)}
            </p>
          )}
        </div>
        <p className="sr-only" role="status">
          {recording ? 'Recording started.' : 'Camera is on. Press Record when ready.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {recording ? (
            <button type="button" onClick={camera.stop} className={RECORD_BUTTON}>
              <Square aria-hidden="true" className="size-4 fill-current" />
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={camera.record}
                disabled={disabled}
                className={RECORD_BUTTON}
              >
                <Circle aria-hidden="true" className="size-4 fill-current" />
                Record
              </button>
              <button type="button" onClick={camera.flip} className={QUIET_BUTTON}>
                <SwitchCamera aria-hidden="true" className="size-4" />
                <span className="sr-only sm:not-sr-only">Flip camera</span>
              </button>
              <button type="button" onClick={camera.close} className={QUIET_BUTTON}>
                <X aria-hidden="true" className="size-4" />
                <span className="sr-only sm:not-sr-only">Cancel</span>
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-muted">
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
        <p className="border border-danger/60 p-3 text-sm text-danger" role="alert">
          {camera.state.message}
        </p>
      )}
      <ClipStatus state={clipState} />
      <button
        type="button"
        onClick={camera.start}
        disabled={disabled}
        className={`${BUTTON} w-full ${hasClip ? 'border border-edge hover:border-ink' : 'display relative aspect-[4/3] flex-col gap-3 border border-edge bg-surface text-[26px] font-stretch-condensed hover:border-ink sm:aspect-[16/10]'}`}
      >
        {!hasClip && <CornerMarks className="border-accent" />}
        {hasClip ? (
          <RotateCcw aria-hidden="true" className="size-5" />
        ) : (
          <Camera aria-hidden="true" strokeWidth={1.5} className="size-10" />
        )}
        {hasClip ? 'Record again' : camera.state.status === 'error' ? 'Try the camera again' : 'Start camera'}
      </button>
      {!hasClip && (
        <p className="text-sm text-muted">
          Your browser will ask to use the camera. The video stays on your device until you click Analyze.
        </p>
      )}
    </div>
  );
}
