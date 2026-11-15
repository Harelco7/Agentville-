/**
 * The free cloud endpoints against a real Postgres. Runs when TEST_DATABASE_URL is set, e.g.
 * TEST_DATABASE_URL=postgres://agentville:agentville@localhost:5432/agentville pnpm test
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { closeCloudDb, mindHandler, townHandler, type CloudEnv } from '../src/cloud/api';

const url = process.env.TEST_DATABASE_URL;
const geminiReply = { plan: 'Open the café early.', wantsToSee: null };
const env: CloudEnv = {
  databaseUrl: url,
  geminiKey: 'test-key',
  geminiModel: 'gemini-test',
  dailyCalls: 2,
  seed: 7,
  fetch: (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply) }] }, finishReason: 'STOP' }] }))) as unknown as typeof fetch,
};

let server: Server;
let base = '';
const post = async (path: string, body: object) => {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
};

describe.skipIf(!url)('cloud endpoints', () => {
  beforeAll(async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query('DROP TABLE IF EXISTS cloud_town, cloud_llm_usage');
    await c.end();
    const town = townHandler(env);
    const mind = mindHandler(env);
    server = createServer((req, res) => (req.url === '/api/town' ? town(req, res) : mind(req, res)));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await closeCloudDb();
  });

  it('makes the first viewer the host and the second a watcher', async () => {
    const a = await post('/api/town', { viewer: 'viewer-a', action: 'join' });
    expect(a.body).toMatchObject({ role: 'host', seed: 7, world: null, savedAt: null });
    const b = await post('/api/town', { viewer: 'viewer-b', action: 'join' });
    expect(b.body.role).toBe('watcher');
  });

  it('saves the host world, shares it with watchers, and refuses saves from others', async () => {
    const world = JSON.stringify({ time: 1234, agents: [] });
    const live = JSON.stringify({ at: 1, tick: { time: 1234, agents: [] } });
    expect((await post('/api/town', { viewer: 'viewer-a', action: 'save', world, live })).body).toEqual({ ok: true, watched: false });
    const w = await post('/api/town', { viewer: 'viewer-b', action: 'watch' });
    expect(w.body.free).toBe(false);
    expect(w.body.live.tick.time).toBe(1234);
    // The watcher's poll shows up for the host.
    expect((await post('/api/town', { viewer: 'viewer-a', action: 'save' })).body.watched).toBe(true);
    expect((await post('/api/town', { viewer: 'viewer-b', action: 'save', world: '{}' })).body.ok).toBe(false);
  });

  it('lets only the host ask the mind, within the daily limit', async () => {
    const req = { time: 'Monday', person: { name: 'Maya', age: 30, occupation: 'barista', personality: 'kind', bio: '', plan: '', beliefs: [], memories: [] }, townsfolk: [] };
    expect((await post('/api/mind', { viewer: 'viewer-b', kind: 'plan', req })).body).toMatchObject({ ok: false, reason: 'not_host' });
    const one = await post('/api/mind', { viewer: 'viewer-a', kind: 'plan', req });
    expect(one.body).toMatchObject({ ok: true, result: geminiReply, usedToday: 1 });
    expect((await post('/api/mind', { viewer: 'viewer-a', kind: 'plan', req })).body.usedToday).toBe(2);
    expect((await post('/api/mind', { viewer: 'viewer-a', kind: 'plan', req })).body).toMatchObject({ ok: false, reason: 'daily_limit' });
  });

  it('hands the town over when the host leaves, with the saved world', async () => {
    await post('/api/town', { viewer: 'viewer-a', action: 'leave', world: JSON.stringify({ time: 2000, agents: [] }) });
    expect((await post('/api/town', { viewer: 'viewer-b', action: 'watch' })).body.free).toBe(true);
    const b = await post('/api/town', { viewer: 'viewer-b', action: 'join' });
    expect(b.body.role).toBe('host');
    expect(b.body.world.time).toBe(2000);
    expect(b.body.now - b.body.savedAt).toBeLessThan(5000);
  });
});
