/**
 * The god camera. It moves across the whole town like a map:
 * - drag with the left mouse button (or one finger) to slide over the town,
 * - drag with the right button (or two fingers) to turn and tilt, scroll or pinch to zoom,
 * - WASD or the arrow keys to move, Q and E to turn, R and F to zoom, Shift to go faster,
 * - double-click anywhere to fly there,
 * - click a person and the camera follows them until you move it yourself.
 */
import { useEffect, useRef, type ElementRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { Plane, Raycaster, Spherical, Vector2, Vector3 } from 'three';
type MapControlsImpl = ElementRef<typeof MapControls>;
import { useTown } from '../town/store';

/** How far the camera's focus point may wander from the middle of the street. */
const BOUNDS = { x: 210, z: 95 };
const MOVE_SPEED = 22; // metres per second at a normal zoom
const TURN_SPEED = 1.6; // radians per second
const ZOOM_SPEED = 1.6; // factor per second

const TILT_SPEED = 0.9; // radians per second
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyT', 'KeyG', 'ShiftLeft', 'ShiftRight'];
const HOME = { target: new Vector3(0, 1, 0), offset: new Vector3(46, 33, 44) };

/** Keys and on-screen buttons held down right now (both steer the camera the same way). */
const held = new Set<string>();
/** Radians left to turn for a full 360° tour, and a pending "back to the start" request. */
let spinLeft = 0;
let goHome = false;

/** On-screen buttons: hold one to move, turn, tilt or zoom (it uses the same codes as the keyboard). */
export function holdCamera(code: string, on: boolean) {
  if (on) held.add(code);
  else held.delete(code);
}
/** Turn slowly all the way around the current spot. Pressing it again stops. */
export function spinCamera() {
  spinLeft = spinLeft > 0 ? 0 : Math.PI * 2;
}
export function resetCamera() {
  goHome = true;
}
/** A spot the camera should glide to (from the news feed), picked up on the next frame. */
let pendingFly: { x: number; z: number } | null = null;
export function flyCamera(at: { x: number; z: number }) {
  pendingFly = at;
}

export function CameraRig() {
  const controls = useRef<MapControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const flyTo = useRef<Vector3 | null>(null);
  const following = useRef<string | null>(null);

  // Keyboard: remember which keys are down. Typing in a field never moves the camera.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !KEYS.includes(e.code)) return;
      held.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => held.delete(e.code);
    const blur = () => held.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Double-click: fly to the spot on the ground under the pointer.
  useEffect(() => {
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    const ray = new Raycaster();
    const onDbl = (e: MouseEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.ray.intersectPlane(ground, new Vector3());
      if (!hit) return;
      following.current = null;
      flyTo.current = clampTarget(hit.setY(1));
    };
    gl.domElement.addEventListener('dblclick', onDbl);
    return () => gl.domElement.removeEventListener('dblclick', onDbl);
  }, [camera, gl]);

  // Selecting a person starts following them; moving the camera yourself stops it.
  useEffect(
    () =>
      useTown.subscribe((s, prev) => {
        if (s.selected !== prev.selected) {
          following.current = s.selected;
          flyTo.current = null;
        }
      }),
    [],
  );
  useEffect(() => {
    // A drag (not a click, and not a scroll to zoom) means the viewer is steering.
    let from: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (from = { x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent) => {
      if (!from || !e.buttons || Math.hypot(e.clientX - from.x, e.clientY - from.y) < 5) return;
      following.current = null;
      flyTo.current = null;
    };
    const up = () => (from = null);
    const el = gl.domElement;
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(rawDt, 0.1);
    const keys = held;
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1;
    const offset = camera.position.clone().sub(c.target);
    const distance = offset.length();

    // Move along the ground, relative to where the camera is facing.
    const forward = new Vector3(-offset.x, 0, -offset.z).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    const move = new Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    const manual = move.lengthSq() > 0 || ['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyT', 'KeyG'].some((k) => keys.has(k));
    if (manual) {
      following.current = null;
      flyTo.current = null;
    }
    if (move.lengthSq() > 0) {
      // Move faster when zoomed out, so crossing the town never takes long.
      move.normalize().multiplyScalar(MOVE_SPEED * fast * dt * Math.max(0.5, distance / 30));
      shift(c.target, camera.position, move);
    }

    // Turn around the focus point, and zoom.
    if (goHome) {
      goHome = false;
      spinLeft = 0;
      following.current = null;
      flyTo.current = null;
      c.target.copy(HOME.target);
      camera.position.copy(HOME.target).add(HOME.offset);
      offset.copy(HOME.offset);
    }
    let turn = ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * TURN_SPEED * fast * dt;
    if (manual) spinLeft = 0;
    if (spinLeft > 0) {
      const a = Math.min(spinLeft, 0.7 * dt);
      spinLeft -= a;
      turn += a;
    }
    if (turn) {
      offset.applyAxisAngle(new Vector3(0, 1, 0), turn);
      camera.position.copy(c.target).add(offset);
    }
    // Tilt between looking straight down and looking along the street.
    const tilt = (keys.has('KeyG') ? 1 : 0) - (keys.has('KeyT') ? 1 : 0);
    if (tilt) {
      const sph = new Spherical().setFromVector3(offset);
      sph.phi = Math.min(c.maxPolarAngle, Math.max(0.15, sph.phi + tilt * TILT_SPEED * dt));
      offset.setFromSpherical(sph);
      camera.position.copy(c.target).add(offset);
    }
    const zoom = (keys.has('KeyF') ? 1 : 0) - (keys.has('KeyR') ? 1 : 0);
    if (zoom) {
      const next = Math.min(c.maxDistance, Math.max(c.minDistance, distance * Math.pow(ZOOM_SPEED * fast, zoom * dt)));
      camera.position.copy(c.target).add(offset.setLength(next));
    }

    if (pendingFly) {
      flyTo.current = clampTarget(new Vector3(pendingFly.x, 1, pendingFly.z));
      following.current = null;
      spinLeft = 0;
      pendingFly = null;
      // Come in close enough to see what's happening.
      if (distance > 60) camera.position.copy(c.target).add(offset.setLength(60));
    }
    // Glide to a double-clicked spot, or keep the followed person in view.
    let goal = flyTo.current;
    if (following.current) {
      const a = useTown.getState().tick?.agents.find((x) => x.id === following.current);
      goal = a ? new Vector3(a.x, 1, a.z) : null;
    }
    if (goal) {
      const step = goal.clone().sub(c.target).multiplyScalar(Math.min(1, dt * (following.current ? 3 : 4)));
      shift(c.target, camera.position, step);
      if (flyTo.current && c.target.distanceTo(flyTo.current) < 0.05) flyTo.current = null;
    }

    // Keep the focus inside the town.
    const clamped = clampTarget(c.target.clone());
    if (!clamped.equals(c.target)) shift(c.target, camera.position, clamped.sub(c.target));
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      target={[0, 1, 0]}
      minDistance={6}
      maxDistance={280}
      maxPolarAngle={1.45}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      zoomToCursor
    />
  );
}

/** Move the focus point and the camera together, so the view slides without turning. */
function shift(target: Vector3, camera: Vector3, by: Vector3) {
  target.add(by);
  camera.add(by);
}

function clampTarget(v: Vector3): Vector3 {
  v.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, v.x));
  v.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, v.z));
  v.y = 1;
  return v;
}
