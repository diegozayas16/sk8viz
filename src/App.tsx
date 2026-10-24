import { ArrowRight, Loader2, Upload, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AccessCodeField } from './components/AccessCodeField.tsx';
import { AnalysisError } from './components/AnalysisError.tsx';
import { AnalysisResultCard } from './components/AnalysisResultCard.tsx';
import { CameraRecorder } from './components/CameraRecorder.tsx';
import { ClipPicker } from './components/ClipPicker.tsx';
import { HowItWorks } from './components/HowItWorks.tsx';
import { SegmentedControl } from './components/SegmentedControl.tsx';
import { useAnalysis } from './hooks/useAnalysis.ts';
import { useClipSelection } from './hooks/useClipSelection.ts';
import { useLiveAvailability } from './hooks/useLiveAvailability.ts';

type ClipSource = 'upload' | 'record';

const SOURCE_OPTIONS = [
  { value: 'upload', label: 'Upload clip', Icon: Upload },
  { value: 'record', label: 'Record', Icon: Video },
] as const;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

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

  // On phones the result appears below the fold, so bring it into view.
  const resultsRef = useRef<HTMLDivElement>(null);
  const finished = analysis.state.status === 'success' || analysis.state.status === 'error';
  useEffect(() => {
    if (!finished) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [finished, analysis.state]);

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
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
          <p className="display text-[28px] leading-none">
            Sk8<span className="text-accent">viz</span>
          </p>
          <button
            type="button"
            onClick={showExample}
            disabled={analyzing}
            className={`min-h-11 font-mono text-xs uppercase tracking-[0.08em] underline-offset-4 hover:underline disabled:opacity-50 ${FOCUS}`}
          >
            See an example
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 pb-24 sm:px-8">
        <section className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8 pt-10 sm:gap-8 sm:pb-14 sm:pt-16">
          <h1 className="display flex-[1_1_480px] text-[clamp(4.25rem,9vw,8.25rem)]">
            Film it.
            <br />
            Send it.
            <br />
            <span className="text-accent">Fix it.</span>
          </h1>
          <p className="max-w-sm flex-[0_1_22rem] text-[17px] leading-relaxed text-body sm:text-lg">
            Upload a short clip of a trick. Sk8viz breaks it down into setup, pop, flight and landing, then tells you
            what to work on next.
          </p>
        </section>

        <HowItWorks />

        {liveUnavailable && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border border-edge p-4 text-sm">
            <span className="text-body">Live analysis is unavailable: {health.reason}</span>
            <button
              type="button"
              onClick={showExample}
              disabled={analyzing}
              className={`min-h-11 border border-edge px-4 font-semibold hover:border-ink ${FOCUS}`}
            >
              See an example
            </button>
          </div>
        )}

        <div className="grid gap-12 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <section className="flex min-w-0 flex-col gap-5" aria-labelledby="clip-heading">
            <h2 id="clip-heading" className="eyebrow">
              Your clip
            </h2>
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

            {needsCode && <AccessCodeField value={accessCode} onChange={setAccessCode} disabled={analyzing} />}

            <button
              type="button"
              disabled={!canAnalyze}
              onClick={() => void analysis.run('live', clip, accessCode)}
              className={`display mt-1 flex min-h-15 items-center justify-between bg-accent px-5 text-[22px] leading-none text-ground font-stretch-condensed transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-raised disabled:text-dim ${FOCUS}`}
            >
              {analyzing ? 'Analyzing…' : 'Analyze clip'}
              {analyzing ? (
                <Loader2 aria-hidden="true" className="size-6 animate-spin" />
              ) : (
                <ArrowRight aria-hidden="true" strokeWidth={2.5} className="size-6" />
              )}
            </button>
            <p className="text-[13px] leading-relaxed text-dim">
              When you click Analyze, your clip is sent to Google's Gemini API for AI processing. Sk8viz does not store
              it.
            </p>
            <button
              type="button"
              onClick={showExample}
              disabled={analyzing}
              className={`min-h-11 self-start text-left text-[15px] underline underline-offset-4 hover:text-white disabled:opacity-50 ${FOCUS}`}
            >
              Not ready to film? See an example of the feedback
            </button>
          </section>

          <div ref={resultsRef} aria-live="polite" className="min-w-0 scroll-mt-6">
            {analyzing && <p className="sr-only">Analyzing your clip. This can take up to a minute.</p>}
            {analysis.state.status === 'success' && (
              <AnalysisResultCard result={analysis.state.result} mode={analysis.state.mode} />
            )}
            {analysis.state.status === 'error' && (
              <AnalysisError error={analysis.state.error} onUseDemo={showExample} />
            )}
            {(analysis.state.status === 'idle' || analyzing) && (
              <div className="hidden min-h-80 flex-col justify-between border border-dashed border-line p-8 lg:flex">
                <p className="eyebrow">{analyzing ? 'Reviewing your clip…' : 'Feedback'}</p>
                <p aria-hidden="true" className="display text-[56px] text-line">
                  Setup
                  <br />
                  Pop
                  <br />
                  Flight
                  <br />
                  Landing
                </p>
                <p className="max-w-sm text-sm text-dim">
                  {analyzing
                    ? 'This can take up to a minute.'
                    : 'Your breakdown and coaching tips show up here after you analyze a clip.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
