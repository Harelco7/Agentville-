import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, useAnimations } from '@react-three/drei';
import { AnimationAction, Group, Mesh, MeshStandardMaterial } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BASE_SPEED, hourOf, ROAD_HALF, type AgentView } from '@agentville/core';
import { useModel } from '../assets';
import { useTown } from '../town/store';
import { useView } from '../store';

const findAgent = (id: string): AgentView | undefined => useTown.getState().tick?.agents.find((a) => a.id === id);

/** Floor height under a point: building floors, sidewalks and the lawn. */
function groundY(a: AgentView): number {
  if (a.inside) return 0.3;
  const z = Math.abs(a.z);
  if (z > ROAD_HALF && z < ROAD_HALF + 2.3) return 0.16;
  return 0.03;
}

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
  const walking = useRef<boolean | null>(null);
  const color = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.color ?? '#888');
  const name = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.name ?? '');
  const activity = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.activity ?? '');
  const speaking = useTown((s) => s.tick?.agents.find((a) => a.id === id)?.speaking ?? null);
  const selected = useTown((s) => s.selected === id);
  const select = useTown((s) => s.select);

  const model = useMemo(() => {
    const c = clone(scene);
    c.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = (mesh.material as MeshStandardMaterial).clone();
      if (mat.name.includes('Body')) mat.color.set(color);
      else mat.color.set('#2e2a27');
      mat.roughness = 0.75;
      mat.metalness = 0;
      mesh.material = mat;
    });
    return c;
  }, [scene, color]);

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
    const dx = a.x - g.position.x;
    const dz = a.z - g.position.z;
    if (Math.hypot(dx, dz) > 12) g.position.set(a.x, groundY(a), a.z);
    else {
      const k = Math.min(1, dt * 7);
      g.position.x += dx * k;
      g.position.z += dz * k;
      g.position.y += (groundY(a) - g.position.y) * k;
    }
    g.rotation.y = lerpAngle(g.rotation.y, a.facing, Math.min(1, dt * 8));
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
      <primitive object={model} />
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.6, 32]} />
          <meshBasicMaterial color="#f2b544" />
        </mesh>
      )}
      <Html position={[0, 2.05, 0]} center zIndexRange={[20, 10]}>
        <div className={`person-tag${selected ? ' selected' : ''}`}>
          {speaking && <div className="bubble">{speaking}</div>}
          <div className="agent-label">
            <strong>{name}</strong>
            {selected && <span>{activity}</span>}
          </div>
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
