/**
 * The town's economy: rent and mortgages, the bank, jobs and promotions, businesses with their own books,
 * building on empty lots, moving house, and newcomers who arrive for work.
 *
 * Nothing is free. Money moves between people (customers pay owners, tenants pay landlords, owners pay staff),
 * and between people and the town (land, public wages, rent on town property). Big choices go through the
 * person's mind, and the reason they give becomes a lasting memory.
 */
import { BANK, BUILD, BUSINESSES, CLASS_WORD, classOfHome, HIRES, JOBS, LAND, rankTitle, STAFF, STORE_FITOUT, UPKEEP } from './catalog';
import { dayOf, isWeekend } from './clock';
import type { Engine } from './engine';
import { bioOf, makePerson, rentFor } from './worldgen';
import { LOT_XS, sidewalkPoint, streetOf } from './layout';
import type { AgentState, Building, BuildingKind, Business, BusinessType, District } from './types';

/** Most people a town of this size can hold before newcomers stop arriving. */
export const MAX_POPULATION = 70;
const NEWCOMER_NAMES = ['Aviv', 'Bella', 'Carlos', 'Dina', 'Erez', 'Fatima', 'Gil', 'Hadas', 'Ivan', 'Jasmine', 'Karim', 'Liat', 'Moshe', 'Nora', 'Oren', 'Pia', 'Ronen', 'Selma', 'Tamar', 'Uri', 'Vera', 'Wes', 'Xena', 'Yonatan', 'Zara', 'Ezra', 'Maia', 'Rui', 'Hila', 'Ofer'];
const NEWCOMER_SURNAMES = ['Adler', 'Barak', 'Cruz', 'Dahan', 'Engel', 'Friedman', 'Gold', 'Harel', 'Ito', 'Jansen', 'Klein', 'Lowe', 'Meir', 'Nash', 'Olsen', 'Peretz', 'Reyes', 'Stone', 'Tal', 'Vidal'];

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

export class Economy {
  private lastTownDay = 0;
  /** Days on which a workplace couldn't hire for lack of homes, which pushes investors to build. */
  housingShortage = 0;

  constructor(private e: Engine) {
    this.lastTownDay = dayOf(e.world.time);
  }

  private get w() {
    return this.e.world;
  }

  // ---------------------------------------------------------------- lookups

  homeOf(a: AgentState): Building {
    return this.e.building(a.homeId)!;
  }

  household(a: AgentState): AgentState[] {
    return this.w.agents.filter((o) => o.household === a.household);
  }

  /** Households living in a home. */
  householdsIn(b: Building): Set<string> {
    return new Set(this.w.agents.filter((a) => a.homeId === b.id).map((a) => a.household));
  }

  freeUnits(b: Building): number {
    return b.units - this.householdsIn(b).size;
  }

  isOwner(a: AgentState): boolean {
    const b = a.workId ? this.e.building(a.workId) : undefined;
    return !!b?.business && b.business.ownerId === a.id;
  }

  /** Unemployed: of working age, without a job, a pension or a business. */
  isUnemployed(a: AgentState): boolean {
    return !a.job && !a.pension && !a.workId && !this.isOwner(a);
  }

  staffOf(b: Building): AgentState[] {
    return this.w.agents.filter((a) => a.workId === b.id && !(b.business && b.business.ownerId === a.id));
  }

  /** How many staff a workplace wants. Businesses only hire when the books allow it. */
  capacity(b: Building): number {
    if (b.kind === 'store' && !b.business) return 0;
    if (b.business) {
      const base = b.kind === 'store' ? 0 : 1;
      return base + (b.business.lastProfit > 110 ? 1 : 0) + (b.business.lastProfit > 240 ? 1 : 0);
    }
    return STAFF[b.kind] ?? 0;
  }

  vacancies(): { b: Building; job: string }[] {
    const out: { b: Building; job: string }[] = [];
    for (const b of this.w.buildings) {
      const hires = HIRES[b.kind];
      if (!hires) continue;
      const open = this.capacity(b) - this.staffOf(b).length;
      for (let i = 0; i < open; i++) out.push({ b, job: hires[(this.staffOf(b).length + i) % hires.length] });
    }
    return out;
  }

  /** What a person brings in on an ordinary day, before costs. */
  dailyIncome(a: AgentState): number {
    if (a.pension) return a.pension;
    if (this.isOwner(a)) return Math.max(0, this.e.building(a.workId!)!.business!.lastProfit);
    return a.wage * 8 * (5 / 7);
  }

  /** What they pay every day for their home and their loans. */
  dailyCosts(a: AgentState): number {
    const home = this.homeOf(a);
    const share = 1 / Math.max(1, this.household(a).length);
    const housing = a.tenure === 'rent' ? home.rent * share : UPKEEP[homeType(home.kind)] * share;
    return housing + a.debts.reduce((s, d) => s + d.perDay, 0);
  }

  /** The most the bank will lend, so that repayments stay under half of income. */
  loanCapacity(a: AgentState, income = this.dailyIncome(a)): number {
    const free = income * BANK.maxShareOfIncome - a.debts.reduce((s, d) => s + d.perDay, 0);
    return Math.max(0, Math.floor((free * BANK.loanDays) / (1 + BANK.loanInterest) / 100) * 100);
  }

  borrow(a: AgentState, amount: number, kind: 'loan' | 'mortgage', purpose: string): void {
    if (amount <= 0) return;
    const days = kind === 'loan' ? BANK.loanDays : BANK.mortgageDays;
    const interest = kind === 'loan' ? BANK.loanInterest : BANK.mortgageInterest;
    a.debts.push({ kind, balance: Math.round(amount * (1 + interest)), perDay: Math.round((amount * (1 + interest)) / days), purpose });
    this.e.earn(a, amount, true);
    const bank = this.e.firstOf('bank');
    this.e.remember(a, 'life', `Borrowed ${money(amount)} from ${bank?.name ?? 'the bank'} for ${purpose}, to repay ${money((amount * (1 + interest)) / days)} a day.`, 7);
    this.e.feed('money', `${a.name} ${a.surname} took a ${money(amount)} ${kind} from ${bank?.name ?? 'the bank'} for ${purpose}.`, [a.id], bank ? sidewalkPoint(bank) : undefined);
  }

