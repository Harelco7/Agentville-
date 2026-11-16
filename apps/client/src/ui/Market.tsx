import { useMemo, useState } from 'react';
import { BUSINESSES, lotCentre, type Building, type BusinessType } from '@agentville/core';
import { useTown } from '../town/store';
import { useView } from '../store';
import { flyCamera } from '../scene/CameraRig';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

/**
 * The market at a glance: every business in town grouped by trade, with today's price against the usual one,
 * yesterday's customers and profit. Rival shops undercut each other, so prices here move day by day.
 */
export function Market() {
  const buildings = useTown((s) => s.buildings);
  const people = useTown((s) => s.tick?.agents.length ?? 0);
  const agents = useTown((s) => s.tick?.agents);
  const [open, setOpen] = useState(false);
  const toggleCutaway = useView((s) => s.toggleCutaway);
  const cutaway = useView((s) => s.cutaway);

  const { trades, stats } = useMemo(() => {
    const byType = new Map<BusinessType, Building[]>();
    for (const b of buildings) if (b.business) byType.set(b.business.type, [...(byType.get(b.business.type) ?? []), b]);
    const trades = [...byType.entries()]
      .map(([type, list]) => ({ type, kind: BUSINESSES[type], list: list.sort((p, q) => p.business!.priceFactor - q.business!.priceFactor) }))
      .sort((p, q) => q.list.length - p.list.length || p.kind.title.localeCompare(q.kind.title));
    const stats = {
      businesses: buildings.filter((b) => b.business).length,
      sites: buildings.filter((b) => b.construction).length,
      forSale: buildings.filter((b) => b.kind === 'lot' && !b.ownerId && !b.construction).length,
      homes: buildings.filter((b) => b.kind === 'home' || b.kind === 'villa' || b.kind === 'apartments').length,
    };
    return { trades, stats };
  }, [buildings]);

  const owner = (id: string) => agents?.find((a) => a.id === id)?.name ?? '';
  const go = (b: Building) => {
    flyCamera(lotCentre(b));
    if (cutaway !== b.id) toggleCutaway(b.id);
  };

  return (
    <section className="market card" aria-label="Market">
      <button type="button" className="feed-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Market</span>
        <span className="sub">
          {stats.businesses} businesses · {people} people · {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div className="market-body">
          <div className="stats">
            <div>
              <strong>{people}</strong>
              <span className="sub">residents</span>
            </div>
            <div>
              <strong>{stats.homes}</strong>
              <span className="sub">homes</span>
            </div>
            <div>
              <strong>{stats.sites}</strong>
              <span className="sub">being built</span>
            </div>
            <div>
              <strong>{stats.forSale}</strong>
              <span className="sub">lots for sale</span>
            </div>
          </div>
          {trades.map((t) => (
            <div key={t.type} className="trade">
              <h3>
                {t.kind.title}
                {t.list.length > 1 && <span className="rivals"> · {t.list.length} competing</span>}
                <span className="usual"> · usually {money(t.kind.price)}</span>
              </h3>
              <ul>
                {t.list.map((b) => {
                  const biz = b.business!;
                  const pct = Math.round((biz.priceFactor - 1) * 100);
                  return (
                    <li key={b.id}>
                      <button type="button" onClick={() => go(b)}>
                        <span className="name">
                          {b.name}
                          <span className="sub"> {owner(biz.ownerId)}</span>
                        </span>
                        <span className="price">
                          ${(t.kind.price * biz.priceFactor).toFixed(2)}
                          {pct !== 0 && <span className={pct < 0 ? 'cut' : 'up'}> {pct > 0 ? `+${pct}` : pct}%</span>}
                        </span>
                        <span className="sub">{biz.lastSales} customers yesterday</span>
                        <span className={biz.lastProfit < 0 ? 'neg' : 'pos'}>{money(biz.lastProfit)} a day</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!trades.length && <p className="sub">No businesses yet.</p>}
        </div>
      )}
    </section>
  );
}
