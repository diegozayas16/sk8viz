import { FileVideo, Loader2 } from 'lucide-react';
import { useId } from 'react';
import { ANALYSIS_LIMITS } from '../../shared/analysis/limits.ts';
import type { ClipSelectionState } from '../hooks/useClipSelection.ts';

interface ClipPickerProps {
  state: ClipSelectionState;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
}

export function ClipPicker({ state, onSelect, disabled }: ClipPickerProps) {
  const inputId = useId();
  const hintId = useId();
  const maxMb = ANALYSIS_LIMITS.maxClipBytes / 1024 / 1024;

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 p-5 transition hover:border-lime-400 has-[:focus-visible]:border-lime-400 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
      >
        <FileVideo aria-hidden="true" className="size-8 shrink-0 text-lime-400" />
        <span>
          <span className="block font-semibold">Choose a skate clip</span>
          <span id={hintId} className="block text-sm text-zinc-400">
            MP4, WebM, or MOV · up to {ANALYSIS_LIMITS.maxClipSeconds} seconds and {maxMb} MB
          </span>
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

      {state.status === 'checking' && (
        <p className="flex items-center gap-2 text-sm text-zinc-400" role="status">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Checking {state.fileName}…
        </p>
      )}
      {state.status === 'invalid' && (
        <p className="text-sm text-red-400" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <figure className="space-y-2">
          <video
            src={state.clip.previewUrl}
            controls
            muted
            playsInline
            className="aspect-video w-full rounded-xl bg-black"
          />
          <figcaption className="text-sm text-zinc-400">
            {state.clip.file.name} · {state.clip.durationSeconds.toFixed(1)} s ·{' '}
            {(state.clip.file.size / 1024 / 1024).toFixed(1)} MB
          </figcaption>
        </figure>
      )}
    </div>
  );
}