  // ---------------------------------------------------------------- every day

  /** Once per person at the start of each day: rent, loans, pensions, how work went yesterday, health. */
  newDay(a: AgentState, day: number): void {
    const yesterdayWasWorkday = !isWeekend((day - 2) * 1440 + 600);
    // Pension and rent.
    if (a.pension) this.e.earn(a, a.pension);
    const home = this.homeOf(a);
    const share = 1 / Math.max(1, this.household(a).length);
    if (a.tenure === 'rent') {
      const due = home.rent * share;
      this.e.pay(a, due);
      const landlord = home.ownerId ? this.e.agent(home.ownerId) : undefined;
      if (landlord && landlord.household !== a.household) this.e.earn(landlord, due);
      else this.w.treasury += due;
    } else {
      this.e.pay(a, UPKEEP[homeType(home.kind)] * share);
    }
    // Loans and mortgages.
    for (const d of a.debts) {
      const pay = Math.min(d.perDay, d.balance);
      this.e.pay(a, pay);
      d.balance = Math.round(d.balance - pay);
      if (d.balance <= 0) {
        this.e.remember(a, 'life', `Paid off ${d.purpose}.`, 7);
        this.e.feed('money', `${a.name} ${a.surname} has paid off ${d.purpose}.`, [a.id], a.pos);
      }
    }
    a.debts = a.debts.filter((d) => d.balance > 0);

    // How work went yesterday.
    const work = a.workId ? this.e.building(a.workId) : undefined;
    if (a.job && yesterdayWasWorkday && !this.isOwner(a) && JOBS[a.job]?.work !== null && work?.kind !== 'club' && work?.kind !== 'pool') {
      if (a.workedToday >= 3.5) a.performance += 1 + (a.workedToday >= 7.5 ? 0.6 : 0) + a.traits.conscientiousness * 0.4;
      else if (!a.sick && a.workedToday < 1.5) a.performance -= 2.5;
      this.reviewJob(a);
    } else if (a.job && (work?.kind === 'club' || work?.kind === 'pool') && a.workedToday >= 4) {
      a.performance += 1 + a.traits.conscientiousness * 0.4;
      this.reviewJob(a);
    }
    a.workedToday = 0;

    // Health: now and then someone falls ill and needs the doctor.
    if (a.sick) {
      a.health = Math.min(100, a.health + 22);
      if (a.health >= 75) {
        a.sick = false;
        this.e.remember(a, 'life', 'Feeling better again.', 3);
      }
    } else {
      const risk = 0.018 + a.traits.neuroticism * 0.015 + (a.needs.hunger < 15 ? 0.05 : 0) + (a.needs.energy < 15 ? 0.04 : 0);
      if (this.e.rng.chance(risk)) {
        a.sick = true;
        a.health = 30 + this.e.rng.int(0, 15);
        this.e.remember(a, 'life', 'Woke up ill.', 5);
        this.e.feed('life', `${a.name} ${a.surname} is ill today.`, [a.id], a.pos);
      } else a.health = Math.min(100, a.health + 3);
    }

    // Deep in debt with a home they can't afford: they have to move somewhere cheaper.
    if (a.money < -Math.max(600, this.dailyCosts(a) * 8) && this.household(a)[0] === a) this.moveDown(a);
    // A mortgage that isn't being paid ends in the bank taking the home.
    if (a.money < -9000 && a.debts.some((d) => d.kind === 'mortgage')) this.foreclose(a);
  }

  /** Once for the whole town at the start of each day: business books, hiring, newcomers. */
  townDay(): void {
    const day = dayOf(this.w.time);
    if (day === this.lastTownDay) return;
    this.lastTownDay = day;
    const open = this.w.buildings.filter((b) => b.business);
    for (const b of open) this.setPrices(b);
    for (const b of open) if (b.business) this.settle(b);
    this.newcomers();
    // Fresh land comes on the market as the town grows: prices follow demand.
    const lots = this.w.buildings.filter((b) => b.kind === 'lot' && !b.construction);
    for (const lot of lots) lot.value = Math.round(LAND[lot.district] * (1 + Math.min(1.5, this.w.agents.length / 60 - 0.5)));
  }

  /** A business's day: takings in, supplies, rent and wages out, and the rest to the owner and partners. */
  private settle(b: Building): void {
    const biz = b.business!;
    const owner = this.e.agent(biz.ownerId);
    if (!owner) return;
    const supplies = biz.supplies;
    const rent = b.ownerId ? 0 : b.rent;
    const profit = Math.round(biz.till - supplies - biz.wagesDue - rent);
    if (rent) this.w.treasury += rent;
    biz.lastProfit = Math.round(biz.lastProfit * 0.5 + profit * 0.5);
    biz.till = 0;
    biz.wagesDue = 0;
    biz.supplies = 0;
    biz.lastSales = biz.sales;
    biz.sales = 0;
    if (profit > 0) {
      let left = profit;
      for (const p of biz.partners) {
        const partner = this.e.agent(p.id);
        if (!partner) continue;
        const cut = Math.round(profit * p.share);
        this.e.earn(partner, cut);
        left -= cut;
      }
      this.e.earn(owner, left);
      biz.badDays = 0;
    } else {
      this.e.pay(owner, -profit);
      biz.badDays++;
    }
    // A business that keeps losing money lets its staff go first.
    const staff = this.staffOf(b);
    if (biz.badDays >= 3 && staff.length && this.capacity(b) < staff.length) {
      const s = staff[staff.length - 1];
      this.e.remember(s, 'life', `${owner.name} let me go: ${b.name} can't afford staff right now.`, 8);
      this.e.feed('job', `${b.name} is struggling and let ${s.name} ${s.surname} go.`, [s.id, owner.id], sidewalkPoint(b));
      this.loseJob(s);
    }
    if (biz.badDays >= 7 && owner.money < -1500) this.closeBusiness(b, `${b.name} lost money ${biz.badDays} days in a row and ${owner.name} ran out of money to keep it going`);
  }

