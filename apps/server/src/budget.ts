/**
 * The LLM budget: a weekly amount split into 7 equal daily caps.
 * Days roll over at midnight UTC. Spending is restored from the call log after a restart.
 */
export class BudgetExceededError extends Error {
  constructor(public readonly capUsd: number) {
    super(`Daily LLM budget of $${capUsd.toFixed(2)} reached`);
  }
}

/** Prices in USD per million tokens. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
};
/** Unknown models (for example a server-side fallback) are priced conservatively. */
const UNKNOWN = { input: 5, output: 25, cacheRead: 0.5 };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? UNKNOWN;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (u.input_tokens * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.output) / 1e6;
}

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export class Budget {
  private day = dayKey();
  private spent: number;

  constructor(
    public readonly weeklyUsd: number,
    spentToday = 0,
  ) {
    this.spent = spentToday;
  }

  get dailyCapUsd(): number {
    return this.weeklyUsd / 7;
  }

  get spentTodayUsd(): number {
    this.roll();
    return this.spent;
  }

  /** Throws if a call estimated at `estimateUsd` would go over today's cap. */
  check(estimateUsd: number): void {
    this.roll();
    if (this.spent + estimateUsd > this.dailyCapUsd) throw new BudgetExceededError(this.dailyCapUsd);
  }

  record(usd: number): void {
    this.roll();
    this.spent += usd;
  }

  private roll(): void {
    const today = dayKey();
    if (today !== this.day) {
      this.day = today;
      this.spent = 0;
    }
  }
}
