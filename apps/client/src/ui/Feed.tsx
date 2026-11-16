import { useState } from 'react';
import { clockText, weekdayOf, type FeedEvent } from '@agentville/core';
import { useTown } from '../town/store';
import { flyCamera } from '../scene/CameraRig';

const LABEL: Record<string, string> = {
  conversation: 'Talk',
  group: 'Group',
  friendship: 'Friends',
  fight: 'Falling out',
  reaction: 'Reaction',
  plan: 'Plan',
  reflection: 'Thought',
  life: 'Life',
  money: 'Money',
  job: 'Work',
  business: 'Business',
  build: 'Building',
  move: 'Moving',
  newcomer: 'Newcomer',
  party: 'Party',
  decision: 'Decision',
  system: 'Town',
};

/** The town news feed. Click a line to fly there and open the person it's about. */
export function Feed() {
  const feed = useTown((s) => s.feed);
  const select = useTown((s) => s.select);
  const [open, setOpen] = useState(true);
  const items = feed.slice(-18).reverse();
  const go = (e: FeedEvent) => {
    if (e.agents[0]) select(e.agents[0]);
    if (e.at) flyCamera(e.at);
  };
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
              <button type="button" disabled={!e.agents.length && !e.at} onClick={() => go(e)}>
                <span className={`kind k-${e.kind}`}>{LABEL[e.kind] ?? e.kind}</span>
                <span className="when">
                  {weekdayOf(e.t).slice(0, 3)} {clockText(e.t)}
                </span>
                <span className="text">{e.text}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="empty">Nothing has happened yet. Conversations, deals and new buildings show up here.</li>}
        </ol>
      )}
    </section>
  );
}