  /**
   * Competition. Each owner looks at yesterday's customers against their rivals': losing customers means
   * cutting prices, winning them (or having the market to yourself) means prices can creep up. Prices never
   * fall below what keeps the lights on, so a price war ends with the weakest business closing.
   */
  private setPrices(b: Building): void {
    const biz = b.business!;
    const rivals = this.rivalsOf(biz.type).filter((o) => o !== b);
    const n = rivals.length + 1;
    const total = biz.sales + rivals.reduce((s, o) => s + (o.business?.sales ?? 0), 0);
    const share = total ? biz.sales / total : 1 / n;
    const before = biz.priceFactor;
    const profit = biz.till - biz.supplies - biz.wagesDue;
    let f = before;
    if (rivals.length) {
      if (share < 0.8 / n) f *= 0.93;
      else if (share > 1.3 / n && profit > 0) f *= 1.03;
    } else if (profit > 150 && biz.sales > 10) f *= 1.03;
    else if (biz.sales < 4) f *= 0.96;
    biz.priceFactor = Math.round(Math.max(0.6, Math.min(1.45, f)) * 1000) / 1000;
    const k = BUSINESSES[biz.type];
    const now = this.priceAt(b, k.price);
    if (rivals.length && biz.priceFactor <= biz.announced * 0.92) {
      const cheapest = rivals.map((o) => ({ o, p: this.priceAt(o, k.price) })).sort((x, y) => x.p - y.p)[0];
      biz.announced = biz.priceFactor;
      this.e.feed('business', `Price war: ${b.name} cut its prices to $${now.toFixed(2)}${cheapest ? ` (${cheapest.o.name} charges $${cheapest.p.toFixed(2)})` : ''} to win customers back.`, [biz.ownerId], sidewalkPoint(b));
      const owner = this.e.agent(biz.ownerId);
      if (owner) this.e.remember(owner, 'life', `Cut prices at ${b.name} to $${now.toFixed(2)}: ${cheapest?.o.name ?? 'the competition'} was taking my customers.`, 6);
    } else if (biz.priceFactor >= biz.announced * 1.1) {
      biz.announced = biz.priceFactor;
      this.e.feed('business', `${b.name} raised its prices to $${now.toFixed(2)}${rivals.length ? '' : ': nobody else in town sells what it sells'}.`, [biz.ownerId], sidewalkPoint(b));
    }
  }

  /** The market for each kind of business: who sells, at what price, and how they are doing. */
  market(): { type: BusinessType; title: string; usual: number; sellers: { id: string; name: string; owner: string; price: number; customers: number; profit: number }[] }[] {
    const out = new Map<BusinessType, ReturnType<Economy['market']>[number]>();
    for (const b of this.w.buildings) {
      const biz = b.business;
      if (!biz) continue;
      const k = BUSINESSES[biz.type];
      const row = out.get(biz.type) ?? { type: biz.type, title: k.title, usual: k.price, sellers: [] };
      const owner = this.e.agent(biz.ownerId);
      row.sellers.push({ id: b.id, name: b.name, owner: owner ? `${owner.name} ${owner.surname}` : '', price: this.priceAt(b, k.price), customers: biz.lastSales, profit: biz.lastProfit });
      out.set(biz.type, row);
    }
    return [...out.values()].sort((p, q) => q.sellers.length - p.sellers.length || p.title.localeCompare(q.title));
  }

  // ---------------------------------------------------------------- spending

  /** A customer pays at a place: the money goes to the business's till, or to the town. */
  spend(a: AgentState, place: Building, usual: number): number {
    const price = this.priceAt(place, usual);
    this.e.pay(a, price);
    const biz = place.business;
    if (biz) {
      biz.till += price;
      biz.sales++;
      // Supplies cost the same whatever the shop charges, so a price war eats into the margin.
      biz.supplies += usual * 0.3;
    } else this.w.treasury += price;
    return price;
  }

  /** What a place charges for something that usually costs `usual`. */
  priceAt(place: Building, usual: number): number {
    return Math.round(usual * (place.business?.priceFactor ?? 1) * 100) / 100;
  }

  /** Every open business of a type, e.g. all the cafés in town. */
  rivalsOf(type: BusinessType): Building[] {
    return this.w.buildings.filter((b) => b.business?.type === type);
  }

  /** Wages for a stretch of work: from the business's books for its staff, from the employer otherwise. */
  payWork(a: AgentState, place: Building, hours: number): void {
    a.workedToday += hours;
    if (place.business && place.business.ownerId === a.id) return; // owners live off the profit
    const pay = a.wage * hours;
    if (!pay) return;
    this.e.earn(a, pay);
    if (place.business) place.business.wagesDue += pay;
    else if (place.kind === 'townhall' || place.kind === 'park' || place.kind === 'pool' || place.kind === 'clinic') this.w.treasury -= pay;
  }

  /** Builder hours on a construction site. */
  build(a: AgentState, site: Building, hours: number): void {
    if (!site.construction) return;
    site.construction.done += hours * (1 + a.level * 0.2);
    if (site.construction.done >= site.construction.needed) this.finishConstruction(site);
  }

  activeSites(): Building[] {
    return this.w.buildings.filter((b) => b.construction);
  }

  // ---------------------------------------------------------------- jobs

  private reviewJob(a: AgentState): void {
    const job = JOBS[a.job];
    if (!job) return;
    const ranks = job.ranks?.length ?? 0;
    if (a.performance >= 9 + a.level * 7 && a.level < ranks && a.drive + this.e.rng.range(0, 0.5) > 0.55) {
      a.level++;
      a.performance = 0;
      const before = a.occupation;
      a.wage = Math.round(job.wage * Math.pow(1.18, a.level));
      a.occupation = rankTitle(a.job, a.level);
      a.bio = bioOf(a, this.w);
      this.e.remember(a, 'life', `Promoted from ${before} to ${a.occupation}. Now earning $${a.wage} an hour.`, 8);
      this.e.feed('job', `${a.name} ${a.surname} was promoted to ${a.occupation}.`, [a.id], a.pos);
    } else if (a.performance <= -8) {
      const place = this.e.building(a.workId ?? '');
      this.e.remember(a, 'life', `Fired from ${place?.name ?? 'my job'} for missing too many shifts.`, 9);
      this.e.feed('job', `${a.name} ${a.surname} was let go from ${place?.name ?? 'their job'} after missing too many shifts.`, [a.id], a.pos);
      this.loseJob(a);
    }
  }

