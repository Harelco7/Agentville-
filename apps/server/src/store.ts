/**
 * Where the town is saved: Postgres when DATABASE_URL is set, otherwise JSON files in DATA_DIR.
 * Both keep the latest world snapshot, an append-only event log (the town feed) and a log of every LLM call with its cost.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import type { FeedEvent, WorldState } from '@agentville/core';
import { dayKey } from './budget';

export interface LlmCallRecord {
  at: string;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  error?: string;
}

export interface Store {
  readonly kind: string;
  init(): Promise<void>;
  loadWorld(): Promise<WorldState | null>;
  saveWorld(world: WorldState): Promise<void>;
  appendEvent(e: FeedEvent): Promise<void>;
  logLlmCall(r: LlmCallRecord): Promise<void>;
  /** Total LLM spend on the given UTC day, for restoring the budget after a restart. */
  spentOn(day: string): Promise<number>;
  close(): Promise<void>;
}

export class FileStore implements Store {
  readonly kind = 'files';
  constructor(private dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  async loadWorld() {
    try {
      return JSON.parse(await readFile(join(this.dir, 'world.json'), 'utf8')) as WorldState;
    } catch {
      return null;
    }
  }

  async saveWorld(world: WorldState) {
    // Write then rename, so a crash mid-write never leaves a broken save.
    const tmp = join(this.dir, 'world.json.tmp');
    await writeFile(tmp, JSON.stringify(world));
    await rename(tmp, join(this.dir, 'world.json'));
  }

  async appendEvent(e: FeedEvent) {
    await appendFile(join(this.dir, 'events.jsonl'), JSON.stringify(e) + '\n');
  }

  async logLlmCall(r: LlmCallRecord) {
    await appendFile(join(this.dir, 'llm-calls.jsonl'), JSON.stringify(r) + '\n');
  }

  async spentOn(day: string) {
    try {
      const text = await readFile(join(this.dir, 'llm-calls.jsonl'), 'utf8');
      return text
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as LlmCallRecord)
        .filter((r) => r.at.startsWith(day))
        .reduce((sum, r) => sum + r.costUsd, 0);
    } catch {
      return 0;
    }
  }

  async close() {}
}

export class PgStore implements Store {
  readonly kind = 'postgres';
  private pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 4 });
  }

  async init() {
    await this.pool.query(`
      create table if not exists world_snapshots (
        id bigserial primary key,
        saved_at timestamptz not null default now(),
        sim_time double precision not null,
        state jsonb not null
      );
      create table if not exists town_events (
        id text primary key,
        sim_time double precision not null,
        kind text not null,
        text text not null,
        agents jsonb not null,
        created_at timestamptz not null default now()
      );
      create table if not exists llm_calls (
        id bigserial primary key,
        at timestamptz not null,
        purpose text not null,
        model text not null,
        input_tokens integer not null,
        output_tokens integer not null,
        cost_usd double precision not null,
        ok boolean not null,
        error text
      );
      create index if not exists llm_calls_at on llm_calls (at);
    `);
  }

  async loadWorld() {
    const r = await this.pool.query('select state from world_snapshots order by id desc limit 1');
    return (r.rows[0]?.state as WorldState) ?? null;
  }

  async saveWorld(world: WorldState) {
    await this.pool.query('insert into world_snapshots (sim_time, state) values ($1, $2)', [world.time, JSON.stringify(world)]);
    // Keep the last 50 snapshots so an older town can be restored by hand if needed.
    await this.pool.query('delete from world_snapshots where id < (select coalesce(min(id), 0) from (select id from world_snapshots order by id desc limit 50) s)');
  }

  async appendEvent(e: FeedEvent) {
    await this.pool.query('insert into town_events (id, sim_time, kind, text, agents) values ($1, $2, $3, $4, $5) on conflict (id) do nothing', [
      `${e.id}-${Math.round(e.t)}`,
      e.t,
      e.kind,
      e.text,
      JSON.stringify(e.agents),
    ]);
  }

  async logLlmCall(r: LlmCallRecord) {
    await this.pool.query(
      'insert into llm_calls (at, purpose, model, input_tokens, output_tokens, cost_usd, ok, error) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [r.at, r.purpose, r.model, r.inputTokens, r.outputTokens, r.costUsd, r.ok, r.error ?? null],
    );
  }

  async spentOn(day: string) {
    const r = await this.pool.query("select coalesce(sum(cost_usd), 0) as total from llm_calls where at >= $1::date and at < $1::date + interval '1 day'", [day]);
    return Number(r.rows[0].total);
  }

  async close() {
    await this.pool.end();
  }
}

export async function openStore(databaseUrl: string | null, dataDir: string): Promise<Store> {
  const store = databaseUrl ? new PgStore(databaseUrl) : new FileStore(dataDir);
  await store.init();
  return store;
}

export const today = dayKey;
