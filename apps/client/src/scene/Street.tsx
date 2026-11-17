import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, InstancedMesh, Object3D, PointLight, Vector3 } from 'three';
import { STREETS } from '@agentville/core';
import { scaledBox } from './geometry';
import { useMats } from './materials';
import { sunAt } from './sun';
import { useView } from '../store';
import { LITE } from '../quality';

export const ROAD_HALF = 3.5;
export const WALK_Z = 4.6; // centre line of each sidewalk, from the street's centre line
const WALK_W = 2.2;
const GROUND = 1400;
const LONG = STREETS.filter((s) => s.axis === 'x');
const CROSS = STREETS.filter((s) => s.axis === 'z');
const CLEAR = WALK_Z + WALK_W / 2; // half the width of a street with its sidewalks

/** Splits a run into pieces that stop short of each crossing street. */
function pieces(from: number, to: number, cuts: number[]): [number, number][] {
  const out: [number, number][] = [];
  let a = from;
  for (const c of [...cuts].sort((p, q) => p - q)) {
    if (c - CLEAR > a) out.push([a, c - CLEAR]);
    a = Math.max(a, c + CLEAR);
  }
  if (to > a) out.push([a, to]);
  return out;
}

/** Many copies of one small shape (road dashes, crossing stripes) in a single draw call. */
function Instances({ items, size, color }: { items: { x: number; z: number; r: number }[]; size: [number, number]; color: string }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, 0.026, it.z);
      o.rotation.set(-Math.PI / 2, 0, it.r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </instancedMesh>
  );
}

/** Grass, every street with its markings and crossings, and the sidewalks. */
export function Ground() {
  const m = useMats();
  const { dashes, zebra } = useMemo(() => {
    const dashes: { x: number; z: number; r: number }[] = [];
    const zebra: { x: number; z: number; r: number }[] = [];
    for (const s of LONG) {
      for (const [a, b] of pieces(s.from, s.to, CROSS.map((c) => c.at))) for (let x = a + 2; x < b - 1; x += 6) dashes.push({ x, z: s.at, r: 0 });
    }
    for (const c of CROSS) {
      for (const [a, b] of pieces(c.from, c.to, LONG.map((s) => s.at))) for (let z = a + 2; z < b - 1; z += 6) dashes.push({ x: c.at, z, r: Math.PI / 2 });
      // Zebra crossings on each side of every junction.
      for (const s of LONG) {
        for (const f of [-1, 1]) {
          for (let k = -2.8; k <= 2.81; k += 0.8) zebra.push({ x: c.at + f * (ROAD_HALF + 1.0), z: s.at + k, r: Math.PI / 2 });
          for (let k = -2.8; k <= 2.81; k += 0.8) zebra.push({ x: c.at + k, z: s.at + f * (ROAD_HALF + 1.0), r: 0 });
        }
      }
    }
    return { dashes, zebra };
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.grass} receiveShadow>
        <planeGeometry args={[GROUND, GROUND]} />
      </mesh>
      {LONG.map((s) => (
        <group key={s.id}>
          <mesh position={[(s.from + s.to) / 2, 0.02, s.at]} rotation={[-Math.PI / 2, 0, 0]} material={m.asphalt} receiveShadow>
            <planeGeometry args={[s.to - s.from, ROAD_HALF * 2]} />
          </mesh>
          {[-1, 1].map((side) =>
            pieces(s.from, s.to, CROSS.map((c) => c.at)).map(([a, b]) => (
              <group key={`${side}${a}`}>
                <mesh position={[(a + b) / 2, 0.08, s.at + side * WALK_Z]} geometry={scaledBox(b - a, 0.16, WALK_W, 1.5)} material={m.concrete} receiveShadow castShadow />
                <mesh position={[(a + b) / 2, 0.09, s.at + side * (ROAD_HALF + 0.08)]} geometry={scaledBox(b - a, 0.18, 0.16, 1)} material={m.paint} receiveShadow />
              </group>
            )),
          )}
        </group>
      ))}
      {CROSS.map((c) => (
        <group key={c.id}>
          <mesh position={[c.at, 0.019, (c.from + c.to) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={m.asphalt} receiveShadow>
            <planeGeometry args={[ROAD_HALF * 2, c.to - c.from]} />
          </mesh>
          {[-1, 1].map((side) =>
            pieces(c.from, c.to, LONG.map((s) => s.at)).map(([a, b]) => (
              <group key={`${side}${a}`}>
                <mesh position={[c.at + side * WALK_Z, 0.08, (a + b) / 2]} geometry={scaledBox(WALK_W, 0.16, b - a, 1.5)} material={m.concrete} receiveShadow castShadow />
                <mesh position={[c.at + side * (ROAD_HALF + 0.08), 0.09, (a + b) / 2]} geometry={scaledBox(0.16, 0.18, b - a, 1)} material={m.paint} receiveShadow />
              </group>
            )),
          )}
        </group>
      ))}
      <Instances items={dashes} size={[2.6, 0.14]} color="#e9e4d6" />
      <Instances items={zebra} size={[1.4, 0.4]} color="#eeeae0" />
    </group>
  );
}

export interface TreeSpot {
  p: [number, number, number];
  s: number;
  seed: number;
}

function clumpsOf(seed: number) {
  let s = seed * 7919;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s % 1000) / 1000;
  };
  return Array.from({ length: 16 }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const rad = 0.6 + rand() * 1.5;
    return { p: [Math.cos(a) * rad, 3.8 + rand() * 2.6, Math.sin(a) * rad] as [number, number, number], r: 0.7 + rand() * 0.6, light: i % 3 === 0 };
  });
}

