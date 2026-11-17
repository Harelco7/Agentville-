import { BASE_SPEED, clockText, dayOf, DAYS_PER_YEAR, weekdayOf, yearOf } from '@agentville/core';
import { useView } from '../store';
import { useTown } from '../town/store';
import { AgentPanel } from './AgentPanel';
import { CameraPad } from './CameraPad';
import { Feed } from './Feed';
import { Market } from './Market';
import { Economy } from './Economy';

const SPEEDS = [1, 10, 60];

/** Real time away, said as town time: "3 days" or "5 hours". */
function awayText(seconds: number): string {
  const simMinutes = seconds * BASE_SPEED;
  if (simMinutes >= 1440 * 1.5) return `${Math.round(simMinutes / 1440)} days`;
  return `${Math.max(1, Math.round(simMinutes / 60))} hours`;
}

function StatusChip() {
  const mode = useTown((s) => s.mode);
  const status = useTown((s) => s.status);
  if (mode === 'connecting') return <span className="chip">Connecting…</span>;
  if (mode === 'demo') return <span className="chip demo">Demo in your browser</span>;
  if (mode === 'cloud' || mode === 'watch') {
    const c = status?.calls;
    const gemini = status?.mind === 'gemini';
    return (
      <span className={`chip ${gemini ? 'live' : 'demo'}`} title={status?.note ?? ''}>
        {mode === 'watch' ? 'Watching live' : 'Live'} · {gemini ? 'Gemini' : 'scripted'}
        {c && ` · ${c.usedToday} of ${c.dailyLimit} calls today`}
      </span>
    );
  }
  const b = status?.budget;
  return (
    <span className={`chip ${status?.mind !== 'scripted' ? 'live' : 'demo'}`} title={status?.note ?? ''}>
      Live · {status?.mind === 'claude' ? 'Claude' : status?.mind === 'gemini' ? 'Gemini' : 'scripted'}
      {status?.calls && ` · ${status.calls.usedToday} of ${status.calls.dailyLimit} calls today`}
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
  const catchUp = useTown((s) => s.catchUp);
  const cutaway = useView((s) => s.cutaway);
  const clearCutaway = useView((s) => s.clearCutaway);
  const cutName = useTown((s) => s.buildings.find((b) => b.id === cutaway)?.name);

  return (
    <>
      <header className="hud card">
        <div className="brand">
          <span className="title">Agentville</span>
          <span className="sub">Linden · Oak · Maple</span>
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
        {note && mode !== 'demo' && mode !== 'connecting' && !catchUp && <span className="note">{note}</span>}
        {catchUp && (
          <span className="note" role="status">
            Catching up on {awayText(catchUp.awaySeconds)} that passed while nobody watched… {Math.round(catchUp.done * 100)}%
          </span>
        )}
      </header>

      {cutaway && (
        <div className="cutaway card">
          <span>Inside {cutName ?? 'the building'}</span>
          <button type="button" onClick={clearCutaway}>
            Close
          </button>
        </div>
      )}

      <CameraPad />
      <Feed />
      <Market />
      <Economy />
      <AgentPanel />
      <div className="hint">Drag or WASD to move · Right-drag, Q/E or the buttons to turn all the way around · Scroll to zoom · Double-click to fly there · Click the news to fly to it · Click a building to look inside · Click a person to follow them</div>
    </>
  );
}
