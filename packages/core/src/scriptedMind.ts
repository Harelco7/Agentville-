/**
 * A mind that needs no LLM: conversations, plans and reactions from templates.
 * Used by the in-browser demo, when no API key is set, and when the daily LLM budget runs out.
 */
import { LETTERS, type ConverseRequest, type ConverseResult, type DecideRequest, type DecideResult, type Mind, type PlanRequest, type PlanResult, type ReactRequest, type ReactResult, type ReflectRequest, type ReflectResult, type SpeakerLetter } from './mind';
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
    key: 'getting ahead',
    lines: (_a, _b, r) => [
      [r.pick(['I\'m putting every spare dollar aside this month.', 'Do you ever think about starting something of your own?', 'Rent went out this morning and I felt it.']), r.pick(['Smart. Nobody is going to hand it to us.', 'All the time. I just need the money first.', 'Same. It adds up fast.'])],
      [r.pick(['If you ever need a partner, ask me first.', 'Extra hours are the only way I see.', 'One good idea and a lot of work, that\'s the plan.']), r.pick(['I might take you up on that.', 'Just don\'t burn out.', 'Then let\'s both get to work.'])],
    ],
  },
  {
    key: 'the town\'s future',
    lines: (_a, _b, r) => [
      [r.pick(['Linden Labs is growing. The town could use more places like it.', 'This street needs a proper square.', 'Half the lots in town are still empty. We should bring people in.']), r.pick(['More jobs, more customers for everyone.', 'If the town grows, we all do better.', 'Somebody has to make it happen.'])],
      [r.pick(['Maybe that somebody is us.', 'I\'ll bring it up at the office.', 'Let\'s talk to the others about it.']), r.pick(['I\'m in.', 'Count me in, if it pays.', 'Fine, but we do the work ourselves.'])],
    ],
  },
  {
    key: 'business ideas',
    lines: (_a, _b, r) => [
      [r.pick(['There are two empty storefronts on the street. Someone should open something.', 'If I had the money I\'d open a proper restaurant.', 'The bank is lending again, I hear.']), r.pick(['A bakery would do well, everyone walks past there.', 'You\'d need a partner with deep pockets.', 'Lending, at their interest rates? Careful.'])],
      [r.pick(['Want to go in on it together?', 'I\'m serious about it this time.', 'Maybe I\'ll talk to the bank manager.']), r.pick(['Show me the numbers first.', 'Then do it. Nobody else will.', 'Only if you don\'t mind me checking the books.'])],
    ],
  },
  {
    key: 'new buildings',
    lines: (_a, _b, r) => [
      [r.pick(['Did you see they\'re building on one of the empty lots?', 'Hillcrest keeps getting fancier.', 'Mill End needs more flats, they\'re all full.']), r.pick(['The builders were there at seven this morning.', 'Must be nice to afford it up there.', 'More flats means more people and more customers.'])],
    ],
  },
  {
    key: 'jobs',
    lines: (_a, _b, r) => [
      [r.pick(['Ironbridge Works is hiring again.', 'I asked for a raise today.', 'Linden Labs is looking for people.']), r.pick(['Hard work, but it pays the rent.', 'And? Did you get it?', 'Only if you can code, I bet.'])],
      [r.pick(['Better than nothing.', 'They said to keep it up and we\'ll see.', 'I might learn, honestly.']), r.pick(['True enough.', 'That\'s a maybe, then.', 'Good for you.'])],
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

const GROUP_CHIME = [
  'Sorry to butt in, but I heard that too.',
  'I was just thinking the same thing.',
  'Mind if I join you? This sounds interesting.',
  'Honestly, I\'m not so sure about that.',
  'Ha, that\'s exactly what I told my neighbour.',
  'Count me in, if it\'s worth the money.',
];

export class ScriptedMind implements Mind {
  async converse(req: ConverseRequest): Promise<ConverseResult> {
    const names = req.people.map((p) => first(p.name));
    const r = new Rng({ rng: hash(`${req.time}|${names.join('|')}`) });
    const [a, b] = names;
    const feelings = req.feelings.join(' ');
    const fond = /close friend|a friend/.test(req.feelings[0] ?? '');
    const dislike = /dislike|annoying/.test(feelings);
    const tone: Tone = dislike && r.chance(0.6) ? 'tense' : fond ? r.pick(['warm', 'friendly']) : r.pick(['friendly', 'neutral', 'friendly']);

    const lines: { speaker: SpeakerLetter; text: string }[] = [];
    const say = (speaker: SpeakerLetter, text: string) => lines.push({ speaker, text });
    say('a', tone === 'tense' ? `Oh. Hi, ${b}.` : r.pick([`Hi ${b}!`, `${b}, good to see you.`, `Hey ${b}, how are you?`]));
    say('b', tone === 'tense' ? `${a}.` : r.pick([`Hi ${a}! I\'m well, you?`, `Good to see you too.`, `Not bad at all. You?`]));

    // Gossip travels: if someone remembers overhearing something, they pass it on.
    const gossipMemory = [...req.people[0].memories].reverse().find((m) => /overheard|heard that/i.test(m));
    let topicKey: string;
    let gossip: string | null = null;
    if (tone === 'tense') {
      const [x, y] = r.pick(TENSE_LINES);
      say('a', x);
      say('b', y);
      say('a', 'Fine. Let\'s just drop it.');
      topicKey = 'an old grievance';
      gossip = `${a} and ${b} had words at ${req.place}`;
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
    // Others in a group chip in.
    req.people.slice(2).forEach((_, i) => say(LETTERS[i + 2], r.pick(GROUP_CHIME)));
    say('b', tone === 'tense' ? 'Fine.' : r.pick(['Anyway, I should get going.', 'I\'d better get on with my day.', 'Let\'s catch up again soon.']));
    say('a', tone === 'tense' ? '...' : r.pick(['See you around!', 'Take care.', 'Yes, soon!']));

    const change = tone === 'tense' ? -r.int(3, 7) : tone === 'warm' ? r.int(3, 6) : r.int(1, 3);
    const group = names.length > 2;
    const others = (i: number) => names.filter((_, j) => j !== i).join(' and ');
    return {
      lines,
      topic: topicKey,
      tone,
      summary:
        tone === 'tense'
          ? `${a} and ${b} had a short, tense exchange about ${topicKey}.`
          : group
            ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} got talking about ${topicKey}.`
            : `${a} and ${b} chatted about ${topicKey}.`,
      affinityChanges: names.map((_, i) => (i < 2 ? change : Math.max(0, change - 1))),
      memories: names.map((_, i) => (tone === 'tense' && i < 2 ? `Had an awkward exchange with ${others(i)} about ${topicKey}.` : `Chatted with ${others(i)} about ${topicKey}.`)),
      gossip,
      importance: tone === 'tense' ? 5 : group ? 3 : 2,
    };
  }

  /** The engine lists the sensible option first, so the scripted mind takes it and explains it plainly. */
  async decide(req: DecideRequest): Promise<DecideResult> {
    const r = new Rng({ rng: hash(`${req.time}|${req.person.name}|${req.options[0]}`) });
    const nervous = /quick to worry/.test(req.person.personality);
    const choice = nervous && req.options.length > 1 && r.chance(0.25) ? req.options.length - 1 : 0;
    const option = req.options[choice].split(':')[0].replace(/\.$/, '');
    const reason =
      choice === 0
        ? r.pick([`Nobody is going to hand it to me, so I'm going to ${lower(option)}.`, `It's a risk, but I've worked for this. Time to ${lower(option)}.`, `The numbers work if I'm careful, so I'll ${lower(option)}.`])
        : r.pick([`It's too big a risk right now. I'll ${lower(option)}.`, `Not yet. I'll ${lower(option)} until I'm surer.`]);
    return { choice, reason };
  }

  async planDay(req: PlanRequest): Promise<PlanResult> {
    const r = new Rng({ rng: hash(`${req.time}|${req.person.name}`) });
    const friend = req.townsfolk.length && r.chance(0.6) ? first(r.pick(req.townsfolk)) : null;
    const broke = /in debt|no food/.test(req.person.money);
    const base = broke
      ? r.pick(['Work every hour I can and spend nothing until I\'m back on my feet', 'Pick up extra work and stop eating out'])
      : r.pick([
          `Work hard and take one real step toward my goal: ${req.person.ambition}`,
          'Put in a full day, save what I can, and look for an opportunity',
          'Do good work today and make one useful connection',
          'Get my errands done and keep my spending tight',
        ]);
    return { plan: friend ? `${base}, and catch up with ${friend}.` : `${base}.`, wantsToSee: friend };
  }

  async reflect(req: ReflectRequest): Promise<ReflectResult> {
    const p = req.person;
    const mem = p.memories.join(' ');
    const r = new Rng({ rng: hash(`${p.name}|${p.memories.length}|${p.money}`) });
    // Lessons drawn from what actually happened to them, in their own circumstances.
    const options: string[] = [];
    if (/chatted|talked/i.test(mem)) options.push('Talking with neighbours makes my days better.', 'You learn a lot just by listening to people in this town.', 'The right conversation can open a door.');
    if (/tense|awkward|argu|fell out/i.test(mem)) options.push('Some things are better said kindly, or not at all.', 'I should pick my battles more carefully.');
    if (/loan|mortgage|borrow|debt/i.test(mem)) options.push('Debt is a promise I have to keep every single day.', 'Borrowing is easy; paying it back is the real work.');
    if (/price|cheaper|undercut|price war/i.test(mem)) options.push('If someone sells it cheaper, people notice fast.', 'Nobody in this town owes you their custom.');
    if (/opened|business|shop|bakery/i.test(mem)) options.push('A business is only as good as its last week of takings.', 'Ideas are cheap; opening the doors is what counts.');
    if (/fired|laid off|lost (my|the) job/i.test(mem)) options.push('Nothing at work is guaranteed. I need a plan B.', 'Showing up is half the job, and I will not forget it.');
    if (/promot|raise/i.test(mem)) options.push('Hard work does get noticed here, eventually.');
    if (/moved|new home|house|flat|villa/i.test(mem)) options.push('Where you live changes who you see every day.');
    if (/build|built|construction/i.test(mem)) options.push('This town keeps growing, and I want my piece of it.');
    if (/\$-|owes|in debt|broke/i.test(p.money)) options.push('Every dollar has to count right now.');
    if (!options.length) options.push('A quiet day can be a good day.', 'Small steps still move me toward what I want.', `I keep thinking about how to ${lower(p.ambition)}.`);
    const beliefs = r.shuffle(options).slice(0, options.length > 3 ? 2 : 1);
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
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
