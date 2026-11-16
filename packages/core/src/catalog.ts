/**
 * The town's price list and catalogues: jobs, workplaces, kinds of business, homes and land.
 * Every number that sets how hard it is to get ahead lives here, so the economy can be tuned in one place.
 */
import type { BuildingKind, BusinessType, District, NeedKey, SocialClass } from './types';

/** Everyday prices in dollars. Nothing in Agentville is free. */
export const PRICES = {
  cafeMeal: 14,
  coffee: 5,
  groceries: 48,
  groceryMeals: 6,
  swim: 8,
  party: 25,
  doctor: 60,
};

/** Daily cost of a roof over your head, per household. */
export const RENT: Record<'apartments' | 'home' | 'villa', number> = { apartments: 24, home: 44, villa: 120 };
/** Daily upkeep for people who own their home outright (repairs, bills, taxes). */
export const UPKEEP: Record<'apartments' | 'home' | 'villa', number> = { apartments: 10, home: 16, villa: 40 };
/** What a whole building is worth. */
export const VALUE: Record<'apartments' | 'home' | 'villa' | 'store' | 'lot', number> = { apartments: 70000, home: 30000, villa: 110000, store: 22000, lot: 0 };
/** Land prices by neighbourhood. */
export const LAND: Record<District, number> = { mill: 4000, centre: 9000, hill: 18000 };
/** What it costs to build on a lot (on top of the land), and builder hours it takes. */
export const BUILD: Record<'home' | 'villa' | 'apartments' | 'store', { cost: number; hours: number; units: number }> = {
  home: { cost: 16000, hours: 40, units: 1 },
  villa: { cost: 55000, hours: 90, units: 1 },
  apartments: { cost: 42000, hours: 100, units: 6 },
  store: { cost: 12000, hours: 30, units: 0 },
};
/** Fitting out a vacant storefront for a new business, and the daily rent the town charges for it. */
export const STORE_FITOUT = 6000;
export const STORE_RENT = 55;

/** The bank: how much it lends and how it is paid back. */
export const BANK = {
  /** Share of a project the borrower must put in themselves. */
  downPayment: 0.2,
  /** A loan is repaid over this many days, with interest added up front. */
  loanDays: 80,
  loanInterest: 0.12,
  mortgageDays: 200,
  mortgageInterest: 0.18,
  /** Repayments may take at most this share of daily income. */
  maxShareOfIncome: 0.5,
};

/** Each class's home and what it looks like from the outside. */
export function classOfHome(kind: BuildingKind): SocialClass {
  return kind === 'villa' ? 'upper' : kind === 'apartments' ? 'working' : 'middle';
}
export const CLASS_WORD: Record<SocialClass, string> = { working: 'working class', middle: 'middle class', upper: 'well-off' };

export interface BusinessKind {
  title: string;
  /** Shop sign, given the owner's surname. */
  name: (surname: string) => string;
  price: number;
  /** What a visit does for a customer. */
  gives: Partial<Record<NeedKey, number>>;
  /** Visit length in sim minutes, and the label people see. */
  minutes: number;
  verb: string;
  /** Hours it opens, and whether it is a place for a meal. */
  open: [number, number];
  meal?: boolean;
  accent: string;
}

export const BUSINESSES: Record<BusinessType, BusinessKind> = {
  cafe: { title: 'café', name: (s) => `${s}'s Café`, price: PRICES.cafeMeal, gives: { hunger: 2, social: 0.25 }, minutes: 50, verb: 'eating at', open: [7, 21], meal: true, accent: '#a0522d' },
  grocery: { title: 'grocery', name: (s) => `${s} Market`, price: PRICES.groceries, gives: {}, minutes: 25, verb: 'buying groceries at', open: [8, 20], accent: '#4f7a3a' },
  bakery: { title: 'bakery', name: (s) => `${s} Bakery`, price: 9, gives: { hunger: 1.8, fun: 0.2 }, minutes: 25, verb: 'buying fresh bread at', open: [7, 18], meal: true, accent: '#c98a3a' },
  restaurant: { title: 'restaurant', name: (s) => `${s}'s Kitchen`, price: 28, gives: { hunger: 2.2, social: 0.35, fun: 0.35 }, minutes: 70, verb: 'having dinner at', open: [12, 23], meal: true, accent: '#9c3b2f' },
  gallery: { title: 'art gallery', name: (s) => `${s} Gallery`, price: 12, gives: { fun: 0.95 }, minutes: 45, verb: 'looking at art in', open: [10, 19], accent: '#6a4c93' },
  bookshop: { title: 'bookshop', name: (s) => `${s} Books`, price: 15, gives: { fun: 0.85 }, minutes: 40, verb: 'browsing books at', open: [9, 19], accent: '#2f6b4f' },
  salon: { title: 'salon', name: (s) => `Studio ${s}`, price: 30, gives: { hygiene: 3, fun: 0.3 }, minutes: 40, verb: 'getting a haircut at', open: [9, 18], accent: '#c0507a' },
  gym: { title: 'gym', name: (s) => `${s} Fitness`, price: 12, gives: { fun: 0.8, energy: 0.1 }, minutes: 60, verb: 'working out at', open: [6, 22], accent: '#d0603a' },
  boutique: { title: 'clothing boutique', name: (s) => `${s} & Co.`, price: 40, gives: { fun: 1.0 }, minutes: 35, verb: 'shopping for clothes at', open: [10, 19], accent: '#3a5fa8' },
  workshop: { title: 'repair workshop', name: (s) => `${s} Repairs`, price: 18, gives: { fun: 0.75 }, minutes: 30, verb: 'getting something fixed at', open: [8, 17], accent: '#7a6a3a' },
  studio: { title: 'design studio', name: (s) => `${s} Studio`, price: 20, gives: { fun: 0.85 }, minutes: 40, verb: 'taking a class at', open: [10, 20], accent: '#2f8a83' },
};