  loseJob(a: AgentState): void {
    a.workId = null;
    a.job = '';
    a.wage = 0;
    a.level = 0;
    a.performance = 0;
    a.occupation = 'out of work';
    a.bio = bioOf(a, this.w);
  }

  hire(a: AgentState, b: Building, jobKey: string): void {
    const job = JOBS[jobKey];
    a.job = jobKey;
    a.workId = b.id;
    a.level = 0;
    a.performance = 0;
    a.wage = job.wage;
    a.occupation = job.title;
    a.bio = bioOf(a, this.w);
  }

  /** An unemployed person asks about work at Town Hall. */
  jobHunt(a: AgentState): void {
    const options = this.vacancies().sort((p, q) => JOBS[q.job].wage - JOBS[p.job].wage);
    // Skilled jobs need the right background.
    const skilled = new Set(['developer', 'designer', 'doctor', 'architect', 'accountant']);
    const pick = options.find((v) => !skilled.has(v.job) || v.job === a.job) ?? null;
    if (!pick) {
      this.e.remember(a, 'life', 'Asked about work at Town Hall. Nothing going today.', 4);
      return;
    }
    this.hire(a, pick.b, pick.job);
    this.e.remember(a, 'life', `Got a job as ${a.occupation} at ${pick.b.name}, $${a.wage} an hour.`, 8);
    this.e.feed('job', `${a.name} ${a.surname} got a job as ${a.occupation} at ${pick.b.name}.`, [a.id], sidewalkPoint(pick.b));
  }

  // ---------------------------------------------------------------- newcomers

  private newcomers(): void {
    if (this.w.agents.length >= MAX_POPULATION) return;
    const unemployed = this.w.agents.filter((a) => this.isUnemployed(a)).length;
    const open = this.vacancies().filter((v) => v.b.kind !== 'store' || this.e.rng.chance(0.5));
    if (!open.length || unemployed > 1) return;
    let arrivals = Math.min(2, open.length);
    for (const v of this.e.rng.shuffle([...open])) {
      if (arrivals-- <= 0) break;
      if (!this.e.rng.chance(0.65)) continue;
      const wage = JOBS[v.job].wage;
      const homes = this.w.buildings.filter((b) => (b.kind === 'apartments' || b.kind === 'home' || b.kind === 'villa') && !b.construction && this.freeUnits(b) > 0);
      const fits = homes
        .filter((b) => b.rent < wage * 8 * 0.45)
        .sort((p, q) => (wage >= 40 ? q.rent - p.rent : p.rent - q.rent));
      const home = fits[0];
      if (!home) {
        this.housingShortage++;
        this.e.feed('newcomer', `${v.b.name} wanted to hire ${article(JOBS[v.job].title)}, but there are no homes free in town that they could afford.`, [], sidewalkPoint(v.b));
        continue;
      }
      const rng = this.e.rng;
      const name = rng.pick(NEWCOMER_NAMES);
      const surname = rng.pick(NEWCOMER_SURNAMES);
      const household = `h${this.w.nextId}`;
      const a = makePerson(rng, this.w, { name, surname, age: rng.int(21, 45), job: v.job, money: Math.round(rng.range(150, 900) + wage * 10), drive: Math.round(rng.range(0.4, 0.95) * 100) / 100 }, home, v.b, household, 'rent', this.w.agents.filter((o) => o.homeId === home.id).length);
      for (const o of this.w.agents) {
        const near = this.homeOf(o).district === home.district;
        a.relationships[o.id] = { affinity: near ? rng.int(-5, 12) : rng.int(-10, 6), talks: 0, lastTalk: null };
        o.relationships[a.id] = { affinity: near ? rng.int(-5, 12) : rng.int(-10, 6), talks: 0, lastTalk: null };
      }
      this.e.addAgent(a);
      a.bio = bioOf(a, this.w);
      this.e.remember(a, 'life', `Moved to Agentville to work as ${article(a.occupation)} at ${v.b.name}, and rented ${home.kind === 'apartments' ? `a flat in ${home.name}` : `the ${home.name}`}.`, 8);
      this.e.feed('newcomer', `${name} ${surname} moved to town to work as ${article(a.occupation)} at ${v.b.name}, and lives in ${home.name}.`, [a.id], sidewalkPoint(home));
    }
  }

  // ---------------------------------------------------------------- big decisions

  /** In the morning, a person may take a big step toward their ambition. The mind makes the call. */
  consider(a: AgentState): void {
    const day = dayOf(this.w.time);
    if (day - a.lastDecisionDay < 3 || a.project || a.sick) return;
    if (this.household(a)[0] !== a && !/business|bakery|gallery|studio|restaurant|shop|company/.test(a.ambition)) return;
    const options = [this.businessOption(a), this.homeOption(a), this.investOption(a)].filter((o): o is Offer => !!o).sort((p, q) => q.appeal - p.appeal);
    const offer = options[0];
    if (!offer) return;
    a.lastDecisionDay = day;
    this.e.decide(a, offer.situation, [offer.yes, offer.no], (choice, reason) => {
      if (choice !== 0) {
        this.e.remember(a, 'reflection', `Decided not to ${lower(offer.yes)} yet: ${reason}`, 6);
        return;
      }
      if (!offer.still()) {
        this.e.remember(a, 'life', `Wanted to ${lower(offer.yes)}, but the chance had gone.`, 5);
        return;
      }
      this.e.remember(a, 'life', `Decided to ${lower(offer.yes)}. ${reason}`, 9);
      this.e.feed('decision', `${a.name} ${a.surname} decided to ${lower(offer.yes)}: “${reason}”`, [a.id], a.pos);
      offer.act();
    });
  }

