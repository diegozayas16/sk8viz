import { useEffect, useState } from 'react';
import type { HealthResponse } from '../../shared/analysis/schema.ts';
import { fetchHealth } from '../services/analysisClient.ts';

// null while the first check is in progress.
export function useLiveAvailability(): HealthResponse | null {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then((result) => {
      if (!controller.signal.aborted) setHealth(result);
    });
    return () => controller.abort();
  }, []);

  return health;
}
