import { useState } from 'react';
import { clockText, weekdayOf } from '@agentville/core';
import { useTown } from '../town/store';

const LABEL: Record<string, string> = {
  conversation: 'Talk',
  reaction: 'Reaction',
  plan: 'Plan',
  reflection: 'Thought',
  life: 'Life',
  system: 'Town',
};

/** The town news feed: who talked, who reacted, who planned what. Click a line to open that person. */
export function Feed() {
  const feed = useTown((s) => s.feed);
  const select = useTown((s) => s.select);
  const [open, setOpen] = useState(true);
  const items = feed.slice(-14).reverse();
  return (
    <section className="feed card" aria-label="Town news">
      <button type="button" className="feed-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Town news</span>
        <span className="sub">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ol>
          {items.map((e) => (
            <li key={e.id + e.t}>
              <button type="button" disabled={!e.agents.length} onClick={() => e.agents[0] && select(e.agents[0])}>
                <span className={`kind k-${e.kind}`}>{LABEL[e.kind] ?? e.kind}</span>
                <span className="when">
                  {weekdayOf(e.t).slice(0, 3)} {clockText(e.t)}
                </span>
                <span className="text">{e.text}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="empty">Nothing has happened yet. Conversations and plans show up here.</li>}
        </ol>
      )}
    </section>
  );
}
