import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PointLight } from 'three';
import { scaledBox } from './geometry';
import { useMats } from './materials';
import { sunAt } from './sun';
import { useView } from '../store';

export const ROAD_HALF = 3.5;
export const WALK_Z = 4.6; // centre line of each sidewalk (±)
const LENGTH = 160;
const GROUND = 600;

/** Grass, the road with its markings, and both sidewalks. */
export function Ground() {
  const m = useMats();
  const dashes = useMemo(() => {
    const xs: number[] = [];
    for (let x = -LENGTH / 2 + 2; x < LENGTH / 2; x += 6) xs.push(x);
    return xs;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={m.grass} receiveShadow>
        <planeGeometry args={[GROUND, GROUND]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.asphalt} receiveShadow>
        <planeGeometry args={[LENGTH, ROAD_HALF * 2]} />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} position={[x, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.6, 0.14]} />
          <meshStandardMaterial color="#e9e4d6" roughness={0.8} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0, 0.08, side * WALK_Z]} geometry={scaledBox(LENGTH, 0.16, 2.2, 1.5)} material={m.concrete} receiveShadow castShadow />
          <mesh position={[0, 0.09, side * (ROAD_HALF + 0.08)]} geometry={scaledBox(LENGTH, 0.18, 0.16, 1)} material={m.paint} receiveShadow />
        </group>
      ))}
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

/** A street light whose lamp turns on as the sun goes down. */
export function StreetLight({ position, facing = 1 }: { position: [number, number, number]; facing?: 1 | -1 }) {
  const m = useMats();
  const light = useRef<PointLight>(null);
  useFrame(() => {
    const { night } = sunAt(useView.getState().hour);
    if (light.current) light.current.intensity = night * 160;
  });
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
      <pointLight ref={light} position={[0, 5.1, facing * 1.2]} color="#ffd39a" distance={22} decay={2} intensity={0} />
    </group>
  );
}
