import { useMemo, useState } from 'react';
import { BUSINESSES, lotCentre, type Building, type DaySnapshot, type EconomyView, type FlowKey, type Flows } from '@agentville/core';
import { useTown } from '../town/store';
import { useView } from '../store';
import { flyCamera } from '../scene/CameraRig';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const get = (f: Flows, k: FlowKey) => f[k] ?? 0;

type Tab = 'flows' | 'businesses' | 'people';
type When = 'yesterday' | 'today' | 'week';

/** Adds up the flows of several days. */
function sum(days: Flows[]): Flows {
  const out: Flows = {};
  for (const d of days) for (const [k, v] of Object.entries(d) as [FlowKey, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

function Bars({ title, rows, tone }: { title: string; rows: { label: string; value: number; note?: string }[]; tone: 'in' | 'out' | 'biz' | 'invest' }) {
  const shown = rows.filter((r) => Math.round(r.value) !== 0);
  const max = Math.max(1, ...shown.map((r) => Math.abs(r.value)));
  const total = shown.reduce((s, r) => s + r.value, 0);
  return (
    <section className="eco-block">
      <h3>
        {title}
        <span>{money(total)}</span>
      </h3>
      {shown.length ? (
        <ul className="eco-bars">
          {shown
            .sort((p, q) => Math.abs(q.value) - Math.abs(p.value))
            .map((r) => (
              <li key={r.label}>
                <span className="label">
                  {r.label}
                  {r.note && <span className="note-inline"> {r.note}</span>}
                </span>
                <span className="track">
                  <span className={`fill ${tone}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
                </span>
                <span className="val">{money(r.value)}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="sub">Nothing yet.</p>
      )}
    </section>
  );
}

/** A small line chart of savings and debt over the last three weeks. */
function Trend({ history }: { history: DaySnapshot[] }) {
  if (history.length < 2) return <p className="sub">The trend appears after two days in town.</p>;
  const W = 320;
  const H = 90;
  const series = [
    { key: 'householdMoney' as const, label: 'Residents’ savings', cls: 'savings' },
    { key: 'debt' as const, label: 'Owed to the bank', cls: 'debt' },
  ];
  const all = history.flatMap((d) => series.map((s) => d[s.key]));
  const lo = Math.min(0, ...all);
  const hi = Math.max(1, ...all);
  const x = (i: number) => (i / (history.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12);
  return (
    <figure className="eco-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Residents' savings and debt over the last days">
        {lo < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="zero" />}
        {series.map((s) => (
          <polyline key={s.key} className={s.cls} points={history.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ')} />
        ))}
      </svg>
      <figcaption>
        {series.map((s) => (
          <span key={s.key} className={`key ${s.cls}`}>
            {s.label}: {money(history[history.length - 1][s.key])}
          </span>
        ))}
        <span className="sub">Day {history[0].day} to {history[history.length - 1].day}</span>
      </figcaption>
    </figure>
  );
}

function FlowsTab({ eco, when }: { eco: EconomyView; when: When }) {
  const f = when === 'today' ? eco.today : when === 'yesterday' ? eco.history[eco.history.length - 1]?.flows ?? {} : sum(eco.history.slice(-7).map((d) => d.flows));
  const businessWages = get(f, 'staffWages');
  return (
    <>
      <div className="eco-kpis">
        <div>
          <strong>{money(eco.householdMoney)}</strong>
          <span className="sub">residents’ savings</span>
        </div>
        <div>
          <strong className="neg">{money(eco.debt)}</strong>
          <span className="sub">owed to the bank</span>
        </div>
        <div>
          <strong>{money(eco.treasury)}</strong>
          <span className="sub">town funds</span>
        </div>
        <div>
          <strong>{money(get(f, 'sales'))}</strong>
          <span className="sub">spent at businesses</span>
        </div>
      </div>
      <Trend history={eco.history} />
      <div className="eco-grid">
        <Bars
          title="Money coming in to residents"
          tone="in"
          rows={[
            { label: 'Wages', value: get(f, 'wages'), note: businessWages ? `(${money(businessWages)} from town businesses)` : undefined },
            { label: 'Business profit to owners', value: get(f, 'ownerProfit') },
            { label: 'Profit share to partners', value: get(f, 'partnerProfit') },
            { label: 'Rent to private landlords', value: get(f, 'landlordRent') },
            { label: 'Pensions', value: get(f, 'pensions') },
            { label: 'New bank loans', value: get(f, 'loans') },
          ]}
        />
        <Bars
          title="Money going out from residents"
          tone="out"
          rows={[
            { label: 'Shopping at businesses', value: get(f, 'sales') },
            { label: 'Town services (pool, club, clinic)', value: get(f, 'services') },
            { label: 'Rent', value: get(f, 'rent') },
            { label: 'Home upkeep', value: get(f, 'upkeep') },
            { label: 'Loan and mortgage repayments', value: get(f, 'repayments') },
            { label: 'Losses covered by owners', value: get(f, 'losses') },
          ]}
        />
        <Bars
          title="Inside the businesses: where takings go"
          tone="biz"
          rows={[
            { label: 'Supplies', value: get(f, 'supplies') },
            { label: 'Staff wages', value: businessWages },
            { label: 'Shop rent to the town', value: get(f, 'shopRent') },
            { label: 'Profit to owners', value: get(f, 'ownerProfit') },
            { label: 'Profit to partners', value: get(f, 'partnerProfit') },
          ]}
        />
        <Bars
          title="How money is invested"
          tone="invest"
          rows={[
            { label: 'Opening businesses', value: get(f, 'investBusiness') },
            { label: 'Building houses and villas', value: get(f, 'investHomes') },
            { label: 'Building flats to rent out', value: get(f, 'investFlats') },
            { label: 'Buying land', value: get(f, 'land') },
          ]}
        />
      </div>
    </>
  );
}

type Books = NonNullable<NonNullable<Building['business']>['books']>;

/** Today's books so far, from what is in the till right now: settled for real at the start of the next day. */
function liveBooks(b: Building): Books {
  const biz = b.business!;
  const rent = b.ownerId ? 0 : b.rent;
  const revenue = Math.round(biz.till);
  const supplies = Math.round(biz.supplies);
  const wages = Math.round(biz.wagesDue);
  const profit = revenue - supplies - wages - rent;
  const toPartners = profit > 0 ? biz.partners.reduce((s, p) => s + Math.round(profit * p.share), 0) : 0;
  return { revenue, supplies, wages, rent, profit, toOwner: profit - toPartners, toPartners };
}

function BusinessesTab({ buildings, name, done, when }: { buildings: Building[]; name: (id: string) => string; done: () => void; when: When }) {
  const toggleCutaway = useView((s) => s.toggleCutaway);
  const today = when === 'today';
  const booksOf = (b: Building) => (today ? liveBooks(b) : b.business!.books);
  const list = useMemo(
    () => buildings.filter((b) => b.business).sort((p, q) => ((today ? liveBooks(q) : q.business!.books)?.revenue ?? 0) - ((today ? liveBooks(p) : p.business!.books)?.revenue ?? 0)),
    [buildings, today],
  );
  if (!list.length) return <p className="sub">No businesses yet.</p>;
  const go = (b: Building) => {
    flyCamera(lotCentre(b));
    toggleCutaway(b.id);
    done();
  };
  return (
    <div className="eco-table-wrap">
      <table className="eco-table">
        <thead>
          <tr>
            <th scope="col">Business</th>
            <th scope="col">Price</th>
            <th scope="col">Customers</th>
            <th scope="col">Takings</th>
            <th scope="col">Supplies</th>
            <th scope="col">Wages</th>
            <th scope="col">Rent</th>
            <th scope="col">Profit</th>
            <th scope="col">To owner</th>
            <th scope="col">To partners</th>
            <th scope="col">Since opening</th>
          </tr>
        </thead>
        <tbody>
          {list.map((b) => {
            const biz = b.business!;
            const k = booksOf(b);
            const kind = BUSINESSES[biz.type];
            const pct = Math.round((biz.priceFactor - 1) * 100);
            return (
              <tr key={b.id}>
                <th scope="row">
                  <button type="button" onClick={() => go(b)}>
                    {b.name}
                  </button>
                  <span className="sub">
                    {kind.title} · {name(biz.ownerId)}
                    {biz.partners.length > 0 && ` + ${biz.partners.map((p) => `${name(p.id)} ${Math.round(p.share * 100)}%`).join(', ')}`}
                  </span>
                </th>
                <td>
                  {money(kind.price * biz.priceFactor)}
                  {pct !== 0 && <span className={pct < 0 ? 'cut' : 'up'}> {pct > 0 ? `+${pct}` : pct}%</span>}
                </td>
                <td>{today ? biz.sales : biz.lastSales}</td>
                <td>{k ? money(k.revenue) : '–'}</td>
                <td>{k ? money(k.supplies) : '–'}</td>
                <td>{k ? money(k.wages) : '–'}</td>
                <td>{k ? money(k.rent) : '–'}</td>
                <td className={k && k.profit < 0 ? 'neg' : 'pos'}>{k ? money(k.profit) : '–'}</td>
                <td>{k ? money(k.toOwner) : '–'}</td>
                <td>{k ? money(k.toPartners) : '–'}</td>
                <td>
                  {money(biz.totalRevenue ?? 0)}
                  <span className="sub"> profit {money(biz.totalProfit ?? 0)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sub">{today ? 'Today so far, updated every hour; the day closes at midnight, when the owner and partners are paid.' : 'Yesterday’s books.'} Takings minus supplies, staff wages and shop rent is the profit; partners get their share and the owner keeps the rest, or covers the loss.</p>
    </div>
  );
}

function PeopleTab({ eco, done }: { eco: EconomyView; done: () => void }) {
  const pick = useTown((s) => s.select);
  const select = (id: string) => {
    pick(id);
    done();
  };
  const list = (title: string, rows: EconomyView['richest']) => (
    <section className="eco-block">
      <h3>{title}</h3>
      <ul className="eco-people">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => select(r.id)}>
              {r.name}
            </button>
            <span className={r.money < 0 ? 'neg' : 'pos'}>{money(r.money)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="eco-grid">
      {list('Richest residents', eco.richest)}
      {list('Struggling the most', eco.poorest)}
    </div>
  );
}

/** The town's economy at a glance: money in and out, every business's books, and who has the money. */
export function Economy() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('flows');
  const [when, setWhen] = useState<When>('today');
  const eco = useTown((s) => s.tick?.economy);
  const buildings = useTown((s) => s.buildings);
  const agents = useTown((s) => s.tick?.agents);
  const name = (id: string) => agents?.find((a) => a.id === id)?.name ?? '?';

  return (
    <>
      <button type="button" className="eco-open card" onClick={() => setOpen(true)}>
        Economy
      </button>
      {open && (
        <div className="eco card" role="dialog" aria-label="Town economy">
          <div className="eco-head">
            <h2>Town economy</h2>
            <div className="presets" role="tablist">
              {(
                [
                  ['flows', 'Money flows'],
                  ['businesses', 'Businesses'],
                  ['people', 'People'],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); if (t === 'businesses' && when === 'week') setWhen('today'); }}>
                  {label}
                </button>
              ))}
            </div>
            {tab !== 'people' && (
              <div className="presets" role="group" aria-label="Period">
                {(
                  [
                    ['yesterday', 'Yesterday'],
                    ['today', 'Today'],
                    ['week', '7 days'],
                  ] as [When, string][]
                ).filter(([w]) => tab === 'flows' || w !== 'week').map(([w, label]) => (
                  <button key={w} type="button" aria-pressed={when === w} className={when === w ? 'active' : ''} onClick={() => setWhen(w)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="eco-close" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="eco-body">
            {!eco ? (
              <p className="sub">Waiting for the town…</p>
            ) : tab === 'flows' ? (
              <FlowsTab eco={eco} when={when} />
            ) : tab === 'businesses' ? (
              <BusinessesTab buildings={buildings} name={name} done={() => setOpen(false)} when={when === 'week' ? 'today' : when} />
            ) : (
              <PeopleTab eco={eco} done={() => setOpen(false)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
