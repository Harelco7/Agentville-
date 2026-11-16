import { CLASS_WORD, clockText, weekdayOf, type NeedKey } from '@agentville/core';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
import { useTown } from '../town/store';

const NEEDS: { key: NeedKey; label: string }[] = [
  { key: 'hunger', label: 'Fed' },
  { key: 'energy', label: 'Energy' },
  { key: 'social', label: 'Social' },
  { key: 'fun', label: 'Fun' },
  { key: 'hygiene', label: 'Fresh' },
];

/** Everything about the selected person: needs, plan, beliefs, relationships, memories and the conversation they are in. */
export function AgentPanel() {
  const detail = useTown((s) => s.detail);
  const selected = useTown((s) => s.selected);
  const select = useTown((s) => s.select);
  if (!selected) return null;
  if (!detail) {
    return (
      <aside className="panel card" aria-label="Person details">
        <p className="sub">Loading…</p>
      </aside>
    );
  }
  return (
    <aside className="panel card" aria-label={`${detail.name} ${detail.surname}`}>
      <div className="panel-head">
        <div>
          <h2>
            {detail.name} {detail.surname}
          </h2>
          <p className="sub">
            {detail.age} · {detail.occupation} · {CLASS_WORD[detail.socialClass]}
          </p>
          <p className="sub">{detail.homeText}</p>
        </div>
        <button type="button" onClick={() => select(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="now">
        {detail.activity}
        {detail.sick && <span className="tag sick">unwell</span>}
      </p>

      {detail.conversation && (
        <section>
          <h3>Talking with {detail.conversation.with}</h3>
          <div className="dialogue">
            {detail.conversation.lines.length ? (
              detail.conversation.lines.map((l, i) => (
                <p key={i}>
                  <strong>{l.speaker}:</strong> {l.text}
                </p>
              ))
            ) : (
              <p className="sub">Thinking of what to say…</p>
            )}
          </div>
        </section>
      )}

      <section>
        <h3>Needs</h3>
        <div className="needs">
          {NEEDS.map((n) => {
            const v = Math.round(detail.needs[n.key]);
            return (
              <div key={n.key} className="need">
                <span>{n.label}</span>
                <div className="bar" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={n.label}>
                  <div className={v < 25 ? 'low' : v < 50 ? 'mid' : 'ok'} style={{ width: `${v}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3>Money and ambition</h3>
        <div className="money">
          <strong className={detail.money < 0 ? 'neg' : ''}>{detail.money < 0 ? `−$${(-detail.money).toLocaleString('en-US')}` : `$${detail.money.toLocaleString('en-US')}`}</strong>
          <span className="sub">
            {detail.pension ? `pension $${detail.pension} a day` : `$${detail.wage} an hour`} · earned ${detail.earnedToday} today · food at home for {detail.pantry} meal{detail.pantry === 1 ? '' : 's'}
          </span>
        </div>
        {detail.costsPerDay > 0 && <p className="sub">Home and loans cost {money(detail.costsPerDay)} a day.</p>}
        {detail.debts.map((d, i) => (
          <p key={i} className="debt">
            <strong>{d.kind === 'mortgage' ? 'Mortgage' : 'Loan'}</strong> {money(d.balance)} left for {d.purpose}, {money(d.perDay)} a day
          </p>
        ))}
        {detail.business && (
          <p>
            <strong>Owns {detail.business.name}</strong>
            <span className={detail.business.lastProfit < 0 ? 'neg' : 'pos'}> · {money(detail.business.lastProfit)} yesterday</span>
            {detail.business.partners.length > 0 && <span className="sub"> · partners: {detail.business.partners.join(', ')}</span>}
          </p>
        )}
        {detail.project && (
          <div className="project">
            <span>
              Building {detail.project.what}: {Math.round(detail.project.progress * 100)}%
            </span>
            <div className="bar">
              <div className="ok" style={{ width: `${Math.round(detail.project.progress * 100)}%` }} />
            </div>
          </div>
        )}
        <p>
          <strong>Ambition:</strong> {detail.ambition}
        </p>
      </section>

      <section>
        <h3>About</h3>
        <p>{detail.bio}</p>
        {detail.plan && (
          <p>
            <strong>Today:</strong> {detail.plan}
          </p>
        )}
        {detail.beliefs.length > 0 && (
          <ul className="beliefs">
            {detail.beliefs.map((b) => (
              <li key={b}>“{b}”</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>People</h3>
        <ul className="relations">
          {detail.relationships.slice(0, 6).map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => select(r.id)}>
                {r.name}
              </button>
              <span className="sub">{r.label}</span>
              <span className={`score ${r.affinity < 0 ? 'neg' : ''}`}>{r.affinity > 0 ? `+${r.affinity}` : r.affinity}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Memories</h3>
        <ul className="memories">
          {detail.memories.slice(0, 10).map((m, i) => (
            <li key={i}>
              <span className="when">
                {weekdayOf(m.t).slice(0, 3)} {clockText(m.t)}
              </span>{' '}
              {m.text}
            </li>
          ))}
          {!detail.memories.length && <li className="sub">No memories yet.</li>}
        </ul>
      </section>
    </aside>
  );
}