  /** Opening the business in their ambition: in a vacant storefront, or on a lot with a new building. */
  private businessOption(a: AgentState): Offer | null {
    if (this.isOwner(a) || a.pension > 200) return null;
    let type = businessFor(a);
    let copycat = false;
    if (!type && a.drive > 0.7 && !a.pension) {
      // No dream of their own: the driven go where the money is.
      const best = this.market().filter((m) => m.sellers.length < 3).map((m) => ({ m, avg: m.sellers.reduce((s, x) => s + x.profit, 0) / m.sellers.length })).sort((p, q) => q.avg - p.avg)[0];
      if (best && best.avg > 220) {
        type = best.m.type;
        copycat = true;
      }
    }
    if (!type) return null;
    // A market with rivals already in it is only worth entering if they are making good money.
    const rivals = this.rivalsOf(type);
    if (this.w.buildings.some((b) => b.construction?.business === type)) return null;
    if (rivals.length >= 3) return null;
    if (rivals.length && rivals.reduce((s, b) => s + b.business!.lastProfit, 0) / rivals.length < 140) return null;
    const kind = BUSINESSES[type];
    const store = this.w.buildings.find((b) => b.kind === 'store' && !b.business && !b.construction);
    const lot = store ? null : this.cheapestLot(['centre', 'mill']);
    if (!store && !lot) return null;
    const cost = store ? STORE_FITOUT : lot!.value + BUILD.store.cost;
    const down = Math.ceil(cost * BANK.downPayment);
    const loanRoom = this.loanCapacity(a, 150);
    const partner = this.findPartner(a, cost);
    const own = Math.max(0, Math.min(a.money - 150, cost));
    const partnerPut = partner ? Math.min(Math.round(cost * 0.45), Math.max(0, cost - own)) : 0;
    const loan = Math.max(0, cost - own - partnerPut);
    if (own + partnerPut < down || loan > loanRoom) return null;
    const where = store ? `the vacant storefront at ${place(store)}` : `the empty lot at ${place(lot!)} (land ${money(lot!.value)}, building ${money(BUILD.store.cost)})`;
    const name = kind.name(a.surname);
    const plan = [`put in ${money(own)} of my own`, loan ? `borrow ${money(loan)} from the bank (about ${money((loan * (1 + BANK.loanInterest)) / BANK.loanDays)} a day for ${BANK.loanDays} days)` : '', partner ? `take ${partner.name} ${partner.surname} on as a partner for ${money(partnerPut)} and a share of the profit` : ''].filter(Boolean);
    return {
      appeal: 1 + a.drive,
      situation: `${a.name} has ${money(a.money)}. Opening ${name}, a ${kind.title}, in ${where} would cost ${money(cost)}. ${a.job ? `They would quit their job as ${a.occupation} to run it.` : ''} ${rivals.length ? `It would compete with ${rivals.map((r) => `${r.name} (charging ${money(this.priceAt(r, kind.price))}, about ${money(r.business!.lastProfit)} profit a day)`).join(' and ')}: to win customers it may have to charge less.` : `There is no other ${kind.title} in town yet.`}${copycat ? ` It isn't their dream, but ${kind.title}s are making money.` : ''} A new business in a town of ${this.w.agents.length} people is a gamble: it may not earn enough at first, and the bank wants its money every day either way.`,
      yes: `Open ${name}: ${plan.join(', ')}`,
      no: 'Keep saving and wait for a better moment',
      still: () => (store ? !store.business && !store.construction : lot!.kind === 'lot' && !lot!.construction),
      act: () => {
        this.e.pay(a, own);
        if (loan) this.borrow(a, loan, 'loan', `opening ${name}`);
        this.e.pay(a, loan);
        const partners: { id: string; share: number; invested: number }[] = [];
        if (partner && partnerPut) {
          this.e.pay(partner, partnerPut);
          const share = Math.round(Math.min(0.45, (partnerPut / cost) * 0.8) * 100) / 100;
          partners.push({ id: partner.id, share, invested: partnerPut });
          this.e.remember(partner, 'life', `Invested ${money(partnerPut)} in ${a.name}'s new ${kind.title}, ${name}, for ${Math.round(share * 100)}% of the profit.`, 8);
          this.e.feed('business', `${partner.name} ${partner.surname} invested ${money(partnerPut)} in ${a.name}'s ${kind.title} for ${Math.round(share * 100)}% of the profit.`, [partner.id, a.id], partner.pos);
          const rel = (a.relationships[partner.id] ??= { affinity: 0, talks: 0, lastTalk: null });
          rel.affinity = Math.min(100, rel.affinity + 12);
          const back = (partner.relationships[a.id] ??= { affinity: 0, talks: 0, lastTalk: null });
          back.affinity = Math.min(100, back.affinity + 8);
        }
        if (store) {
          this.w.treasury += cost;
          this.openBusiness(store, a, type, partners);
        } else {
          this.w.treasury += lot!.value;
          a.project = { kind: 'open_business', business: type, buildingId: lot!.id, partnerId: partner?.id };
          this.startConstruction(lot!, 'store', a, type, partners);
        }
      },
    };
  }

