import { useView } from '../store';

const PRESETS: { label: string; hour: number }[] = [
  { label: 'Morning', hour: 8 },
  { label: 'Noon', hour: 13 },
  { label: 'Sunset', hour: 17.6 },
  { label: 'Night', hour: 22 },
];

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Look-test controls: time of day and how to use the camera. */
export function Hud() {
  const hour = useView((s) => s.hour);
  const playing = useView((s) => s.playing);
  const setHour = useView((s) => s.setHour);
  const setPlaying = useView((s) => s.setPlaying);
  const cutaway = useView((s) => s.cutaway);
  const clearCutaway = useView((s) => s.clearCutaway);

  return (
    <>
      <header className="hud card">
        <div className="brand">
          <span className="title">Agentville</span>
          <span className="sub">Look test · semi-realistic</span>
        </div>
        <div className="divider" />
        <div className="clock">
          <span className="sub">Time of day</span>
          <span className="time">{formatHour(hour)}</span>
        </div>
        <label className="slider">
          <span className="visually-hidden">Time of day</span>
          <input type="range" min={0} max={24} step={0.05} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
        </label>
        <div className="presets" role="group" aria-label="Time presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setHour(p.hour)}>
              {p.label}
            </button>
          ))}
          <button type="button" className={playing ? 'active' : ''} aria-pressed={playing} onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </header>

      {cutaway && (
        <div className="cutaway card">
          <span>Looking inside the {cutaway === 'cohen' ? 'Cohen' : 'Levi'} home</span>
          <button type="button" onClick={clearCutaway}>
            Exit cutaway
          </button>
        </div>
      )}

      <div className="hint">Drag to orbit · Right-drag to pan · Scroll to zoom · Click a house to see inside</div>
    </>
  );
}
