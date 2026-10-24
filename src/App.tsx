import { FlaskConical, Loader2, Sparkles, Upload, Video } from 'lucide-react';
import { useState } from 'react';
import { AccessCodeField } from './components/AccessCodeField.tsx';
import { AnalysisError } from './components/AnalysisError.tsx';
import { AnalysisResultCard } from './components/AnalysisResultCard.tsx';
import { CameraRecorder } from './components/CameraRecorder.tsx';
import { ClipPicker } from './components/ClipPicker.tsx';
import { SegmentedControl } from './components/SegmentedControl.tsx';
import { useAnalysis } from './hooks/useAnalysis.ts';
import { useClipSelection } from './hooks/useClipSelection.ts';
import { useLiveAvailability } from './hooks/useLiveAvailability.ts';

type ClipSource = 'upload' | 'record';

const SOURCE_OPTIONS = [
  { value: 'upload', label: 'Upload clip', Icon: Upload },
  { value: 'record', label: 'Record', Icon: Video },
] as const;

export default function App() {
  const [source, setSource] = useState<ClipSource>('upload');
  const [accessCode, setAccessCode] = useState('');
  const clipSelection = useClipSelection();
  const analysis = useAnalysis();
  const health = useLiveAvailability();

  const clip = clipSelection.state.status === 'ready' ? clipSelection.state.clip : null;
  const analyzing = analysis.state.status === 'analyzing';
  const liveUnavailable = health !== null && !health.liveAnalysisAvailable;
  const needsCode = health?.liveAnalysisAvailable === true && health.accessCodeRequired;
  const canAnalyze =
    !analyzing && clip !== null && health?.liveAnalysisAvailable === true && (!needsCode || accessCode.trim() !== '');

  // Demo data is only ever shown on an explicit tap, always with its label.
  const showExample = () => void analysis.run('demo', null);

  const selectClip = (file: File | null, knownDurationSeconds?: number) => {
    analysis.reset();
    void clipSelection.select(file, knownDurationSeconds);
  };

  // Each source starts fresh so an uploaded clip never shows on the record tab.
  const changeSource = (next: ClipSource) => {
    selectClip(null);
    setSource(next);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Sk8<span className="text-lime-400">viz</span>
        </h1>
        <p className="text-sm text-zinc-400">AI coaching feedback for your skate clips</p>
      </header>

      {liveUnavailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-900 p-4 text-sm">
          <span className="text-zinc-300">Live analysis is unavailable: {health.reason}</span>
          <button
            type="button"
            onClick={showExample}
            disabled={analyzing}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 font-medium hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-lime-400"
          >
            See an example
          </button>
        </div>
      )}

      <section className="space-y-3" aria-label="Your clip">
        <SegmentedControl
          legend="Clip source"
          name="clip-source"
          value={source}
          options={SOURCE_OPTIONS}
          onChange={changeSource}
          disabled={analyzing}
        />
        {source === 'upload' ? (
          <ClipPicker state={clipSelection.state} onSelect={selectClip} disabled={analyzing} />
        ) : (
          <CameraRecorder clipState={clipSelection.state} onRecorded={selectClip} disabled={analyzing} />
        )}
      </section>

      {needsCode && <AccessCodeField value={accessCode} onChange={setAccessCode} disabled={analyzing} />}

      <div className="space-y-2">
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={() => void analysis.run('live', clip, accessCode)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-3 font-bold text-zinc-950 transition hover:bg-lime-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? (
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" className="size-5" />
          )}
          {analyzing ? 'Analyzing…' : 'Analyze clip'}
        </button>
        <p className="text-xs text-zinc-500">
          When you click Analyze, your clip is sent to Google's Gemini API for AI processing. Sk8viz does not store it.
        </p>
        <button
          type="button"
          onClick={showExample}
          disabled={analyzing}
          className="flex items-center gap-1.5 rounded text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline focus-visible:outline-2 focus-visible:outline-lime-400 disabled:opacity-50"
        >
          <FlaskConical aria-hidden="true" className="size-4" />
          Not ready to film? See an example of the feedback
        </button>
      </div>

      <div aria-live="polite" className="space-y-4">
        {analyzing && <p className="sr-only">Analyzing your clip. This can take up to a minute.</p>}
        {analysis.state.status === 'success' && (
          <AnalysisResultCard result={analysis.state.result} mode={analysis.state.mode} />
        )}
        {analysis.state.status === 'error' && (
          <AnalysisError error={analysis.state.error} onUseDemo={showExample} />
        )}
      </div>
    </div>
  );
}
