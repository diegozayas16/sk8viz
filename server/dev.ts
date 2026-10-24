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
    response = await analyze(toRequest(req, disconnect.signal), { clientId, signal: disconnect.signal });
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
