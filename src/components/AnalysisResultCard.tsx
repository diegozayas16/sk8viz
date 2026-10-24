import { CircleAlert, Eye, FlaskConical, Lightbulb } from 'lucide-react';
import type { AnalysisResult } from '../../shared/analysis/schema.ts';
import type { AnalysisMode } from '../types/analysis.ts';

interface AnalysisResultCardProps {
  result: AnalysisResult;
  mode: AnalysisMode;
}

const LANDED_LABEL = { yes: 'Landed', no: 'Not landed', unclear: 'Landing unclear' } as const;

function formatTime(seconds: number | null) {
  return seconds === null ? null : `${seconds.toFixed(1)}s`;
}

export function AnalysisResultCard({ result, mode }: AnalysisResultCardProps) {
  const insufficient = result.verdict === 'insufficient_evidence';

  return (
    <article className="space-y-5 rounded-2xl bg-zinc-900 p-5" aria-labelledby="result-heading">
      {mode === 'demo' && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-300">
          <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
          Demo data — not an analysis of your footage.
        </p>
      )}

      <header className="space-y-2">
        <h2 id="result-heading" className="text-xl font-bold">
          {insufficient ? 'Not enough to go on' : (result.trick.name ?? 'Unidentified trick')}
        </h2>
        {!insufficient && (
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-zinc-800 px-2.5 py-1">{LANDED_LABEL[result.trick.landed]}</span>
            <span className="rounded-full bg-zinc-800 px-2.5 py-1">{result.trick.confidence} confidence</span>
          </div>
        )}
        <p className="text-zinc-300">{result.summary}</p>
      </header>

      {insufficient && result.insufficientEvidenceReason && (
        <p className="flex gap-2 rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-300" />
          {result.insufficientEvidenceReason}
        </p>
      )}

      {result.observations.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Eye aria-hidden="true" className="size-4 text-lime-400" />
            What we saw
          </h3>
          <ol className="space-y-2">
            {result.observations.map((observation, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 font-medium capitalize text-zinc-400">{observation.phase}</span>
                <span className="text-zinc-200">
                  {observation.detail}
                  {formatTime(observation.timestampSeconds) && (
                    <span className="ml-1 text-zinc-500">({formatTime(observation.timestampSeconds)})</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {result.tips.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Lightbulb aria-hidden="true" className="size-4 text-lime-400" />
            Coaching tips
          </h3>
          <ul className="space-y-2">
            {result.tips.map((tip, index) => (
              <li key={index} className="rounded-lg bg-zinc-800 p-3 text-sm">
                <span className="block font-semibold text-lime-300">{tip.focus}</span>
                <span className="text-zinc-200">{tip.suggestion}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mode === 'live' && (
        <p className="text-xs text-zinc-500">
          AI feedback can be wrong. It describes what the model saw in this clip, not a verified assessment.
        </p>
      )}
    </article>
  );
}
