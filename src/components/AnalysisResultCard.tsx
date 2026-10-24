import { CircleAlert } from 'lucide-react';
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

// Tick marks for each timestamped observation, on a scale rounded up to the
// next whole second.
function Timeline({ times }: { times: number[] }) {
  if (times.length === 0) return null;
  const end = Math.max(1, Math.ceil(Math.max(...times)));
  return (
    <div aria-hidden="true" className="relative h-8">
      <div className="absolute inset-x-0 top-2 h-0.5 bg-line" />
      {times.map((time, index) => (
        <div
          key={index}
          className="absolute top-0.5 h-3.5 w-0.5 bg-accent"
          style={{ left: `calc(${(time / end) * 100}% - 1px)` }}
        />
      ))}
      <span className="absolute left-0 top-[18px] font-mono text-[11px] text-dim">0.0s</span>
      <span className="absolute right-0 top-[18px] font-mono text-[11px] text-dim">{end.toFixed(1)}s</span>
    </div>
  );
}

export function AnalysisResultCard({ result, mode }: AnalysisResultCardProps) {
  const insufficient = result.verdict === 'insufficient_evidence';
  const times = result.observations.flatMap((o) => (o.timestampSeconds === null ? [] : [o.timestampSeconds]));

  return (
    <article className="flex flex-col gap-10" aria-labelledby="result-heading">
      <header className="flex flex-col gap-4">
        {mode === 'demo' && (
          <p className="self-start border border-dashed border-demo px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-demo sm:text-xs">
            Demo data — not an analysis of your footage.
          </p>
        )}
        <h2
          id="result-heading"
          className={`display break-words ${insufficient ? 'text-[56px] sm:text-[72px]' : 'text-[84px] sm:text-[96px]'}`}
        >
          {insufficient ? 'Not enough to go on' : (result.trick.name ?? 'Unidentified trick')}
        </h2>
        {!insufficient && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.06em] sm:text-[13px]">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2 ${result.trick.landed === 'yes' ? 'bg-accent' : 'border border-muted'}`}
              />
              {LANDED_LABEL[result.trick.landed]}
            </span>
            <span className="text-muted">Confidence: {result.trick.confidence}</span>
          </div>
        )}
        <p className="max-w-2xl text-lg leading-relaxed text-body sm:text-xl">{result.summary}</p>
      </header>

      {insufficient && result.insufficientEvidenceReason && (
        <p className="flex gap-3 border border-edge p-4 text-body">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-demo" />
          {result.insufficientEvidenceReason}
        </p>
      )}

      {result.observations.length > 0 && (
        <section className="flex flex-col gap-4" aria-labelledby="observations-heading">
          <h3 id="observations-heading" className="eyebrow border-b border-line pb-3">
            What we saw
          </h3>
          <Timeline times={times} />
          <ol>
            {result.observations.map((observation, index) => (
              <li
                key={index}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-soft py-3.5 sm:grid sm:grid-cols-[4rem_6rem_minmax(0,1fr)] sm:gap-4"
              >
                <span className="order-2 font-mono text-[13px] text-muted sm:order-none sm:text-sm">
                  {formatTime(observation.timestampSeconds) ?? <span className="hidden sm:inline">—</span>}
                </span>
                <span className="display order-1 text-base leading-tight font-stretch-condensed sm:order-none sm:text-[15px]">
                  {observation.phase}
                </span>
                <span className="order-3 w-full text-[15px] text-body sm:order-none sm:w-auto sm:text-base">
                  {observation.detail}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {result.tips.length > 0 && (
        <section className="flex flex-col" aria-labelledby="tips-heading">
          <h3 id="tips-heading" className="eyebrow border-b border-line pb-3">
            Work on next
          </h3>
          <ol className="sm:grid sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] sm:gap-8 sm:pt-5">
            {result.tips.map((tip, index) => (
              <li
                key={index}
                className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-b border-line-soft py-5 last:border-0 sm:flex sm:flex-col sm:gap-2 sm:border-0 sm:py-0"
              >
                <span aria-hidden="true" className="display text-[44px] leading-none text-accent sm:text-[56px]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="display text-[19px] leading-tight font-stretch-condensed sm:text-xl">
                    {tip.focus}
                  </span>
                  <span className="text-[15px] leading-relaxed text-muted">{tip.suggestion}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {mode === 'live' && (
        <p className="border-t border-line pt-4 text-[13px] text-dim">
          AI feedback can be wrong. It describes what the model saw in this clip, not a verified assessment.
        </p>
      )}
    </article>
  );
}