/** Ambitions mention the business people dream of; this finds it. */
export function businessInAmbition(ambition: string): BusinessType | null {
  const a = ambition.toLowerCase();
  const map: [RegExp, BusinessType][] = [
    [/bakery|bread|pastr/, 'bakery'],
    [/restaurant|kitchen|second place|diner/, 'restaurant'],
    [/gallery|paintings|mural/, 'gallery'],
    [/book|bestseller|writing/, 'bookshop'],
    [/salon|hair/, 'salon'],
    [/gym|fitness|coach/, 'gym'],
    [/boutique|fashion|clothes/, 'boutique'],
    [/repair|workshop|landscaping|garden/, 'workshop'],
    [/company|app|product|studio|tutoring|design/, 'studio'],
  ];
  for (const [re, t] of map) if (re.test(a)) return t;
  return null;
}

export interface JobKind {
  title: string;
  /** Workplace kind, or null for people who work from home. */
  work: BuildingKind | null;
  wage: number;
  pension?: number;
  /** Titles for each promotion level. */
  ranks?: string[];
  ambitions: string[];
}

export const JOBS: Record<string, JobKind> = {
  barista: { title: 'barista', work: 'cafe', wage: 18, ranks: ['senior barista', 'café manager'], ambitions: ['save enough to open my own bakery on Linden Street', 'become the café manager and one day buy a share of it'] },
  cafeOwner: { title: 'café owner', work: 'cafe', wage: 0, ambitions: ['turn the Corner Café into the heart of town and open a second place, a real restaurant', 'make the café profitable enough to buy the building'] },
  grocer: { title: 'grocer', work: 'shop', wage: 0, ambitions: ['grow Maple Grocery into the supplier for every business in town', 'open a farmers market in Linden Park'] },
  shopAssistant: { title: 'shop assistant', work: 'shop', wage: 16, ranks: ['senior shop assistant', 'store manager'], ambitions: ['open my own clothing boutique', 'save for a house of my own in Downtown'] },
  storeAssistant: { title: 'shop assistant', work: 'store', wage: 17, ranks: ['senior assistant', 'store manager'], ambitions: ['open a business of my own one day', 'save for a house of my own in Downtown'] },
  owner: { title: 'business owner', work: 'store', wage: 0, ambitions: ['grow my business and open a second one'] },
  clerk: { title: 'town clerk', work: 'townhall', wage: 25, ranks: ['senior clerk', 'head of planning'], ambitions: ['get the town to build a proper square with shops, and run for mayor one day', 'bring new families and businesses to Agentville'] },
  mayor: { title: 'mayor', work: 'townhall', wage: 45, ambitions: ['make Agentville the fastest-growing town in the region', 'fill every empty lot in town with homes and shops'] },
  developer: { title: 'software developer', work: 'tech', wage: 48, ranks: ['senior developer', 'lead engineer', 'head of engineering'], ambitions: ['become lead engineer at Linden Labs, then start my own company here', 'build an app that every business in town uses'] },
  designer: { title: 'product designer', work: 'tech', wage: 40, ranks: ['senior designer', 'design lead'], ambitions: ['launch my own design studio and make it famous', 'save enough to build my own house'] },
  founder: { title: 'founder of Linden Labs', work: 'tech', wage: 110, ambitions: ['make Linden Labs the biggest employer in town and build apartments for my staff', 'buy up land in Hillcrest and build the finest villas in town'] },
  accountant: { title: 'accountant', work: 'office', wage: 34, ranks: ['senior accountant', 'partner at the firm'], ambitions: ['become the town\'s go-to financial adviser and invest in local businesses', 'build up enough savings to never worry about money again'] },
  architect: { title: 'architect', work: 'office', wage: 46, ranks: ['senior architect', 'principal architect'], ambitions: ['design a whole new block of apartments for Mill End', 'build a villa in Hillcrest that people talk about'] },
  banker: { title: 'bank manager', work: 'bank', wage: 58, ranks: ['regional manager'], ambitions: ['finance every new business in town and get rich on the interest', 'own a villa with the best view in Hillcrest'] },
  teller: { title: 'bank teller', work: 'bank', wage: 21, ranks: ['senior teller', 'loan officer'], ambitions: ['become a loan officer and move out of Mill End', 'save enough to buy a house'] },
  doctor: { title: 'doctor', work: 'clinic', wage: 72, ranks: ['senior doctor', 'head of the clinic'], ambitions: ['open a private practice in Hillcrest', 'build a bigger clinic for the town'] },
  nurse: { title: 'nurse', work: 'clinic', wage: 29, ranks: ['senior nurse', 'head nurse'], ambitions: ['move my family into a real house', 'study to become a doctor'] },
  bartender: { title: 'bartender', work: 'club', wage: 17, ranks: ['head bartender', 'club manager'], ambitions: ['open my own restaurant with a bar', 'open a café that beats the Corner Café on price'] },
  lifeguard: { title: 'lifeguard', work: 'pool', wage: 16, ranks: ['head lifeguard'], ambitions: ['open a gym in town', 'save enough to leave Mill End'] },
  factoryWorker: { title: 'factory worker', work: 'factory', wage: 17, ranks: ['machine operator', 'shift supervisor', 'plant manager'], ambitions: ['get out of the factory and open a repair workshop', 'open my own grocery and undercut Maple Grocery', 'move my family to a house in Downtown'] },
  builder: { title: 'builder', work: 'factory', wage: 22, ranks: ['senior builder', 'site manager'], ambitions: ['start my own building company', 'build my own house with my own hands'] },
  gardener: { title: 'park gardener', work: 'park', wage: 19, ranks: ['head gardener'], ambitions: ['make Linden Park the pride of the town and start a landscaping business', 'earn enough to rent a plot and grow produce to sell'] },
  painter: { title: 'painter who works from home', work: null, wage: 16, ambitions: ['sell enough paintings to open a gallery on Linden Street', 'get commissioned to paint a mural for the town'] },
  writer: { title: 'novelist who works from home', work: null, wage: 14, ambitions: ['write a bestseller that puts Agentville on the map', 'open a bookshop and earn a living from books'] },
  retired: { title: 'retired teacher', work: null, wage: 0, pension: 85, ambitions: ['help the town grow by mentoring young people, and keep my savings growing', 'invest my savings in a young person\'s business'] },
  investor: { title: 'retired investor', work: null, wage: 0, pension: 320, ambitions: ['invest in the businesses that will make this town great', 'build apartments and live off the rent'] },
  unemployed: { title: 'out of work', work: null, wage: 0, ambitions: ['find a steady job and climb out of debt', 'land a job at Linden Labs'] },
};

