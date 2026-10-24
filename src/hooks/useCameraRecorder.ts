import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import {
  CAMERA_CONSTRAINTS,
  RECORDING_BITS_PER_SECOND,
  RECORDING_STOP_BYTES,
  RECORDING_UNSUPPORTED_MESSAGE,
  cameraErrorMessage,
  pickRecordingFormat,
} from '../services/recording.ts';

export type CameraFacing = 'environment' | 'user';

export type CameraState =
  | { status: 'off' }
  | { status: 'starting' }
  | { status: 'ready' }
  | { status: 'recording'; elapsedSeconds: number }
  | { status: 'error'; message: string };

type OnRecorded = (file: File, durationSeconds: number) => void;

// Owns the camera stream and MediaRecorder. The camera only starts on an
// explicit start() call, and every exit path stops the tracks and timers.
// Safe under React StrictMode's double mount: stale starts are discarded.
export function useCameraRecorder(onRecorded: OnRecorded) {
  const [state, setState] = useState<CameraState>({ status: 'off' });
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timersRef = useRef<number[]>([]);
  const startTokenRef = useRef(0);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  // Stops everything without delivering a recording. Clearing recorderRef
  // first tells the recorder's onstop handler to discard its data.
  const close = useCallback(() => {
    startTokenRef.current += 1;
    clearTimers();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    releaseCamera();
    setState({ status: 'off' });
  }, [clearTimers, releaseCamera]);

  useEffect(() => close, [close]);

  const start = useCallback(
    async (nextFacing: CameraFacing = facing) => {
      close();
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setState({ status: 'error', message: RECORDING_UNSUPPORTED_MESSAGE });
        return;
      }
      const token = ++startTokenRef.current;
      setFacing(nextFacing);
      setState({ status: 'starting' });
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { ...CAMERA_CONSTRAINTS, facingMode: { ideal: nextFacing } },
          audio: false,
        });
        if (token !== startTokenRef.current) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = media;
        setStream(media);
        setState({ status: 'ready' });
      } catch (error) {
        if (token === startTokenRef.current) setState({ status: 'error', message: cameraErrorMessage(error) });
      }
    },
    [close, facing],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const record = useCallback(() => {
    const media = streamRef.current;
    if (!media || recorderRef.current) return;
    const format = pickRecordingFormat((type) => MediaRecorder.isTypeSupported(type));
    if (!format) {
      close();
      setState({ status: 'error', message: RECORDING_UNSUPPORTED_MESSAGE });
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(media, {
        mimeType: format.recorderType,
        videoBitsPerSecond: RECORDING_BITS_PER_SECOND,
      });
    } catch (error) {
      close();
      setState({ status: 'error', message: cameraErrorMessage(error) });
      return;
    }

    const chunks: Blob[] = [];
    let bytes = 0;
    const startedAt = performance.now();
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      chunks.push(event.data);
      bytes += event.data.size;
      if (bytes >= RECORDING_STOP_BYTES && recorder.state === 'recording') recorder.stop();
    };
    recorder.onerror = () => {
      close();
      setState({ status: 'error', message: "Recording stopped unexpectedly. Try again, or upload a clip instead." });
    };
    recorder.onstop = () => {
      // close() already cleaned up, and a new camera session may be running.
      if (recorderRef.current !== recorder) return;
      clearTimers();
      recorderRef.current = null;
      releaseCamera();
      setState({ status: 'off' });
      if (chunks.length === 0) return;

      const durationSeconds = Math.min((performance.now() - startedAt) / 1000, ANALYSIS_LIMITS.maxClipSeconds);
      const file = new File(chunks, `sk8viz-recording-${Date.now()}.${format.extension}`, { type: format.fileType });
      onRecordedRef.current(file, durationSeconds);
    };

    // Emit data every second so the size check runs during recording.
    recorder.start(1000);
    setState({ status: 'recording', elapsedSeconds: 0 });

    const tick = () => {
      if (recorderRef.current !== recorder) return;
      setState({ status: 'recording', elapsedSeconds: (performance.now() - startedAt) / 1000 });
      timersRef.current.push(window.setTimeout(tick, 250));
    };
    timersRef.current.push(window.setTimeout(tick, 250));
    timersRef.current.push(window.setTimeout(stop, ANALYSIS_LIMITS.maxClipSeconds * 1000));
  }, [clearTimers, close, releaseCamera, stop]);

  const flip = useCallback(() => {
    void start(facing === 'environment' ? 'user' : 'environment');
  }, [facing, start]);

  return { state, stream, facing, start: () => void start(), record, stop, close, flip };
}
