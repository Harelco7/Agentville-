/**
 * A mind that needs no LLM: conversations, plans and reactions from templates.
 * Used by the in-browser demo, when no API key is set, and when the daily LLM budget runs out.
 */
import type { ConverseRequest, ConverseResult, Mind, PlanRequest, PlanResult, ReactRequest, ReactResult, ReflectRequest, ReflectResult } from './mind';
import { Rng } from './rng';
import type { Tone } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const first = (s: string) => s.split(' ')[0];

interface Topic {
  key: string;
  lines: (a: string, b: string, r: Rng) => [string, string][];
}

const TOPICS: Topic[] = [
  {
    key: 'the weather',
    lines: (_a, _b, r) => [
      [r.pick(['Lovely light today, isn\'t it?', 'Feels like rain later.', 'Finally a bit of sun.']), r.pick(['It really is. I almost stayed outside all morning.', 'I hope it holds until the weekend.', 'My garden needs it, honestly.'])],
    ],
  },
  {
    key: 'work',
    lines: (_a, _b, r) => [
      [r.pick(['How\'s work treating you?', 'Busy week?', 'Are they still keeping you late?']), r.pick(['Busy, but the good kind of busy.', 'Honestly, I could use a day off.', 'Better since we sorted out the schedule.'])],
      [r.pick(['You should take that day off.', 'Glad it\'s calming down.', 'Let me know if you need a hand.']), r.pick(['Maybe I will.', 'Thanks, I mean it.', 'I\'ll hold you to that.'])],
    ],
  },
  {
    key: 'the café',
    lines: (_a, _b, r) => [
      [r.pick(['Have you tried the new pastry at the Corner Café?', 'The coffee at the café was strong today.', 'The café was packed this morning.']), r.pick(['Not yet, is it good?', 'Strong is how I like it.', 'Everyone wanted the window seat.'])],
      [r.pick(['Worth every crumb.', 'I needed it.', 'I gave up and stood at the counter.']), r.pick(['Then I\'m going tomorrow.', 'Same here.', 'Ha, classic.'])],
    ],
  },
  {
    key: 'the park',
    lines: (_a, _b, r) => [
      [r.pick(['The roses in Linden Park are coming back.', 'Someone fixed the bench by the oak tree.', 'The park was quiet this morning.']), r.pick(['I saw. Whoever looks after it does a good job.', 'About time, it wobbled for months.', 'That\'s my favourite time to go.'])],
    ],
  },
  {
    key: 'weekend plans',
    lines: (_a, _b, r) => [
      [r.pick(['Any plans for the weekend?', 'What are you doing on Saturday?']), r.pick(['Nothing at all, and I\'m proud of it.', 'Cleaning the house, sadly.', 'I want to finally finish my book.'])],
      [r.pick(['Sounds perfect.', 'We should get lunch if you\'re free.', 'Good luck with that.']), r.pick(['Lunch sounds nice.', 'Thanks, I\'ll need it.', 'Maybe next week.'])],
    ],
  },
  {
    key: 'the neighbourhood',
    lines: (_a, _b, r) => [
      [r.pick(['Did you notice the empty house down the street?', 'I wonder who will move into the empty house.']), r.pick(['I did. I hope someone nice moves in.', 'Somebody with a dog, I hope.', 'It\'s been empty too long.'])],
    ],
  },
];

const TENSE_LINES: [string, string][] = [
  ['You never returned the ladder, you know.', 'I said I would. You don\'t have to keep bringing it up.'],
  ['Your music was loud again last night.', 'It was barely ten. You\'re exaggerating.'],
  ['I heard you told people I was late again.', 'Well, you were.'],
];

