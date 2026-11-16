/**
 * What the town asks a language model, shared by every provider (Claude, Gemini):
 * the system prompts, the user prompts built from a request, and the shape of each answer.
 */
import { z } from 'zod';
import {
  MAX_CONVERSATION_LINES,
  type ConverseRequest,
  type ConverseResult,
  type DecideRequest,
  type DecideResult,
  LETTERS,
  type PersonBrief,
  type PlanRequest,
  type PlanResult,
  type ReactRequest,
  type ReactResult,
  type ReflectRequest,
  type ReflectResult,
} from '@agentville/core';

export const ConversationSchema = z.object({
  lines: z.array(z.object({ speaker: z.enum(['a', 'b', 'c', 'd']), text: z.string() })),
  topic: z.string(),
  tone: z.enum(['warm', 'friendly', 'neutral', 'tense', 'heated']),
  summary: z.string(),
  affinityChanges: z.array(z.number().int()),
  memories: z.array(z.string()),
  gossip: z.string().nullable(),
  importance: z.number().int(),
});
export const DecideSchema = z.object({ choice: z.number().int(), reason: z.string() });
export const PlanSchema = z.object({ plan: z.string(), wantsToSee: z.string().nullable() });
export const ReflectSchema = z.object({ beliefs: z.array(z.string()) });
export const ReactSchema = z.object({ line: z.string(), memory: z.string() });

const TOWN = `Agentville is a growing simulated town. Linden Street runs through three neighbourhoods: Mill End (flats, the Ironbridge Works factory, the Lantern Club), Downtown (the Corner Café, Maple Grocery, Town Hall, the bank, the clinic, Linden Park, the Linden Lido pool, the Linden Labs tech company) and Hillcrest (villas with pools). Oak Street and Maple Street, behind it, are mostly empty lots that residents buy and build on. Its residents are ordinary adults with jobs, habits, moods, relationships and a place in the town's pecking order: working class, middle class or well-off.

The economy works like the real one. People earn wages, get promoted or fired, pay rent or a mortgage, borrow from the bank, open businesses, take partners, and compete: rival shops undercut each other's prices, and businesses that lose money close. Newcomers arrive when there are jobs and homes.

What every resident wants: to help Agentville grow and develop (new businesses, better places, more people), to build relationships that matter (friends, allies, partners, people who open doors), and to make money and get rich. Each has a personal ambition.

There are no free lunches in Agentville. Nothing is handed to anyone: success is earned through work, saving, skill, nerve and good relationships. Meals, groceries and rent cost real money, and people who don't earn fall into debt. Setbacks and failure are real: people get turned down, lose out, make bad calls, envy those ahead of them, and have to try again. Don't make things easy or rosy for anyone.

Everything is written in plain, modern English. Content stays family-friendly: no violence, crime, drugs or romance beyond friendship. Never invent events that would change the town (deaths, moving away, new buildings, businesses opening or closing); the town decides those. Small personal news, ideas, opinions and plans are fine.`;

const CONVERSE_SYSTEM = `${TOWN}

You write one conversation between two to four residents who have just run into each other. Make it feel real:
- Stay true to each person's personality, plan for the day, beliefs, memories, standing in town and how they feel about each other.
- In a group, not everyone talks equally: some lead, some chip in, someone may be left out.
- Not every chat is pleasant or important. People can be warm, awkward, distracted, funny, annoyed or curious.
- They may bring up things they remember, including news they heard about other residents. This is how gossip spreads.
- Their ambitions and money show: they talk shop, swap job tips, pitch ideas for the town or a business, look for partners, ask for help or a favour, and can be turned down. Someone in debt is stressed; someone doing well may be envied.
- Each line is one or two short spoken sentences. The conversation has between 4 and ${MAX_CONVERSATION_LINES} lines, then ends naturally. No repeated goodbyes, no loops.
- Avoid the listed recent topics unless something new happened.

Then report what came of it:
- topic: a few words, e.g. "the café's new menu".
- tone: warm, friendly, neutral, tense or heated.
- summary: one sentence for the town news feed, naming everyone.
- affinityChanges: for each person in order (a, b, c, d), how much their feeling toward the others changed, from -10 to 10. Most chats move it by 0 to 3.
- memories: for each person in order, one sentence they will remember.
- gossip: a short piece of news a bystander might repeat, written as a statement, or null if there is none.
- importance: 1 for small talk up to 10 for something life changing.`;

const PLAN_SYSTEM = `${TOWN}

You decide what one resident intends to do today. Base it on their personality, job, ambition, money situation, beliefs and recent memories. The plan should push them toward their ambition or out of trouble: earning, saving, making a useful connection, or taking a concrete step for themselves or the town. Answer with:
- plan: one sentence in the first person, at most 25 words.
- wantsToSee: the first name of one resident from the list they would like to see today (a friend, a possible partner, someone who can help), or null.`;