/** How many people each kind of workplace employs (owners not counted). */
export const STAFF: Partial<Record<BuildingKind, number>> = {
  cafe: 3,
  shop: 2,
  townhall: 4,
  office: 3,
  tech: 8,
  bank: 3,
  clinic: 4,
  club: 3,
  pool: 2,
  factory: 9,
  park: 2,
  store: 2,
};

/** The job that a workplace hires for when it has room. */
export const HIRES: Partial<Record<BuildingKind, string[]>> = {
  cafe: ['barista'],
  shop: ['shopAssistant'],
  townhall: ['clerk'],
  office: ['accountant', 'architect'],
  tech: ['developer', 'designer'],
  bank: ['teller'],
  clinic: ['nurse', 'doctor'],
  club: ['bartender'],
  pool: ['lifeguard'],
  factory: ['factoryWorker', 'builder', 'builder'],
  park: ['gardener'],
  store: ['storeAssistant'],
};

/** The rank title after a promotion, or a generic one. */
export function rankTitle(jobKey: string, level: number): string {
  const job = JOBS[jobKey];
  if (!job) return 'worker';
  if (level <= 0) return job.title;
  const ranks = job.ranks ?? [];
  return ranks[Math.min(level, ranks.length) - 1] ?? `senior ${job.title}`;
}
