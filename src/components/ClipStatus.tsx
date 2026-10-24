import { Loader2 } from 'lucide-react';
import type { ClipSelectionState } from '../hooks/useClipSelection.ts';

// Checking / invalid / preview states for the selected clip, shared by the
// upload and record views.
export function ClipStatus({ state }: { state: ClipSelectionState }) {
  if (state.status === 'checking') {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-400" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Checking {state.fileName}…
      </p>
    );
  }
  if (state.status === 'invalid') {
    return (
      <p className="text-sm text-red-400" role="alert">
        {state.message}
      </p>
    );
  }
  if (state.status === 'ready') {
    return (
      <figure className="space-y-2">
        <video src={state.clip.previewUrl} controls muted playsInline className="aspect-video w-full rounded-xl bg-black" />
        <figcaption className="text-sm text-zinc-400">
          {state.clip.file.name} · {state.clip.durationSeconds.toFixed(1)} s ·{' '}
          {(state.clip.file.size / 1024 / 1024).toFixed(1)} MB
        </figcaption>
      </figure>
    );
  }
  return null;
}
