import { createApp } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';

// Vercel Function for POST /api/analyze.

const { analyze } = createApp(loadConfig());

export default {
  fetch(request: Request): Promise<Response> {
    // Vercel sets x-real-ip from the connecting client and overwrites any value
    // the client sent, so it is safe to trust here (and only on Vercel).
    const clientId = request.headers.get('x-real-ip') ?? 'unknown';
    return analyze(request, { clientId, signal: request.signal });
  },
};
