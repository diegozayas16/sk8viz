import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { AnalysisError } from './components/AnalysisError.tsx';
import { AnalysisResultCard } from './components/AnalysisResultCard.tsx';
import { ClipPicker } from './components/ClipPicker.tsx';
import { ModeToggle } from './components/ModeToggle.tsx';
import { useAnalysis } from './hooks/useAnalysis.ts';
import { useClipSelection } from './hooks/useClipSelection.ts';
import { useLiveAvailability } from './hooks/useLiveAvailability.ts';
import type { AnalysisMode } from './types/analysis.ts';

export default function App() {
  const [mode, setMode] = useState<AnalysisMode>('live');
  const clipSelection = useClipSelection();
  const analysis = useAnalysis();
  const health = useLiveAvailability();

  const clip = clipSelection.state.status === 'ready' ? clipSelection.state.clip : null;
  const analyzing = analysis.state.status === 'analyzing';
  const liveUnavailable = health !== null && !health.liveAnalysisAvailable;
  const canAnalyze = !analyzing && (mode === 'demo' || (clip !== null && health?.liveAnalysisAvailable === true));

  const changeMode = (next: AnalysisMode) => {
    analysis.reset();
    setMode(next);
  };

  const selectClip = (file: File | null) => {
    analysis.reset();
    void clipSelection.select(file);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Sk8<span className="text-lime-400">viz</span>
          </h1>
          <p className="text-sm text-zinc-400">AI coaching feedback for your skate clips</p>
        </div>
        <ModeToggle mode={mode} onChange={changeMode} disabled={analyzing} />
      </header>

      {mode === 'live' && liveUnavailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-900 p-4 text-sm">
          <span className="text-zinc-300">Live analysis is unavailable: {health.reason}</span>
          <button
            type="button"
            onClick={() => changeMode('demo')}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 font-medium hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-lime-400"
          >
            Switch to demo mode
          </button>
        </div>
      )}

      <ClipPicker state={clipSelection.state} onSelect={selectClip} disabled={analyzing} />

      <div className="space-y-2">
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={() => void analysis.run(mode, clip)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-3 font-bold text-zinc-950 transition hover:bg-lime-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? (
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" className="size-5" />
          )}
          {analyzing ? 'Analyzing…' : mode === 'demo' ? 'Show demo analysis' : 'Analyze clip'}
        </button>
        <p className="text-xs text-zinc-500">
          {mode === 'live'
            ? "When you click Analyze, your clip is sent to Google's Gemini API for AI processing. Sk8viz does not store it."
            : 'Demo mode shows fixed sample feedback. Nothing is uploaded.'}
        </p>
      </div>

      <div aria-live="polite" className="space-y-4">
        {analyzing && <p className="sr-only">Analyzing your clip. This can take up to a minute.</p>}
        {analysis.state.status === 'success' && (
          <AnalysisResultCard result={analysis.state.result} mode={analysis.state.mode} />
        )}
        {analysis.state.status === 'error' && (
          <AnalysisError error={analysis.state.error} onUseDemo={() => changeMode('demo')} />
        )}
      </div>
    </div>
  );
}
