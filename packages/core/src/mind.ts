/**
 * The agents' "big decisions" go through a Mind: conversations, daily plans, nightly reflections and reactions.
 * The server plugs in an LLM-backed mind; the browser demo and the budget fallback use the scripted mind.
 */
import type { Tone } from './types';

/** Everything a mind needs to know about one person, already written out as text. */
export interface PersonBrief {
  name: string;
  age: number;
  occupation: string;
  personality: string;
  bio: string;
  plan: string;
  beliefs: string[];
  /** Recent and important memories, newest last, e.g. "Tuesday 09:10: Talked with Dana about the bakery." */
  memories: string[];
  /** Their life goal, e.g. "save enough to open my own bakery on Linden Street". */
  ambition: string;
  /** Their money situation in words, e.g. "$1,240 in savings, earns about $150 a working day, groceries for 3 meals". */
  money: string;
  /** Where they live and their standing, e.g. "rents a flat in Mill Court, Mill End (working class)". */
  home?: string;
}

/** Speakers are lettered in the order the people are listed: "a" is the first, "b" the second, and so on. */
export type SpeakerLetter = 'a' | 'b' | 'c' | 'd';
export const LETTERS: SpeakerLetter[] = ['a', 'b', 'c', 'd'];

export interface ConverseRequest {
  time: string;
  place: string;
  /** Two to four people. */
  people: PersonBrief[];
  /** How each person feels about the others, e.g. "Maya sees Dana Cohen (barista) as a close friend; they have talked 12 times." */
  feelings: string[];
  /** Topics these people covered recently, to keep them from repeating themselves. */
  recentTopics: string[];
  maxLines: number;
}

export interface ConverseResult {
  lines: { speaker: SpeakerLetter; text: string }[];
  topic: string;
  tone: Tone;
  /** One sentence for the town feed. */
  summary: string;
  /** For each person in order: how much their feeling toward the others changed, -10 to 10. */
  affinityChanges: number[];
  /** For each person in order: one sentence they will remember. */
  memories: string[];
  /** A piece of news others might repeat, or null. */
  gossip: string | null;
  /** 1 (small talk) to 10 (life changing). */
  importance: number;
}

/** A big life choice: open a business, build a house, move, take a partner. The engine lists the options; the person picks. */
export interface DecideRequest {
  time: string;
  person: PersonBrief;
  /** The situation in a few sentences, with the numbers that matter. */
  situation: string;
  /** Two to four options, written as what they would do. */
  options: string[];
}

export interface DecideResult {
  /** Index of the chosen option. */
  choice: number;
  /** Why, in the first person, one or two sentences. Becomes a lasting memory. */
  reason: string;
}

export interface PlanRequest {
  time: string;
  person: PersonBrief;
  /** Other townsfolk the person might want to see, e.g. "Dana Cohen (barista, close friend)". */
  townsfolk: string[];
}

export interface PlanResult {
  plan: string;
  /** First name of someone the person wants to see today, or null. */
  wantsToSee: string | null;
}

export interface ReflectRequest {
  person: PersonBrief;
}

export interface ReflectResult {
  /** Up to three short lasting beliefs or lessons. */
  beliefs: string[];
}

export interface ReactRequest {
  time: string;
  place: string;
  witness: PersonBrief;
  /** What the witness saw or overheard, e.g. "Maya and Dana arguing about the rent". */
  observed: string;
  /** How the witness feels about the people involved. */
  feelings: string[];
}

export interface ReactResult {
  /** What the witness says out loud, one short sentence. */
  line: string;
  /** What the witness will remember about it. */
  memory: string;
}

export interface Mind {
  converse(req: ConverseRequest): Promise<ConverseResult>;
  decide(req: DecideRequest): Promise<DecideResult>;
  planDay(req: PlanRequest): Promise<PlanResult>;
  reflect(req: ReflectRequest): Promise<ReflectResult>;
  react(req: ReactRequest): Promise<ReactResult>;
}

/** Conversations never run longer than this many sentences (Harel's rule against endless loops). */
export const MAX_CONVERSATION_LINES = 20;