  /** Moving up: renting a better home, or building one on a lot. */
  private homeOption(a: AgentState): Offer | null {
    if (this.household(a)[0] !== a) return null;
    const home = this.homeOf(a);
    const cls = classOfHome(home.kind);
    const income = this.household(a).reduce((s, m) => s + this.dailyIncome(m), 0);
    const savings = this.household(a).reduce((s, m) => s + m.money, 0);
    // Build a villa: the well-off and the very successful.
    if (cls !== 'upper' && savings > 30000 && income > 300 && /villa|house|home|hillcrest/.test(a.ambition + ' upper')) {
      const lot = this.cheapestLot(['hill']);
      if (lot) {
        const cost = lot.value + BUILD.villa.cost;
        const down = Math.max(Math.round(cost * 0.3), Math.min(savings - 2000, cost));
        const mortgage = cost - down;
        return {
          appeal: 0.9 + a.drive * 0.5,
          situation: `${a.name}'s household has ${money(savings)} saved and brings in about ${money(income)} a day. A villa on the lot at ${place(lot)} would cost ${money(cost)} (land and building), paid with ${money(down)} down${mortgage > 0 ? ` and a ${money(mortgage)} mortgage` : ''}. Upkeep in Hillcrest is ${money(UPKEEP.villa)} a day.`,
          yes: `Build a villa in Hillcrest at ${place(lot)}`,
          no: `Stay in the ${home.name} and keep the money`,
          still: () => lot.kind === 'lot' && !lot.construction,
          act: () => {
            this.payFromHousehold(a, down);
            if (mortgage > 0) {
              this.borrow(a, mortgage, 'mortgage', `building a villa at ${place(lot)}`);
              this.e.pay(a, mortgage);
            }
            this.w.treasury += lot.value;
            a.project = { kind: 'build_home', buildingId: lot.id };
            this.startConstruction(lot, 'villa', a);
          },
        };
      }
    }
    if (cls === 'upper') return null;
    // From a flat to a house: rent one if one is free, or build one.
    if (cls === 'working' && savings > 2500 && income * 0.5 > rentFor('home', 'centre')) {
      const house = this.w.buildings.find((b) => b.kind === 'home' && !b.construction && this.freeUnits(b) > 0);
      if (house) {
        return {
          appeal: 0.8 + a.drive * 0.4,
          situation: `${a.name}'s household has ${money(savings)} saved and brings in about ${money(income)} a day. They rent a flat in ${home.name} for ${money(home.rent)} a day. The ${house.name} at ${place(house)} is free to rent for ${money(house.rent)} a day.`,
          yes: `Move into the house at ${place(house)} for ${money(house.rent)} a day`,
          no: `Stay in ${home.name} and keep saving`,
          still: () => this.freeUnits(house) > 0,
          act: () => this.move(a, house, 'rent', `Moved up from a flat in ${home.name} to a house at ${place(house)}, because ${a.name} could finally afford it`),
        };
      }
    }
    if (savings > 9000 && income > 160) {
      const lot = this.cheapestLot(cls === 'working' ? ['mill', 'centre'] : ['centre', 'mill']);
      if (lot) {
        const cost = lot.value + BUILD.home.cost;
        const down = Math.round(cost * 0.25);
        if (savings - down < 500) return null;
        return {
          appeal: 0.7 + a.drive * 0.5,
          situation: `${a.name}'s household has ${money(savings)} saved and brings in about ${money(income)} a day. They ${a.tenure === 'rent' ? `rent the ${home.name} for ${money(home.rent)} a day` : `own the ${home.name}`}. Building their own house on the lot at ${place(lot)} would cost ${money(cost)}: ${money(down)} down and a ${money(cost - down)} mortgage paid over ${BANK.mortgageDays} days.`,
          yes: `Buy the lot at ${place(lot)} and build our own house`,
          no: `Stay where we are and keep saving`,
          still: () => lot.kind === 'lot' && !lot.construction,
          act: () => {
            this.payFromHousehold(a, down);
            this.borrow(a, cost - down, 'mortgage', `building a house at ${place(lot)}`);
            this.e.pay(a, cost - down);
            this.w.treasury += lot.value;
            a.project = { kind: 'build_home', buildingId: lot.id };
            this.startConstruction(lot, 'home', a);
          },
        };
      }
    }
    return null;
  }

  /** The wealthy can build flats to rent out when the town runs out of homes. */
  private investOption(a: AgentState): Offer | null {
    const flatsFull = this.w.buildings.filter((b) => b.kind === 'apartments').every((b) => this.freeUnits(b) <= 1);
    const pressure = this.housingShortage > 0 || flatsFull;
    if (!pressure || a.money < 30000) return null;
    const lot = this.cheapestLot(['mill', 'centre']);
    if (!lot) return null;
    const cost = lot.value + BUILD.apartments.cost;
    const own = Math.min(a.money - 3000, cost);
    const loan = cost - own;
    return {
      appeal: 1.2 + (/invest|apartments|rent|build/.test(a.ambition) ? 0.6 : 0),
      situation: `The town is short of homes: ${this.housingShortage ? 'employers have had to turn newcomers away' : 'the flats are nearly full'}. ${a.name} has ${money(a.money)}. A block of ${BUILD.apartments.units} flats on the lot at ${place(lot)} would cost ${money(cost)}${loan > 0 ? `, with ${money(loan)} borrowed` : ''}, and each flat rents for about ${money(rentFor('apartments', lot.district))} a day.`,
      yes: `Build an apartment block at ${place(lot)} and rent out the flats`,
      no: 'Keep the money where it is',
      still: () => lot.kind === 'lot' && !lot.construction,
      act: () => {
        this.e.pay(a, own);
        if (loan > 0) {
          this.borrow(a, loan, 'loan', `building flats at ${place(lot)}`);
          this.e.pay(a, loan);
        }
        this.w.treasury += lot.value;
        this.housingShortage = 0;
        a.project = { kind: 'build_apartments', buildingId: lot.id };
        this.startConstruction(lot, 'apartments', a);
      },
    };
  }

  /** Someone with money who likes this person enough to invest. */
  private findPartner(a: AgentState, cost: number): AgentState | null {
    const need = cost * 0.45;
    const candidates = this.w.agents
      .filter((o) => o !== a && o.household !== a.household && o.money > need + 1500)
      // Nobody backs more than two new businesses at once.
      .filter((o) => this.w.buildings.filter((b) => b.business?.partners.some((p) => p.id === o.id)).length < 2)
      .map((o) => {
        const fond = o.relationships[a.id]?.affinity ?? 0;
        const investorish = /invest|business|financ|rent/.test(o.ambition) ? 25 : 0;
        return { o, score: fond + investorish + Math.min(30, o.money / 5000) };
      })
      .filter((c) => c.score >= 30)
      .sort((p, q) => q.score - p.score);
    return candidates[0]?.o ?? null;
  }

  private payFromHousehold(a: AgentState, amount: number): void {
    let left = amount;
    for (const m of [a, ...this.household(a).filter((o) => o !== a)]) {
      const take = Math.min(left, Math.max(0, m.money));
      this.e.pay(m, take);
      left -= take;
      if (left <= 0) break;
    }
    if (left > 0) this.e.pay(a, left);
  }

  private cheapestLot(districts: District[]): Building | null {
    for (const d of districts) {
      const lot = this.w.buildings.filter((b) => b.kind === 'lot' && !b.construction && b.district === d).sort((p, q) => p.value - q.value || Math.abs(p.x) - Math.abs(q.x))[0];
      if (lot) return lot;
    }
    return null;
  }

  // ---------------------------------------------------------------- building

