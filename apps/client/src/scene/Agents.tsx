import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useAnimations } from '@react-three/drei';
import { AnimationAction, Group } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BASE_SPEED, CROSS_XS, hourOf, ROAD_HALF, STREETS, type AgentView, type Looks } from '@agentville/core';
import { Car } from './Buildings';
import { dress } from './character';
import { useModel } from '../assets';
import { useTown } from '../town/store';
import { useView } from '../store';

const findAgent = (id: string): AgentView | undefined => useTown.getState().tick?.agents.find((a) => a.id === id);

const LONG_ZS = STREETS.filter((s) => s.axis === 'x').map((s) => s.at);
const onWalk = (d: number) => d > ROAD_HALF && d < ROAD_HALF + 2.3;

/** Floor height under a person: building floors, sidewalks, the lawn, or chest-deep in a pool. */
function groundY(a: AgentView): number {
  if (a.riding) return 0.02;
  if (!a.moving && /^swimming|^by the pool/.test(a.activity)) return -0.75;
  if (a.inside) return 0.3;
  const dz = Math.min(...LONG_ZS.map((z) => Math.abs(a.z - z)));
  const dx = Math.min(...CROSS_XS.map((x) => Math.abs(a.x - x)));
  if (onWalk(dz) && dx > ROAD_HALF) return 0.16;
  if (onWalk(dx) && dz > ROAD_HALF) return 0.16;
  return 0.03;
}

/** People walk on the sidewalk; when they drive, the car keeps to its side of the road. */
function lane(a: AgentView): { x: number; z: number } {
  if (!a.riding) return a;
  const sz = LONG_ZS.reduce((best, z) => (Math.abs(a.z - z) < Math.abs(a.z - best) ? z : best));
  if (Math.abs(a.z - sz) < 7) return { x: a.x, z: sz + Math.sign(a.z - sz || 1) * 1.75 };
  const sx = CROSS_XS.reduce((best, x) => (Math.abs(a.x - x) < Math.abs(a.x - best) ? x : best));
  if (Math.abs(a.x - sx) < 7) return { x: sx + Math.sign(a.x - sx || 1) * 1.75, z: a.z };
  return a;
}

const hashOf = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

const lerpAngle = (from: number, to: number, t: number) => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
};

/** One person: an animated figure that follows the simulation, with a name tag and a speech bubble. */
function Person({ id }: { id: string }) {
  const { scene, animations } = useModel();
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const car = useRef<Group>(null);
  const walking = useRef<boolean | null>(null);
  const looksKey = useTown((s) => JSON.stringify(s.tick?.agents.find((a) => a.id === id)?.looks ?? null));
  const name = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.name ?? '');
  const activity = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.activity ?? '');
  const speaking = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.speaking ?? null);
  const selected = useTown((s) => s.selected === id);
  const select = useTown((s) => s.select);

  const model = useMemo(() => {
    const c = clone(scene);
    const looks = JSON.parse(looksKey) as Looks | null;
    if (looks) dress(c, looks);
    return c;
  }, [scene, looksKey]);

  const { actions } = useAnimations(animations, group);

  // Start where the simulation says, without sliding in from the origin.
  useEffect(() => {
    const a = findAgent(id);
    if (a && group.current) {
      group.current.position.set(a.x, groundY(a), a.z);
      group.current.rotation.y = a.facing;
    }
  }, [id]);

  useFrame((_, dt) => {
    const g = group.current;
    const a = findAgent(id);
    if (!g || !a) return;
    const { x: tx, z: tz } = lane(a);
    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    if (Math.hypot(dx, dz) > 12) g.position.set(tx, groundY(a), tz);
    else {
      // Watchers get a picture once a second, so glide more slowly between them.
      const k = Math.min(1, dt * (useTown.getState().mode === 'watch' ? 2.2 : 7));
      g.position.x += dx * k;
      g.position.z += dz * k;
      g.position.y += (groundY(a) - g.position.y) * k;
    }
    g.rotation.y = lerpAngle(g.rotation.y, a.facing, Math.min(1, dt * 8));
    // On longer trips people drive.
    if (body.current) body.current.visible = !a.riding;
    if (car.current) car.current.visible = a.riding;
    if (walking.current !== a.moving) {
      const next = actions[a.moving ? 'walk' : 'idle'];
      const prev = walking.current === null ? null : actions[walking.current ? 'walk' : 'idle'];
      prev?.fadeOut(0.25);
      (next as AnimationAction | null)?.reset().fadeIn(0.25).play();
      walking.current = a.moving;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select(selected ? null : id);
  };

  return (
    <group ref={group} onClick={onClick}>
      <group ref={body}>
        <primitive object={model} />
      </group>
      <group ref={car} visible={false}>
        <Car colorIndex={hashOf(id)} />
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.6, 32]} />
          <meshBasicMaterial color="#f2b544" />
        </mesh>
      )}
      <Html position={[0, 2.05, 0]} center zIndexRange={[20, 10]}>
        <div className={`person-tag${selected ? ' selected' : ''}`}>
          {speaking && <div className="bubble">{speaking}</div>}
          <button
            type="button"
            className="agent-label"
            aria-label={`Show ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              select(selected ? null : id);
            }}
          >
            <strong>{name}</strong>
            {selected && <span>{activity}</span>}
          </button>
        </div>
      </Html>
    </group>
  );
}

export function People() {
  const ids = useTown((s) => (s.tick?.agents ?? []).map((a) => a.id).join(','));
  return (
    <>
      {ids
        .split(',')
        .filter(Boolean)
        .map((id) => (
          <Person key={id} id={id} />
        ))}
    </>
  );
}

/** Moves the sun with the town clock, smoothing between server ticks. */
export function TownClock() {
  useFrame(() => {
    const { tick, tickAt, mode, status, demoSpeed } = useTown.getState();
    if (!tick) return;
    const speed = (mode === 'demo' ? demoSpeed : status?.speed ?? 1) * BASE_SPEED;
    const t = tick.time + (Math.min(performance.now() - tickAt, 1000) / 1000) * speed;
    const h = hourOf(t);
    const view = useView.getState();
    if (Math.abs(h - view.hour) > 0.04) view.setHour(h);
  });
  return null;
}