export class ScriptedMind implements Mind {
  async converse(req: ConverseRequest): Promise<ConverseResult> {
    const r = new Rng({ rng: hash(`${req.time}|${req.a.name}|${req.b.name}`) });
    const a = first(req.a.name);
    const b = first(req.b.name);
    const fondA = /friend|close|fond/.test(req.aAboutB);
    const dislike = /dislike|tense|annoy/.test(req.aAboutB + req.bAboutA);
    const tone: Tone = dislike && r.chance(0.6) ? 'tense' : fondA ? r.pick(['warm', 'friendly']) : r.pick(['friendly', 'neutral', 'friendly']);

    const lines: { speaker: 'a' | 'b'; text: string }[] = [];
    const say = (speaker: 'a' | 'b', text: string) => lines.push({ speaker, text });
    say('a', tone === 'tense' ? `Oh. Hi, ${b}.` : r.pick([`Hi ${b}!`, `${b}, good to see you.`, `Hey ${b}, how are you?`]));
    say('b', tone === 'tense' ? `${a}.` : r.pick([`Hi ${a}! I\'m well, you?`, `Good to see you too.`, `Not bad at all. You?`]));

    // Gossip travels: if someone remembers overhearing something, they pass it on.
    const gossipMemory = [...req.a.memories].reverse().find((m) => /overheard|heard that/i.test(m));
    let topicKey: string;
    let gossip: string | null = null;
    if (tone === 'tense') {
      const [x, y] = r.pick(TENSE_LINES);
      say('a', x);
      say('b', y);
      say('a', 'Fine. Let\'s just drop it.');
      topicKey = 'an old grievance';
      gossip = `${a} and ${b} had words at the ${req.place}`;
    } else if (gossipMemory && r.chance(0.6)) {
      const news = gossipMemory.replace(/^[^:]*:\s*/, '').replace(/^Overheard\s*/i, '');
      say('a', `Did you hear? ${capitalise(news)}`);
      say('b', r.pick(['No! Really?', 'I had no idea.', 'That doesn\'t surprise me, honestly.']));
      say('a', r.pick(['That\'s what I heard. Don\'t repeat it.', 'I just hope they patch things up.']));
      topicKey = 'town gossip';
    } else {
      const avoid = new Set(req.recentTopics);
      const options = TOPICS.filter((t) => !avoid.has(t.key));
      const topic = r.pick(options.length ? options : TOPICS);
      for (const [x, y] of topic.lines(a, b, r)) {
        say('a', x);
        say('b', y);
      }
      topicKey = topic.key;
    }
    say('b', tone === 'tense' ? 'Fine.' : r.pick(['Anyway, I should get going.', 'I\'d better get on with my day.', 'Let\'s catch up again soon.']));
    say('a', tone === 'tense' ? '...' : r.pick(['See you around!', 'Take care.', 'Yes, soon!']));

    const change = tone === 'tense' ? -r.int(3, 7) : tone === 'warm' ? r.int(3, 6) : r.int(1, 3);
    return {
      lines,
      topic: topicKey,
      tone,
      summary: tone === 'tense' ? `${a} and ${b} had a short, tense exchange about ${topicKey}.` : `${a} and ${b} chatted about ${topicKey}.`,
      aAffinityChange: change,
      bAffinityChange: change,
      aMemory: tone === 'tense' ? `Had an awkward exchange with ${b} about ${topicKey}.` : `Chatted with ${b} about ${topicKey}.`,
      bMemory: tone === 'tense' ? `${a} brought up ${topicKey} again. It was tense.` : `Chatted with ${a} about ${topicKey}.`,
      gossip,
      importance: tone === 'tense' ? 5 : 2,
    };
  }

  async planDay(req: PlanRequest): Promise<PlanResult> {
    const r = new Rng({ rng: hash(`${req.time}|${req.person.name}`) });
    const friend = req.townsfolk.length && r.chance(0.6) ? first(r.pick(req.townsfolk)) : null;
    const base = r.pick([
      'Get through the day calmly and be home early',
      'Get some fresh air in the park',
      'Treat myself to something at the café',
      'Be productive and tidy up loose ends',
    ]);
    return { plan: friend ? `${base}, and catch up with ${friend}.` : `${base}.`, wantsToSee: friend };
  }

  async reflect(req: ReflectRequest): Promise<ReflectResult> {
    const talks = req.person.memories.filter((m) => /chatted|talked/i.test(m)).length;
    const tense = req.person.memories.some((m) => /tense|awkward|argu/i.test(m));
    const beliefs: string[] = [];
    if (talks >= 2) beliefs.push('Talking with neighbours makes my days better.');
    if (tense) beliefs.push('Some things are better said kindly, or not at all.');
    if (!beliefs.length) beliefs.push('A quiet day can be a good day.');
    return { beliefs };
  }

  async react(req: ReactRequest): Promise<ReactResult> {
    const r = new Rng({ rng: hash(`${req.time}|${req.witness.name}|${req.observed}`) });
    const line = /argu|tense|words/.test(req.observed)
      ? r.pick(['Everything all right over there?', 'Hey, easy, you two.', 'Oh dear.'])
      : r.pick(['Morning, you two!', 'Don\'t mind me.', 'Sounds like fun!']);
    return { line, memory: `Noticed ${req.observed}.` };
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
