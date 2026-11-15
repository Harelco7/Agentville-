/**
 * The free cloud setup (Vercel + Neon + Gemini) has no always-on server. Instead, the browser of whoever is
 * watching runs the town, and these small serverless endpoints keep it shared and saved:
 *
 * - One viewer at a time is the "host". The host's browser runs the simulation, saves the town every few
 *   seconds and renews a 30 second lease. When nobody has been watching, the next host first replays the
 *   time that passed (with scripted conversations), so the town keeps living while nobody looks.
 * - Everyone else is a "watcher": they see the host's town, refreshed every second.
 * - Conversations, plans, reflections and reactions go through /api/mind, which calls Gemini with the
 *   server's key. Only the current host may call it, and a daily call limit keeps it inside the free tier.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import pg from 'pg';
import { DEFAULT_GEMINI_MODEL, GeminiError, askGemini } from '../gemini';
import { promptFor, type MindKind } from '../prompts';
import type { CloudJoin, CloudMindInfo, CloudMindReply, CloudSaveReply } from '@agentville/core';

const LEASE_SECONDS = 30;
/** Watchers who asked within this many seconds count as watching (the host then shares its view). */
const WATCHER_SECONDS = 10;
const MAX_BODY = 4_000_000;
const KINDS: MindKind[] = ['conversation', 'plan', 'reflection', 'reaction'];

export interface CloudEnv {
  databaseUrl: string | undefined;
  geminiKey: string | undefined;
  geminiModel: string;
  dailyCalls: number;
  seed: number;
  geminiBaseUrl?: string;
  fetch?: typeof fetch;
}

export function envFromProcess(): CloudEnv {
  const e = process.env;
  return {
    databaseUrl: e.DATABASE_URL || e.POSTGRES_URL || e.NEON_DATABASE_URL,
    geminiKey: e.GEMINI_API_KEY || e.GOOGLE_API_KEY || undefined,
    geminiModel: e.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    dailyCalls: Number(e.LLM_DAILY_CALLS || 400),
    seed: Number(e.WORLD_SEED || 20261115),
    geminiBaseUrl: e.GEMINI_API_BASE || undefined,
  };
}

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

