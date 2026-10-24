import { describe, expect, it } from 'vitest';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import {
  RECORDING_BITS_PER_SECOND,
  RECORDING_STOP_BYTES,
  cameraErrorMessage,
  pickRecordingFormat,
} from './recording.ts';

describe('pickRecordingFormat', () => {
  it('prefers MP4 when the browser supports it', () => {
    expect(pickRecordingFormat(() => true)).toMatchObject({ fileType: 'video/mp4', extension: 'mp4' });
  });

  it('falls back to WebM and strips codecs from the upload type', () => {
    const format = pickRecordingFormat((type) => type.startsWith('video/webm'));
    expect(format).toMatchObject({ recorderType: 'video/webm;codecs=vp9', fileType: 'video/webm' });
  });

  it('returns null when nothing is supported', () => {
    expect(pickRecordingFormat(() => false)).toBeNull();
  });
});

describe('recording limits', () => {
  it('keeps a full-length recording under the upload limit', () => {
    const fullLengthBytes = (RECORDING_BITS_PER_SECOND / 8) * ANALYSIS_LIMITS.maxClipSeconds;
    expect(fullLengthBytes).toBeLessThan(RECORDING_STOP_BYTES);
    expect(RECORDING_STOP_BYTES).toBeLessThan(ANALYSIS_LIMITS.maxClipBytes);
  });
});

describe('cameraErrorMessage', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name });

  it('explains blocked permissions, missing cameras, and busy cameras', () => {
    expect(cameraErrorMessage(named('NotAllowedError'))).toMatch(/blocked/);
    expect(cameraErrorMessage(named('NotFoundError'))).toMatch(/No camera/);
    expect(cameraErrorMessage(named('NotReadableError'))).toMatch(/busy/);
  });

  it('has a generic fallback', () => {
    expect(cameraErrorMessage('something odd')).toMatch(/Couldn't start the camera/);
  });
});
