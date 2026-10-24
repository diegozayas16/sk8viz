import { Upload } from 'lucide-react';
import { useId } from 'react';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import type { ClipSelectionState } from '../hooks/useClipSelection.ts';
import { ClipStatus } from './ClipStatus.tsx';
import { CornerMarks } from './CornerMarks.tsx';

interface ClipPickerProps {
  state: ClipSelectionState;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
}

export function ClipPicker({ state, onSelect, disabled }: ClipPickerProps) {
  const inputId = useId();
  const hintId = useId();
  const maxMb = ANALYSIS_LIMITS.maxClipBytes / 1024 / 1024;
  const hasClip = state.status === 'ready';

  return (
    <div className="flex flex-col gap-3">
      <ClipStatus state={state} />
      <label
        htmlFor={inputId}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 border border-edge bg-surface p-6 text-center transition-colors hover:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
          hasClip ? 'min-h-24' : 'aspect-[4/3] sm:aspect-[16/10]'
        }`}
      >
        {!hasClip && <CornerMarks className="border-accent" />}
        <Upload aria-hidden="true" strokeWidth={1.5} className={hasClip ? 'size-6' : 'size-10'} />
        <span className={`display font-stretch-condensed ${hasClip ? 'text-xl' : 'text-[26px]'}`}>
          {hasClip ? 'Choose a different clip' : 'Choose a skate clip'}
        </span>
        <span id={hintId} className="font-mono text-xs tracking-[0.06em] text-muted">
          MP4 · WEBM · MOV — UP TO {ANALYSIS_LIMITS.maxClipSeconds} S, {maxMb} MB
        </span>
        <input
          id={inputId}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov"
          aria-describedby={hintId}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
        />
      </label>
      {!hasClip && (
        <p className="text-sm text-muted">Short clips at 720p fit best. Keep your whole body and board in frame.</p>
      )}
    </div>
  );
}