/** Every tree in town drawn together: trunks, dark leaves and light leaves are one draw call each. */
export function Forest({ trees }: { trees: TreeSpot[] }) {
  const m = useMats();
  const trunk = useRef<InstancedMesh>(null);
  const dark = useRef<InstancedMesh>(null);
  const light = useRef<InstancedMesh>(null);
  const parts = useMemo(() => {
    const dark: number[][] = [];
    const light: number[][] = [];
    for (const t of trees) {
      for (const c of clumpsOf(t.seed)) {
        (c.light ? light : dark).push([t.p[0] + c.p[0] * t.s, t.p[1] + c.p[1] * t.s, t.p[2] + c.p[2] * t.s, c.r * t.s]);
      }
    }
    return { dark, light };
  }, [trees]);
  useLayoutEffect(() => {
    const o = new Object3D();
    const put = (mesh: InstancedMesh | null, list: number[][]) => {
      if (!mesh) return;
      list.forEach(([x, y, z, r], i) => {
        o.position.set(x, y, z);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(r);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    put(dark.current, parts.dark);
    put(light.current, parts.light);
    put(
      trunk.current,
      trees.map((t) => [t.p[0], t.p[1] + 1.8 * t.s, t.p[2], t.s]),
    );
  }, [parts, trees]);
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} material={m.bark} frustumCulled={false} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.26, 3.6, 8]} />
      </instancedMesh>
      <instancedMesh ref={dark} args={[undefined, undefined, parts.dark.length]} material={m.leaves} frustumCulled={false} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={light} args={[undefined, undefined, parts.light.length]} material={m.leavesLight} frustumCulled={false} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
      </instancedMesh>
    </group>
  );
}

/** A broadleaf tree built from a trunk and several overlapping foliage clumps. */
export function Tree({ position, scale = 1, seed = 1 }: { position: [number, number, number]; scale?: number; seed?: number }) {
  const m = useMats();
  const clumps = useMemo(() => {
    let s = seed * 7919;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s % 1000) / 1000;
    };
    return Array.from({ length: 16 }, (_, i) => {
      const a = rand() * Math.PI * 2;
      const rad = 0.6 + rand() * 1.5;
      return {
        p: [Math.cos(a) * rad, 3.8 + rand() * 2.6, Math.sin(a) * rad] as [number, number, number],
        r: 0.7 + rand() * 0.6,
        light: i % 3 === 0,
      };
    });
  }, [seed]);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.8, 0]} material={m.bark} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.26, 3.6, 10]} />
      </mesh>
      {clumps.map((c, i) => (
        <mesh key={i} position={c.p} material={c.light ? m.leavesLight : m.leaves} castShadow receiveShadow>
          <icosahedronGeometry args={[c.r, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/** A clipped hedge along a lot line. */
export function Hedge({ position, length }: { position: [number, number, number]; length: number }) {
  const m = useMats();
  return (
    <mesh position={[position[0], position[1] + 0.45, position[2]]} geometry={scaledBox(length, 0.9, 0.7, 1)} material={m.leaves} castShadow receiveShadow />
  );
}

/** A street light. Its lamp glows after dark; the nearest few also cast light (see LampLights). */
export function StreetLight({ position, facing = 1 }: { position: [number, number, number]; facing?: 1 | -1 }) {
  const m = useMats();
  return (
    <group position={position}>
      <mesh position={[0, 2.8, 0]} material={m.metal} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 5.6, 10]} />
      </mesh>
      <mesh position={[0, 5.55, facing * 0.6]} material={m.metal} castShadow>
        <boxGeometry args={[0.08, 0.08, 1.3]} />
      </mesh>
      <mesh position={[0, 5.45, facing * 1.2]} material={m.metal}>
        <boxGeometry args={[0.3, 0.12, 0.5]} />
      </mesh>
      <mesh position={[0, 5.38, facing * 1.2]} material={m.lampGlow}>
        <boxGeometry args={[0.24, 0.03, 0.42]} />
      </mesh>
    </group>
  );
}

const LIT = LITE ? 3 : 8;

/**
 * Real light from street lamps is costly, so a handful of lights move to the lamps nearest
 * the camera's focus. Far away, the glowing lamp heads are enough.
 */
export function LampLights({ lamps }: { lamps: { p: [number, number, number]; facing: number }[] }) {
  const group = useRef<Group>(null);
  const controls = useThree((s) => s.controls) as unknown as { target?: Vector3 } | null;
  const last = useRef(-Infinity);
  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    const { night } = sunAt(useView.getState().hour);
    const t = clock.elapsedTime;
    if (t - last.current > 0.5) {
      last.current = t;
      const focus = controls?.target ?? camera.position;
      const near = [...lamps].sort((a, b) => Math.hypot(a.p[0] - focus.x, a.p[2] - focus.z) - Math.hypot(b.p[0] - focus.x, b.p[2] - focus.z)).slice(0, LIT);
      near.forEach((l, i) => g.children[i]?.position.set(l.p[0], 5.1, l.p[2] + l.facing * 1.2));
    }
    for (const c of g.children) (c as PointLight).intensity = night * 160;
  });
  return (
    <group ref={group}>
      {Array.from({ length: LIT }, (_, i) => (
        <pointLight key={i} color="#ffd39a" distance={22} decay={2} intensity={0} />
      ))}
    </group>
  );
}
