import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { holdCamera, resetCamera, spinCamera } from '../scene/CameraRig';

/** A button that steers the camera for as long as it is held, like the matching key. */
function Hold({ code, label, children }: { code: string; label: string; children: ReactNode }) {
  const on = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    holdCamera(code, true);
  };
  const off = () => holdCamera(code, false);
  return (
    <button type="button" aria-label={label} title={label} onPointerDown={on} onPointerUp={off} onPointerCancel={off} onLostPointerCapture={off} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

/** On-screen camera controls, for touch screens and for anyone who prefers buttons to keys. */
export function CameraPad() {
  return (
    <div className="camera-pad card" role="group" aria-label="Camera">
      <div className="pad-group">
        <Hold code="KeyQ" label="Turn left (Q)">⟲</Hold>
        <button type="button" className="spin" onClick={spinCamera} title="Turn all the way around" aria-label="Turn all the way around">
          360°
        </button>
        <Hold code="KeyE" label="Turn right (E)">⟳</Hold>
      </div>
      <div className="pad-group">
        <Hold code="KeyT" label="Look more from above (T)">⤒</Hold>
        <Hold code="KeyG" label="Look more from the side (G)">⤓</Hold>
      </div>
      <div className="pad-group">
        <Hold code="KeyR" label="Zoom in (R)">+</Hold>
        <Hold code="KeyF" label="Zoom out (F)">−</Hold>
      </div>
      <div className="pad-group arrows">
        <Hold code="KeyW" label="Move forward (W)">▲</Hold>
        <Hold code="KeyA" label="Move left (A)">◀</Hold>
        <Hold code="KeyS" label="Move back (S)">▼</Hold>
        <Hold code="KeyD" label="Move right (D)">▶</Hold>
      </div>
      <button type="button" onClick={resetCamera} title="Back to the start view" aria-label="Back to the start view">
        ⌂
      </button>
    </div>
  );
}
