import { clockText, dayOf, DAYS_PER_YEAR, weekdayOf, yearOf } from '@agentville/core';
import { useView } from '../store';
import { useTown } from '../town/store';
import { AgentPanel } from './AgentPanel';
import { Feed } from './Feed';

const SPEEDS = [1, 10, 60];

function StatusChip() {
  const mode = useTown((s) => s.mode);
  const status = useTown((s) => s.status);
  if (mode === 'connecting') return <span className="chip">Connecting…</span>;
  if (mode === 'demo') return <span className="chip demo">Demo in your browser</span>;
  const b = status?.budget;
  return (
    <span className={`chip ${status?.mind === 'claude' ? 'live' : 'demo'}`} title={status?.note ?? ''}>
      Live · {status?.mind === 'claude' ? 'Claude' : 'scripted'}
      {b && ` · $${b.spentTodayUsd.toFixed(2)} of $${b.dailyCapUsd.toFixed(2)} today`}
    </span>
  );
}

/** God-view header: the town clock, where the town runs, and the demo's speed control. */
export function Hud() {
  const time = useTown((s) => s.tick?.time ?? 0);
  const mode = useTown((s) => s.mode);
  const demoSpeed = useTown((s) => s.demoSpeed);
  const setDemoSpeed = useTown((s) => s.setDemoSpeed);
  const note = useTown((s) => s.status?.note ?? null);
  const cutaway = useView((s) => s.cutaway);
  const clearCutaway = useView((s) => s.clearCutaway);
  const cutName = useTown((s) => s.buildings.find((b) => b.id === cutaway)?.name);

  return (
    <>
      <header className="hud card">
        <div className="brand">
          <span className="title">Agentville</span>
          <span className="sub">Linden Street</span>
        </div>
        <div className="divider" />
        <div className="clock">
          <span className="sub">
            {weekdayOf(time)} · day {((dayOf(time) - 1) % DAYS_PER_YEAR) + 1}, year {yearOf(time)}
          </span>
          <span className="time">{clockText(time)}</span>
        </div>
        <StatusChip />
        {mode === 'demo' && (
          <div className="presets" role="group" aria-label="Demo speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={demoSpeed === s ? 'active' : ''} aria-pressed={demoSpeed === s} onClick={() => setDemoSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        )}
        {note && mode === 'live' && <span className="note">{note}</span>}
      </header>

      {cutaway && (
        <div className="cutaway card">
          <span>Inside {cutName ?? 'the building'}</span>
          <button type="button" onClick={clearCutaway}>
            Close
          </button>
        </div>
      )}

      <Feed />
      <AgentPanel />
      <div className="hint">Drag to orbit · Right-drag to pan · Scroll to zoom · Click a building to look inside · Click a person to follow them</div>
    </>
  );
}
