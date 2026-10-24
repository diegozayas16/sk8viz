import { TriangleAlert } from 'lucide-react';
import type { ClientError } from '../types/analysis.ts';

interface AnalysisErrorProps {
  error: ClientError;
  onUseDemo: () => void;
}

// Errors where the live service itself is unavailable, so demo mode is a fair alternative.
const SERVICE_UNAVAILABLE = new Set<ClientError['code']>([
  'network',
  'bad_response',
  'busy',
  'quota_exceeded',
  'daily_limit_reached',
  'analysis_disabled',
  'server_misconfigured',
  'provider_error',
]);

export function AnalysisError({ error, onUseDemo }: AnalysisErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 border border-danger/60 p-5">
      <p className="flex gap-3 text-ink">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
        <span>
          {error.message}
          {error.retryAfterSeconds && (
            <span className="mt-1 block font-mono text-xs uppercase tracking-[0.06em] text-muted">
              You can try again in about {Math.ceil(error.retryAfterSeconds / 60)} min.
            </span>
          )}
        </span>
      </p>
      {SERVICE_UNAVAILABLE.has(error.code) && (
        <button
          type="button"
          onClick={onUseDemo}
          className="min-h-11 border border-edge px-4 text-sm font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          See an example instead
        </button>
      )}
    </div>
  );
}
