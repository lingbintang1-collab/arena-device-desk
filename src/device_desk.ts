import { createServer, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { moderationQueue } from './moderation.ts';
import { InfraiError, request } from './infrai_http.ts';

const MatchUpdate = z.object({
  updateId: z.string().uuid(),
  deviceId: z.string().min(1).max(80),
  status: z.enum(['online', 'degraded', 'offline']),
  assets: z.array(z.object({
    assetId: z.string().min(1), playerId: z.string().min(1),
    reports: z.number().int().nonnegative()
  }).strict()).max(100),
  liveEvent: z.object({ name: z.string().min(1), players: z.number().int().nonnegative() }).strict()
}).strict();

const channel = 'arena-device-desk';
const viewers = new Set<ServerResponse>();
const updates = new Map<string, { input: string; result: Promise<unknown> }>();
let latest: unknown = null;

const dashboard = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Arena device desk</title>
<h1>Arena device desk</h1><p>Device updates, player assets and pending moderation</p>
<pre id="match">Waiting for a match update</pre><h2>Metrics</h2><pre id="metrics"></pre>
<script>
const stream = new EventSource('/stream');
stream.onmessage = event => document.getElementById('match').textContent = JSON.stringify(JSON.parse(event.data), null, 2);
async function metrics() {
  const response = await fetch('/metrics');
  document.getElementById('metrics').textContent = JSON.stringify(await response.json(), null, 2);
}
metrics(); setInterval(metrics, 5000);
</script></html>`;

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

await request('POST', '/v1/realtime/channel/create', { channel }, `channel:${channel}`);

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashboard);
    } else if (req.method === 'GET' && req.url === '/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(': connected\n\n');
      if (latest) res.write(`data: ${JSON.stringify(latest)}\n\n`);
      viewers.add(res);
      req.on('close', () => viewers.delete(res));
    } else if (req.method === 'GET' && req.url === '/metrics') {
      const query = new URLSearchParams({ name: process.env.INFRAI_METRIC_NAME || 'device.status', agg: 'avg' });
      json(res, 200, await request('GET', `/v1/metrics/query?${query}`));
    } else if (req.method === 'POST' && req.url === '/match-update') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 65536) { json(res, 413, { error: 'Body too large' }); return; }
      }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { json(res, 400, { error: 'Expected JSON' }); return; }
      const input = MatchUpdate.safeParse(parsed);
      if (!input.success) { json(res, 400, { error: input.error.flatten() }); return; }
      const update = input.data;
      const fingerprint = JSON.stringify(update);
      const previous = updates.get(update.updateId);
      if (previous && previous.input !== fingerprint) {
        json(res, 409, { error: 'Use a new updateId for changed content' }); return;
      }
      if (!previous && updates.size >= 10000) {
        json(res, 503, { error: 'Demo session capacity reached' }); return;
      }
      if (!previous) {
        const result = (async () => {
          // Explicit properties preserve the asset shape even without strictNullChecks.
          const assets = update.assets.map(({ assetId, playerId, reports }) => ({ assetId, playerId, reports }));
          const state = { ...update, moderation: moderationQueue(assets) };
          await request('POST', '/v1/realtime/publish', {
            channel, event: 'match.device.updated', data: state
          }, update.updateId);
          latest = state;
          for (const viewer of viewers) viewer.write(`data: ${JSON.stringify(state)}\n\n`);
          return state;
        })();
        updates.set(update.updateId, { input: fingerprint, result });
      }
      json(res, 200, await updates.get(update.updateId)!.result);
    } else {
      json(res, 404, { error: 'Route not found' });
    }
  } catch (error) {
    if (error instanceof InfraiError) {
      json(res, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.detail });
    } else {
      json(res, 502, { error: error instanceof Error ? error.message : 'Request failed' });
    }
  }
}).listen(3000, '127.0.0.1', () => console.log('Device desk: http://127.0.0.1:3000'));