  startConstruction(lot: Building, target: 'home' | 'villa' | 'apartments' | 'store', owner: AgentState, business?: BusinessType, partners: { id: string; share: number; invested: number }[] = []): void {
    lot.ownerId = owner.id;
    lot.construction = { target, business, ownerId: owner.id, done: 0, needed: BUILD[target].hours, startedDay: dayOf(this.w.time) };
    lot.name = target === 'store' && business ? `${BUSINESSES[business].name(owner.surname)} (being built)` : `${owner.surname} ${target === 'apartments' ? 'flats' : target} (being built)`;
    if (partners.length) this.pendingPartners.set(lot.id, partners);
    this.e.buildingsChanged();
    const what = target === 'store' && business ? `a ${BUSINESSES[business].title}` : target === 'apartments' ? `a block of ${BUILD.apartments.units} flats` : `a ${target}`;
    this.e.remember(owner, 'life', `Bought the lot at ${place(lot)} and hired Ironbridge Works to build ${what}.`, 8);
    this.e.feed('build', `${owner.name} ${owner.surname} bought the lot at ${place(lot)}. Builders are putting up ${what}.`, [owner.id], sidewalkPoint(lot));
  }

  private pendingPartners = new Map<string, { id: string; share: number; invested: number }[]>();

  private finishConstruction(site: Building): void {
    const c = site.construction!;
    const owner = this.e.agent(c.ownerId);
    site.construction = undefined;
    site.kind = c.target;
    site.units = c.target === 'apartments' ? BUILD.apartments.units : c.target === 'store' ? 0 : 1;
    site.rent = c.target === 'store' ? 0 : rentFor(c.target, site.district);
    site.value = c.target === 'store' ? BUILD.store.cost + site.value : BUILD[c.target].cost + site.value;
    site.walls = c.target === 'villa' ? 'plaster' : site.walls;
    const days = dayOf(this.w.time) - c.startedDay + 1;
    if (!owner) {
      site.name = c.target === 'apartments' ? 'New flats' : 'House';
      this.e.buildingsChanged();
      return;
    }
    owner.project = null;
    if (c.target === 'store' && c.business) {
      site.name = BUSINESSES[c.business].name(owner.surname);
      this.e.feed('build', `Builders finished ${site.name} at ${place(site)} after ${days} days.`, [owner.id], sidewalkPoint(site));
      this.openBusiness(site, owner, c.business, this.pendingPartners.get(site.id) ?? []);
      this.pendingPartners.delete(site.id);
    } else if (c.target === 'apartments') {
      site.name = `${owner.surname} Flats`;
      this.e.remember(owner, 'life', `My block of flats at ${place(site)} is finished. Time to find tenants.`, 8);
      this.e.feed('build', `${site.name} is finished: ${site.units} new flats at ${place(site)}, owned by ${owner.name} ${owner.surname}.`, [owner.id], sidewalkPoint(site));
      this.housingShortage = 0;
    } else {
      site.name = `${owner.surname} ${c.target === 'villa' ? 'villa' : 'house'}`;
      this.e.feed('build', `Builders finished the ${site.name} at ${place(site)} after ${days} days.`, [owner.id], sidewalkPoint(site));
      const old = this.homeOf(owner);
      const tenure = owner.debts.some((d) => d.kind === 'mortgage' && d.purpose.includes(place(site))) ? 'mortgage' : 'own';
      this.move(owner, site, tenure, `Moved from the ${old.name} into the ${c.target} ${owner.name} built at ${place(site)}`);
    }
    this.e.buildingsChanged();
  }

  // ---------------------------------------------------------------- businesses

  openBusiness(b: Building, owner: AgentState, type: BusinessType, partners: { id: string; share: number; invested: number }[]): void {
    const kind = BUSINESSES[type];
    b.kind = 'store';
    b.name = kind.name(owner.surname);
    b.accent = kind.accent;
    const rivals = this.rivalsOf(type);
    // A newcomer to a crowded market opens a little under the going rate.
    const going = rivals.length ? rivals.reduce((s, r) => s + r.business!.priceFactor, 0) / rivals.length : 1;
    const priceFactor = Math.round((rivals.length ? going * 0.95 : 1) * 1000) / 1000;
    b.business = newBusiness(type, owner, dayOf(this.w.time), priceFactor, partners);
    const oldWork = owner.workId ? this.e.building(owner.workId) : undefined;
    owner.workId = b.id;
    owner.job = 'owner';
    owner.wage = 0;
    owner.level = 0;
    owner.performance = 0;
    owner.occupation = `owner of ${b.name}`;
    owner.project = null;
    owner.bio = bioOf(owner, this.w);
    this.e.remember(owner, 'life', `Opened ${b.name}${oldWork ? `, and quit my job at ${oldWork.name}` : ''}. It's mine now, for better or worse.`, 10);
    this.e.feed('business', `${owner.name} ${owner.surname} opened ${b.name}, a new ${kind.title} at ${place(b)}.`, [owner.id, ...partners.map((p) => p.id)], sidewalkPoint(b));
    this.e.buildingsChanged();
  }

  closeBusiness(b: Building, why: string): void {
    const biz = b.business!;
    const owner = this.e.agent(biz.ownerId);
    for (const s of this.staffOf(b)) {
      this.e.remember(s, 'life', `Lost my job when ${b.name} closed.`, 8);
      this.loseJob(s);
    }
    for (const p of biz.partners) {
      const partner = this.e.agent(p.id);
      if (partner) this.e.remember(partner, 'life', `${b.name} closed. The ${money(p.invested)} I invested is gone.`, 8);
    }
    const name = b.name;
    b.business = undefined;
    if (b.ownerId === biz.ownerId) {
      // The bank sells the building back to the town.
      b.ownerId = null;
    }
    b.name = 'Vacant storefront';
    if (owner) {
      this.e.remember(owner, 'life', `Had to close ${name}: ${why}.`, 10);
      this.loseJob(owner);
    }
    this.e.feed('business', `${name} has closed: ${why}.`, owner ? [owner.id] : [], sidewalkPoint(b));
    this.e.buildingsChanged();
  }

  // ---------------------------------------------------------------- moving house

