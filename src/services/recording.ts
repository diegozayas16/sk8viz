import { ANALYSIS_LIMITS, type AcceptedVideoType } from '../../shared/analysis/limits.ts';

// Browser camera recording settings and helpers. Pure functions so they can be
// tested without a camera.

// ~0.9 Mbps keeps a full 30-second clip near 3.4 MB, under the 4 MB upload limit.
export const RECORDING_BITS_PER_SECOND = 900_000;

// Stop early if the recording gets close to the upload limit.
export const RECORDING_STOP_BYTES = Math.floor(ANALYSIS_LIMITS.maxClipBytes * 0.9);

export const CAMERA_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
} as const;

export interface RecordingFormat {
  // Passed to MediaRecorder; may include codecs.
  recorderType: string;
  // Sent as the upload Content-Type.
  fileType: AcceptedVideoType;
  extension: string;
}

// MP4 first (Safari and newer Chrome), then WebM (Chrome, Firefox).
const CANDIDATES: RecordingFormat[] = [
  { recorderType: 'video/mp4;codecs=avc1', fileType: 'video/mp4', extension: 'mp4' },
  { recorderType: 'video/mp4', fileType: 'video/mp4', extension: 'mp4' },
  { recorderType: 'video/webm;codecs=vp9', fileType: 'video/webm', extension: 'webm' },
  { recorderType: 'video/webm;codecs=vp8', fileType: 'video/webm', extension: 'webm' },
  { recorderType: 'video/webm', fileType: 'video/webm', extension: 'webm' },
];

export function pickRecordingFormat(isTypeSupported: (type: string) => boolean): RecordingFormat | null {
  return CANDIDATES.find((format) => isTypeSupported(format.recorderType)) ?? null;
}

export const RECORDING_UNSUPPORTED_MESSAGE =
  "This browser can't record video. Try Chrome or Safari, or upload a clip instead.";

// Turns getUserMedia / MediaRecorder failures into actionable messages.
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. You can upload a clip instead.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy or unavailable. Close other apps using it and try again.';
    default:
      return "Couldn't start the camera. Try again, or upload a clip instead.";
  }
}
