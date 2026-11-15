/** Server settings, read from environment variables (and a .env file, if present). */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const file of ['.env', '../../.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const num = (name: string, fallback: number) => {
  const v = process.env[name];
  const n = v === undefined || v === '' ? fallback : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${v}"`);
  return n;
};

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export const config = {
  port: num('PORT', 8787),
  /** Postgres connection string. Without it the world is saved to files in DATA_DIR. */
  databaseUrl: process.env.DATABASE_URL || null,
  dataDir: resolve(process.env.DATA_DIR || './data'),
  /** The built client to serve, so one server hosts the whole app. */
  clientDist: resolve(process.env.CLIENT_DIST || '../client/dist'),
  seed: num('WORLD_SEED', 20261115),
  /** 1 = real pace (one sim day every 22.5 minutes). Higher values are for testing. */
  speed: num('TIME_SCALE', 1),
  /** "claude" uses the Claude API; "scripted" uses built-in templates and costs nothing. */
  mind: (process.env.LLM_PROVIDER || (hasKey ? 'claude' : 'scripted')) as 'claude' | 'scripted',
  weeklyBudgetUsd: num('LLM_WEEKLY_BUDGET_USD', 84),
  /** Fast, cheap model for everyday conversations, plans and reactions. */
  routineModel: process.env.LLM_ROUTINE_MODEL || 'claude-haiku-5-5',
  /** Stronger model for nightly reflections and conversations between close friends or rivals. */
  deepModel: process.env.LLM_DEEP_MODEL || 'claude-sonnet-5-5',
  maxConcurrentCalls: num('LLM_MAX_CONCURRENT', 4),
};

export type Config = typeof config;