  move(a: AgentState, to: Building, tenure: AgentState['tenure'], why: string): void {
    const from = this.homeOf(a);
    const before = classOfHome(from.kind);
    const after = classOfHome(to.kind);
    const members = this.household(a);
    const slot0 = this.w.agents.filter((o) => o.homeId === to.id).length;
    members.forEach((m, i) => {
      m.homeId = to.id;
      m.tenure = tenure;
      m.anchor = slot0 + i;
      m.bio = bioOf(m, this.w);
    });
    if (tenure !== 'rent' && to.kind !== 'apartments') to.ownerId = a.id;
    if (from.ownerId === a.id && from.kind !== 'apartments' && from.kind !== 'villa' && tenure !== 'rent') {
      // Their old house goes up for rent.
      from.name = 'House';
    }
    const change = before !== after ? ` That makes them ${CLASS_WORD[after]} now, not ${CLASS_WORD[before]}.` : '';
    for (const m of members) this.e.remember(m, 'life', `${why}.${change}`, before !== after ? 9 : 7);
    this.e.feed('move', `${members.map((m) => m.name).join(' and ')} ${members.length > 1 ? 'have' : 'has'} moved: ${lower(why)}.${change}`, members.map((m) => m.id), sidewalkPoint(to));
    this.e.buildingsChanged();
  }

  /** Can't afford where they live: down to the cheapest free flat. */
  moveDown(a: AgentState): void {
    const home = this.homeOf(a);
    if (home.kind === 'apartments' && a.tenure === 'rent') return;
    const cheaper = this.w.buildings
      .filter((b) => b.id !== home.id && !b.construction && (b.kind === 'apartments' || b.kind === 'home') && this.freeUnits(b) > 0 && b.rent < (a.tenure === 'rent' ? home.rent : 1e9))
      .sort((p, q) => p.rent - q.rent)[0];
    if (!cheaper) return;
    if (home.ownerId === a.id) {
      // Sell up to clear the debts.
      const debt = a.debts.filter((d) => d.kind === 'mortgage').reduce((s, d) => s + d.balance, 0);
      const proceeds = Math.round(home.value * 0.8) - debt;
      a.debts = a.debts.filter((d) => d.kind !== 'mortgage');
      this.e.earn(a, Math.max(0, proceeds), true);
      if (proceeds < 0) this.e.pay(a, -proceeds);
      home.ownerId = null;
      home.name = home.kind === 'villa' ? 'Villa' : 'House';
    }
    this.move(a, cheaper, 'rent', `Couldn't keep up with the costs of the ${home.name} with ${money(a.money)} in the bank, so moved to ${cheaper.kind === 'apartments' ? `a flat in ${cheaper.name}` : `the cheaper ${cheaper.name}`}`);
  }

  private foreclose(a: AgentState): void {
    const home = this.homeOf(a);
    const bank = this.e.firstOf('bank');
    this.e.feed('money', `${bank?.name ?? 'The bank'} took back the ${home.name} from ${a.name} ${a.surname} after months of missed payments.`, [a.id], sidewalkPoint(home));
    this.moveDown(a);
  }

  // ---------------------------------------------------------------- what people can do in town

  /** Open businesses and their prices, for the utility AI. */
  openPlaces(h: number): { b: Building; type: BusinessType }[] {
    const out: { b: Building; type: BusinessType }[] = [];
    for (const b of this.w.buildings) {
      const biz = b.business;
        if (!biz || biz.type === 'cafe' || biz.type === 'grocery') continue;
      const k = BUSINESSES[biz.type];
      if (h >= k.open[0] && h < k.open[1]) out.push({ b, type: biz.type });
    }
    return out;
  }
}

interface Offer {
  appeal: number;
  situation: string;
  yes: string;
  no: string;
  /** Still possible when the answer comes back. */
  still: () => boolean;
  act: () => void;
}

/** The business someone dreams of, from their ambition or their trade. */
export function businessFor(a: AgentState): BusinessType | null {
  const a2 = a.ambition.toLowerCase();
  if (!/open|start|business|bakery|gallery|studio|restaurant|bookshop|boutique|workshop|gym|salon|company|second place|own product|tutoring|landscaping/.test(a2)) return null;
  if (/bakery|bread/.test(a2)) return 'bakery';
  if (/grocery|market|supplier/.test(a2)) return 'grocery';
  if (/café|cafe|coffee/.test(a2)) return 'cafe';
  if (/restaurant|second place|kitchen/.test(a2)) return 'restaurant';
  if (/gallery|painting|mural/.test(a2)) return 'gallery';
  if (/book/.test(a2)) return 'bookshop';
  if (/salon|hair/.test(a2)) return 'salon';
  if (/gym|fitness/.test(a2)) return 'gym';
  if (/boutique|clothing|fashion/.test(a2)) return 'boutique';
  if (/repair|workshop|landscaping|building company/.test(a2)) return 'workshop';
  if (/studio|company|product|app|tutoring|design/.test(a2)) return 'studio';
  return null;
}

/** A new set of books for a business. */
export function newBusiness(type: BusinessType, owner: AgentState, day: number, priceFactor = 1, partners: Business['partners'] = []): Business {
  return {
    type,
    ownerId: owner.id,
    partners,
    till: 0,
    wagesDue: 0,
    lastProfit: 60,
    badDays: 0,
    openedDay: day,
    priceFactor,
    quality: Math.round((0.35 + owner.traits.conscientiousness * 0.4 + owner.drive * 0.25) * 100) / 100,
    sales: 0,
    lastSales: 0,
    supplies: 0,
    announced: priceFactor,
  };
}

function homeType(kind: BuildingKind): 'apartments' | 'home' | 'villa' {
  return kind === 'villa' ? 'villa' : kind === 'apartments' ? 'apartments' : 'home';
}

/** "12 Linden Street, Mill End": a readable address for a lot. */
export function place(b: Building): string {
  const i = LOT_XS.indexOf(b.x);
  const n = (i < 0 ? Math.round((b.x + 200) / 17) : i) * 2 + (b.side < 0 ? 1 : 2);
  return `${n} ${streetOf(b.street).name}, ${{ mill: 'Mill End', centre: 'Downtown', hill: 'Hillcrest' }[b.district]}`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const article = (s: string) => `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`;

