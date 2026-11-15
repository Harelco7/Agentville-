/** Skin, hair and clothes for each person, picked from their identity so they always look the same. */
import type { AgentState, Looks } from './types';

const SKIN = ['#f3d2b8', '#e8b98f', '#d6a47c', '#b98058', '#8d5a3b', '#6b4029', '#f0c9a6', '#c68e66'];
const HAIR = ['#2b1d14', '#4a2e1c', '#6b4325', '#a0652f', '#c99a55', '#e3c27e', '#8c2f1c', '#1a1a1a'];
const GREY = ['#b8b4ad', '#d9d6d0', '#8f8b85'];
const BOTTOMS = ['#2b3a55', '#3d4b63', '#1f1f22', '#6b5640', '#c2b59b', '#4f6b4a', '#7a2f35', '#56606e'];
const SHOES = ['#f4f4f2', '#2a2420', '#5c3b25', '#1d1d1f', '#8c6a4a', '#c23b30'];
const STYLES: Looks['hairStyle'][] = ['short', 'crop', 'long', 'bun', 'curly', 'short', 'long'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const cache = new Map<string, Looks>();

export function looksOf(a: Pick<AgentState, 'id' | 'name' | 'surname' | 'age' | 'color' | 'occupation'>): Looks {
  const key = `${a.id}|${a.name}|${a.surname}|${a.age}|${a.color}`;
  let l = cache.get(key);
  if (l) return l;
  let h = hash(key);
  const pick = <T>(list: readonly T[]): T => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return list[h % list.length];
  };
  const old = a.age >= 60;
  const style = pick(STYLES);
  const legs = pick(['trousers', 'trousers', 'trousers', 'shorts', 'skirt'] as const);
  l = {
    skin: pick(SKIN),
    hair: old ? pick(GREY) : pick(HAIR),
    hairStyle: old && pick([true, false, false]) ? 'bald' : style,
    // Their signature colour (also used on the map) is their top.
    top: a.color,
    sleeves: /barista|gardener|grocer/.test(a.occupation) ? 'short' : pick(['short', 'long', 'long'] as const),
    bottom: pick(BOTTOMS),
    legs: old && legs === 'shorts' ? 'trousers' : legs,
    shoes: pick(SHOES),
  };
  cache.set(key, l);
  return l;
}