const REFLECT_SYSTEM = `${TOWN}

At the end of the day, a resident thinks back on recent memories, their ambition and how they are doing with money. Write up to 3 lasting beliefs or lessons they take away, in the first person, at most 15 words each: about people, about getting ahead, about the town. Only include beliefs that the memories support. Be honest, not cheerful by default.`;

const DECIDE_SYSTEM = `${TOWN}

A resident faces a big decision about money, work or where to live. Decide as they would, from their personality, ambition, money, beliefs and memories, not from what is wisest in general. Cautious, worried people often hold back; driven, confident people take risks; nobody should be reckless with money they don't have. Answer with:
- choice: the number of the option they pick (0 for the first).
- reason: why, in their own voice, one or two sentences (at most 35 words). Mention the numbers or people that matter to them.`;

const REACT_SYSTEM = `${TOWN}

A resident has just noticed something nearby. Write:
- line: what they say out loud, one short sentence (at most 15 words), true to their personality and feelings.
- memory: one sentence they will remember about it.`;

function person(p: PersonBrief, label: string): string {
  return [
    `${label}: ${p.name}, ${p.age}, ${p.occupation}. ${p.bio}`,
    `Personality: ${p.personality}.`,
    p.ambition ? `Ambition: ${p.ambition}.` : '',
    p.money ? `Money: ${p.money}.` : '',
    p.home ? `Home: ${p.home}.` : '',
    p.plan ? `Plan for today: ${p.plan}` : '',
    p.beliefs.length ? `Beliefs: ${p.beliefs.join(' ')}` : '',
    p.memories.length ? `Memories (oldest first):\n${p.memories.map((m) => `- ${m}`).join('\n')}` : 'Memories: none yet.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** One request to a model: the instructions, the question, and the answer's shape. */
export interface Prompt<T> {
  purpose: MindKind;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
}

export type MindKind = 'conversation' | 'plan' | 'reflection' | 'reaction' | 'decision';

export interface MindRequests {
  decision: DecideRequest;
  conversation: ConverseRequest;
  plan: PlanRequest;
  reflection: ReflectRequest;
  reaction: ReactRequest;
}
export interface MindResults {
  decision: DecideResult;
  conversation: ConverseResult;
  plan: PlanResult;
  reflection: ReflectResult;
  reaction: ReactResult;
}

export function conversePrompt(req: ConverseRequest): Prompt<ConverseResult> {
  const who = req.people.map((p, i) => `"${LETTERS[i]}" is ${p.name}`).join(', ');
  const prompt = [
    `Time: ${req.time}. Place: ${req.place}.`,
    ...req.people.map((p, i) => person(p, `Person ${LETTERS[i].toUpperCase()}`)),
    `How they feel about each other:\n${req.feelings.map((f) => `- ${f}`).join('\n')}`,
    req.recentTopics.length ? `Recent topics between them: ${req.recentTopics.join('; ')}.` : '',
    `Write their conversation (speaker ${who}), at most ${req.maxLines} lines. Give affinityChanges and memories with exactly ${req.people.length} entries each, in that order.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { purpose: 'conversation', system: CONVERSE_SYSTEM, prompt, schema: ConversationSchema, maxTokens: 6000 };
}

export function decidePrompt(req: DecideRequest): Prompt<DecideResult> {
  const prompt = `Time: ${req.time}.\n\n${person(req.person, 'Resident')}\n\nThe decision: ${req.situation}\n\nOptions:\n${req.options.map((o, i) => `${i}. ${o}`).join('\n')}`;
  return { purpose: 'decision', system: DECIDE_SYSTEM, prompt, schema: DecideSchema, maxTokens: 2500 };
}

export function planPrompt(req: PlanRequest): Prompt<PlanResult> {
  const prompt = `Time: ${req.time}.\n\n${person(req.person, 'Resident')}\n\nResidents they know:\n${req.townsfolk.map((t) => `- ${t}`).join('\n')}`;
  return { purpose: 'plan', system: PLAN_SYSTEM, prompt, schema: PlanSchema, maxTokens: 3000 };
}

export function reflectPrompt(req: ReflectRequest): Prompt<ReflectResult> {
  return { purpose: 'reflection', system: REFLECT_SYSTEM, prompt: person(req.person, 'Resident'), schema: ReflectSchema, maxTokens: 4000 };
}

export function reactPrompt(req: ReactRequest): Prompt<ReactResult> {
  const prompt = `Time: ${req.time}. Place: ${req.place}.\n\n${person(req.witness, 'Resident')}\n\n${req.feelings.join('\n')}\n\nThey just noticed: ${req.observed}.`;
  return { purpose: 'reaction', system: REACT_SYSTEM, prompt, schema: ReactSchema, maxTokens: 2000 };
}

/** The prompt for any kind of request, by name. */
export function promptFor<K extends MindKind>(kind: K, req: MindRequests[K]): Prompt<MindResults[K]> {
  const build = { conversation: conversePrompt, plan: planPrompt, reflection: reflectPrompt, reaction: reactPrompt, decision: decidePrompt }[kind] as unknown as (r: MindRequests[K]) => Prompt<MindResults[K]>;
  return build(req);
}
