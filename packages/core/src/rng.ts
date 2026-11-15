/** Mulberry32: a small, fast seeded generator. The state is a single integer kept in the world state. */
export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** A generator object over a mutable holder, for code that draws many numbers in a row. */
export class Rng {
  constructor(private holder: { rng: number }) {}
  next(): number {
    const [v, n] = nextRandom(this.holder.rng);
    this.holder.rng = n;
    return v;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
