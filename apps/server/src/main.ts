/**
 * Agentville server: runs the town at a steady pace whether or not anyone is watching,
 * saves it regularly, and streams it to every open browser over a WebSocket.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { BASE_SPEED, Engine, generateWorld, ScriptedMind, type ClientMessage, type ServerMessage, type TownStatus } from '@agentville/core';
import { Budget } from './budget';
import { ClaudeMind, type MindStatus } from './claudeMind';
import { GeminiMind } from './gemini';
import { config } from './config';
import { openStore, today } from './store';

const STEP_MS = 100;
const TICK_MS = 200;
const SAVE_MS = 60_000;

async function main() {
  const store = await openStore(config.databaseUrl, config.dataDir);
  const saved = await store.loadWorld();
  const world = saved ?? generateWorld(config.seed);
  console.log(saved ? `[town] Restored the town at sim minute ${Math.round(world.time)}.` : `[town] Founded a new town from seed ${config.seed}.`);

  const budget = new Budget(config.weeklyBudgetUsd, await store.spentOn(today()));
  let mindStatus: MindStatus =
    config.mind === 'claude'
      ? { mind: 'claude', note: null }
      : config.mind === 'gemini'
        ? { mind: 'gemini', note: null }
        : { mind: 'scripted', note: 'No Claude or Gemini API key is set, so conversations use built-in scripts.' };

  const clients = new Set<WebSocket>();
  const inspecting = new Map<WebSocket, string | null>();
  const send = (ws: WebSocket, msg: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  };
  const status = (): TownStatus => ({
    mind: mindStatus.mind,
    note: mindStatus.note,
    budget: config.mind === 'claude' ? { weeklyUsd: budget.weeklyUsd, dailyCapUsd: budget.dailyCapUsd, spentTodayUsd: budget.spentTodayUsd } : null,
    calls: gemini ? { usedToday: gemini.usedToday, dailyLimit: config.dailyCalls } : null,
    speed: config.speed,
  });

  const gemini =
    config.mind === 'gemini'
      ? new GeminiMind({ apiKey: config.geminiKey, model: config.geminiModel, dailyCalls: config.dailyCalls }, (note) => {
          mindStatus = { mind: 'gemini', note };
          broadcast({ type: 'status', status: status() });
        })
      : null;
  const mind =
    gemini ??
    (config.mind === 'claude'
      ? new ClaudeMind({ routineModel: config.routineModel, deepModel: config.deepModel, maxConcurrent: config.maxConcurrentCalls }, budget, store, (s) => {
          mindStatus = s;
          console.log(`[mind] ${s.mind}${s.note ? `: ${s.note}` : ''}`);
          broadcast({ type: 'status', status: status() });
        })
      : new ScriptedMind());

  const engine = new Engine(world, {
    mind,
    speed: BASE_SPEED * config.speed,
    onFeed: (e) => {
      broadcast({ type: 'feed', event: e });
      store.appendEvent(e).catch((err) => console.warn('[store] could not log event:', err.message));
    },
    onMindError: (what, err) => console.warn(`[mind] ${what} failed:`, err instanceof Error ? err.message : err),
  });

  // The simulation runs on its own clock, independent of viewers.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    engine.step((now - last) / 1000);
    last = now;
  }, STEP_MS);

  setInterval(() => {
    if (!clients.size) return;
    broadcast({ type: 'tick', tick: engine.view() });
    for (const [ws, id] of inspecting) if (id) send(ws, { type: 'agent', detail: engine.detail(id) });
  }, TICK_MS);

  let saving = false;
  const save = async () => {
    if (saving) return;
    saving = true;
    try {
      await store.saveWorld(engine.world);
    } catch (err) {
      console.warn('[store] save failed:', err instanceof Error ? err.message : err);
    } finally {
      saving = false;
    }
  };
  setInterval(save, SAVE_MS);
  setInterval(() => broadcast({ type: 'status', status: status() }), 30_000);

  const http = createServer((req, res) => handleHttp(req, res, () => ({ ok: true, store: store.kind, simTime: engine.world.time, viewers: clients.size, ...status() })));
  const wss = new WebSocketServer({ server: http, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    inspecting.set(ws, null);
    send(ws, { type: 'hello', seed: engine.world.seed, buildings: engine.world.buildings, tick: engine.view(), feed: engine.world.feed.slice(-40), status: status() });
    ws.on('message', (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'inspect') {
        const id = typeof msg.id === 'string' ? msg.id : null;
        inspecting.set(ws, id);
        send(ws, { type: 'agent', detail: id ? engine.detail(id) : null });
      }
    });
    ws.on('close', () => {
      clients.delete(ws);
      inspecting.delete(ws);
    });
  });

  http.listen(config.port, () => {
    console.log(`[town] Agentville is running on http://localhost:${config.port} (store: ${store.kind}, mind: ${mindStatus.mind}, speed: ${config.speed}x).`);
  });

  const shutdown = async () => {
    console.log('[town] Saving before shutdown...');
    await save();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.hdr': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
};

/** Health check, status, and the built client as static files. */
function handleHttp(req: IncomingMessage, res: ServerResponse, health: () => object) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health' || url.pathname === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(health()));
    return;
  }
  if (!existsSync(config.clientDist)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Agentville server is running. Build the client (pnpm build) to serve the 3D view from here, or run the client dev server.');
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(config.clientDist, rel);
  if (!file.startsWith(config.clientDist) || !existsSync(file) || statSync(file).isDirectory()) file = join(config.clientDist, 'index.html');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.includes('/assets/index-') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
