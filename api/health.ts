import { createHealthHandler } from '../server/analyzeHandler.ts';
import { loadConfig } from '../server/config.ts';

// Vercel Function for GET /api/health.

const health = createHealthHandler(loadConfig());

export default {
  fetch(): Response {
    return health();
  },
};
