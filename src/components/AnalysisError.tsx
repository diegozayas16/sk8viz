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
    <div role="alert" className="space-y-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
      <p className="flex gap-2 text-red-200">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>
          {error.message}
          {error.retryAfterSeconds && (
            <span className="block text-sm text-red-300">
              You can try again in about {Math.ceil(error.retryAfterSeconds / 60)} min.
            </span>
          )}
        </span>
      </p>
      {SERVICE_UNAVAILABLE.has(error.code) && (
        <button
          type="button"
          onClick={onUseDemo}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-lime-400"
        >
          See an example instead
        </button>
      )}
    </div>
  );
}