function db(env: CloudEnv): pg.Pool {
  if (!env.databaseUrl) throw new HttpError(503, 'No database is connected. Add a Neon database to the Vercel project (see the README).');
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(env.databaseUrl);
    pool = new pg.Pool({ connectionString: env.databaseUrl, max: 2, ssl: local ? undefined : { rejectUnauthorized: false }, idleTimeoutMillis: 10_000 });
  }
  ready ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS cloud_town (
         id int PRIMARY KEY,
         world text,
         saved_at timestamptz,
         host text,
         lease_until timestamptz,
         live text,
         watched_at timestamptz
       );
       CREATE TABLE IF NOT EXISTS cloud_llm_usage (day date PRIMARY KEY, calls int NOT NULL DEFAULT 0);
       INSERT INTO cloud_town (id) VALUES (1) ON CONFLICT DO NOTHING;`,
    )
    .then(() => undefined)
    .catch((err) => {
      ready = null;
      throw err;
    });
  return pool;
}

async function query<R extends pg.QueryResultRow>(env: CloudEnv, sql: string, params: unknown[] = []): Promise<R[]> {
  const p = db(env);
  await ready;
  return (await p.query<R>(sql, params)).rows;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (pre && typeof pre === 'object') return pre as Record<string, unknown>;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

function send(res: ServerResponse, status: number, body: string | object) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function wrap(fn: (req: IncomingMessage, res: ServerResponse, env: CloudEnv) => Promise<void>, envOverride?: CloudEnv) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await fn(req, res, envOverride ?? envFromProcess());
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[cloud]', err);
      send(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}

const viewerOf = (body: Record<string, unknown>) => {
  const v = body.viewer;
  if (typeof v !== 'string' || !/^[\w-]{6,64}$/.test(v)) throw new HttpError(400, 'Missing viewer id');
  return v;
};

async function mindInfo(env: CloudEnv): Promise<CloudMindInfo> {
  if (!env.geminiKey) return { enabled: false, model: null, usedToday: 0, dailyLimit: env.dailyCalls };
  const rows = await query<{ calls: number }>(env, `SELECT calls FROM cloud_llm_usage WHERE day = (now() AT TIME ZONE 'utc')::date`);
  return { enabled: true, model: env.geminiModel, usedToday: rows[0]?.calls ?? 0, dailyLimit: env.dailyCalls };
}

/** POST /api/town with an action: join, save, leave or watch. */
async function town(req: IncomingMessage, res: ServerResponse, env: CloudEnv) {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
  const body = await readBody(req);
  const viewer = viewerOf(body);
  switch (body.action) {
    case 'join': {
      const rows = await query<{ world: string | null; saved_at: Date | null; now: Date }>(
        env,
        `UPDATE cloud_town SET host = $1, lease_until = now() + make_interval(secs => $2)
         WHERE id = 1 AND (host IS NULL OR host = $1 OR lease_until < now())
         RETURNING world, saved_at, now()`,
        [viewer, LEASE_SECONDS],
      );
      const mind = await mindInfo(env);
      if (!rows.length) return send(res, 200, { role: 'watcher', mind } satisfies CloudJoin);
      const r = rows[0];
      // The saved town is passed through as text, without parsing it here.
      const head = JSON.stringify({ role: 'host', seed: env.seed, savedAt: r.saved_at?.getTime() ?? null, now: r.now.getTime(), mind }).slice(0, -1);
      return send(res, 200, `${head},"world":${r.world ?? 'null'}}`);
    }
    case 'save': {
      const world = typeof body.world === 'string' ? body.world : null;
      const live = typeof body.live === 'string' ? body.live : null;
      const rows = await query<{ watched: boolean }>(
        env,
        `UPDATE cloud_town SET
           world = COALESCE($2, world),
           saved_at = CASE WHEN $2::text IS NULL THEN saved_at ELSE now() END,
           live = COALESCE($3, live),
           lease_until = now() + make_interval(secs => $4)
         WHERE id = 1 AND host = $1
         RETURNING COALESCE(watched_at > now() - make_interval(secs => $5), false) AS watched`,
        [viewer, world, live, LEASE_SECONDS, WATCHER_SECONDS],
      );
      return send(res, 200, (rows.length ? { ok: true, watched: rows[0].watched } : { ok: false, watched: false }) satisfies CloudSaveReply);
    }
    case 'leave': {
      const world = typeof body.world === 'string' ? body.world : null;
      await query(
        env,
        `UPDATE cloud_town SET
           world = COALESCE($2, world),
           saved_at = CASE WHEN $2::text IS NULL THEN saved_at ELSE now() END,
           host = NULL, lease_until = NULL, live = NULL
         WHERE id = 1 AND host = $1`,
        [viewer, world],
      );
      return send(res, 200, { ok: true });
    }
    case 'watch': {
      const rows = await query<{ live: string | null; free: boolean }>(
        env,
        `UPDATE cloud_town SET watched_at = now() WHERE id = 1
         RETURNING live, (host IS NULL OR lease_until < now()) AS free`,
      );
      const r = rows[0];
      return send(res, 200, `{"free":${r?.free ?? true},"live":${r?.free ? 'null' : r?.live ?? 'null'}}`);
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
}

/** POST /api/mind: one Gemini call for the host's town. Falls back politely when it can't be made. */
async function mind(req: IncomingMessage, res: ServerResponse, env: CloudEnv) {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
  const body = await readBody(req);
  const viewer = viewerOf(body);
  const kind = body.kind as MindKind;
  if (!KINDS.includes(kind) || !body.req || typeof body.req !== 'object') throw new HttpError(400, 'Unknown request');
  const reply = (r: CloudMindReply) => send(res, 200, r);
  if (!env.geminiKey) return reply({ ok: false, reason: 'disabled', message: 'No GEMINI_API_KEY is set.', usedToday: 0, dailyLimit: env.dailyCalls });

  const host = await query(env, `SELECT 1 FROM cloud_town WHERE id = 1 AND host = $1 AND lease_until > now()`, [viewer]);
  if (!host.length) return reply({ ok: false, reason: 'not_host', message: 'Only the browser running the town may ask the mind.', usedToday: 0, dailyLimit: env.dailyCalls });

  const counted = await query<{ calls: number }>(
    env,
    `INSERT INTO cloud_llm_usage (day, calls) VALUES ((now() AT TIME ZONE 'utc')::date, 1)
     ON CONFLICT (day) DO UPDATE SET calls = cloud_llm_usage.calls + 1 WHERE cloud_llm_usage.calls < $1
     RETURNING calls`,
    [env.dailyCalls],
  );
  if (!counted.length) {
    return reply({ ok: false, reason: 'daily_limit', message: `Today's ${env.dailyCalls} Gemini calls are used up. Conversations are scripted until midnight UTC.`, usedToday: env.dailyCalls, dailyLimit: env.dailyCalls });
  }
  const usedToday = counted[0].calls;
  try {
    const result = await askGemini(promptFor(kind, body.req as never), { apiKey: env.geminiKey, model: env.geminiModel, baseUrl: env.geminiBaseUrl, fetch: env.fetch });
    return reply({ ok: true, result, usedToday, dailyLimit: env.dailyCalls });
  } catch (err) {
    const reason = err instanceof GeminiError ? err.kind : 'unavailable';
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[mind] ${kind} failed: ${message}`);
    return reply({ ok: false, reason, message, usedToday, dailyLimit: env.dailyCalls });
  }
}

/** GET /api/health: is the database there, and is the mind set up. */
async function health(_req: IncomingMessage, res: ServerResponse, env: CloudEnv) {
  const rows = await query<{ saved_at: Date | null; hosted: boolean }>(env, `SELECT saved_at, (host IS NOT NULL AND lease_until > now()) AS hosted FROM cloud_town WHERE id = 1`);
  send(res, 200, { ok: true, savedAt: rows[0]?.saved_at ?? null, beingWatched: rows[0]?.hosted ?? false, mind: await mindInfo(env) });
}

export const townHandler = (env?: CloudEnv) => wrap(town, env);
export const mindHandler = (env?: CloudEnv) => wrap(mind, env);
export const healthHandler = (env?: CloudEnv) => wrap(health, env);

/** For tests: forget the connection pool. */
export async function closeCloudDb() {
  await pool?.end();
  pool = null;
  ready = null;
}
