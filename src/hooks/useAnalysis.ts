import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeClip } from '../services/analysisClient.ts';
import { DEMO_RESULT } from '../services/demoFixture.ts';
import type { AnalysisMode, AnalysisState, SelectedClip } from '../types/analysis.ts';

// Runs one analysis at a time. Each run gets an id so a late response for an
// older clip can never overwrite the state for a newer one.
export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    inFlightRef.current = false;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({ status: 'idle' });
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(async (mode: AnalysisMode, clip: SelectedClip | null) => {
    if (inFlightRef.current) return;

    if (mode === 'demo') {
      setState({ status: 'success', mode, result: DEMO_RESULT });
      return;
    }
    if (!clip) {
      setState({ status: 'error', error: { code: 'no_clip', message: 'Choose a clip first.' } });
      return;
    }

    const id = ++requestIdRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;
    setState({ status: 'analyzing', mode });

    const outcome = await analyzeClip(clip, controller.signal);
    if (id !== requestIdRef.current) return;

    inFlightRef.current = false;
    controllerRef.current = null;
    if (outcome.ok) setState({ status: 'success', mode, result: outcome.result });
    else if ('error' in outcome) setState({ status: 'error', error: outcome.error });
    else setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
