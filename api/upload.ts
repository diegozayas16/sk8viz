import { createUploadHandler } from '../server/uploadHandler.ts';
import { loadConfig } from '../server/config.ts';

// Vercel Function for POST /api/upload (upload tokens for large clips).

const upload = createUploadHandler({ config: loadConfig() });

export default {
  fetch(request: Request): Promise<Response> {
    return upload(request);
  },
};
