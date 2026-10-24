import { createServer, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { ANALYSIS_LIMITS } from '../shared/analysis/limits.ts';
import { createAnalyzeHandler, createHealthHandler, liveUnavailableReason } from './analyzeHandler.ts';
import { loadConfig } from './config.ts';
import { createGeminiAnalyzer } from './services/gemini.ts';
import { createUsageLimiter } from './usageLimiter.ts';

// Local API server. Adapts Node requests to the platform-neutral handlers.
// Run with `npm run dev:api`.

const config = loadConfig();
const analyzer = config.apiKey ? createGeminiAnalyzer(config.apiKey, config.model) : null;
const analyze = createAnalyzeHandler({ config, analyzer, limiter: createUsageLimiter(ANALYSIS_LIMITS) });
const health = createHealthHandler(config);

function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else if (value !== undefined) headers.set(name, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', 'http://localhost'), {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    duplex: 'half',
    signal,
  });
}

// The handler can reply before reading the upload (for example when rate
// limited). Replying with unread data makes Node reset the connection, which
// proxies turn into a generic network error, so read and drop what is left,
// up to the clip limit. Larger uploads still get a reset.
async function discardUnreadBody(request: Request): Promise<void> {
  if (!request.body || request.body.locked) return;
  const reader = request.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      total += value.byteLength;
      if (total > ANALYSIS_LIMITS.maxClipBytes) return void (await reader.cancel());
    }
  } catch {
    // The client went away; nothing left to drain.
  }
}

const server = createServer(async (req, res) => {
  const disconnect = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) disconnect.abort();
  });

  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  let response: Response;
  if (path === '/api/analyze') {
    // Uses the socket address. Do not trust X-Forwarded-For unless a verified proxy sets it.
    const clientId = req.socket.remoteAddress ?? 'unknown';
    const request = toRequest(req, disconnect.signal);
    response = await analyze(request, { clientId, signal: disconnect.signal });
    await discardUnreadBody(request);
  } else if (path === '/api/health' && req.method === 'GET') {
    response = health();
  } else {
    response = new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(config.port, () => {
  const unavailable = liveUnavailableReason(config);
  console.log(`Sk8viz API listening on http://localhost:${config.port} (model ${config.model})`);
  if (unavailable) console.log(`Live analysis unavailable: ${unavailable}`);
});
