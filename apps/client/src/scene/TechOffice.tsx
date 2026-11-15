/**
 * Linden Labs: a three-storey glass office for the town's hi-tech company. The ground floor is open plan:
 * reception, two rows of desks with monitors, and a lounge corner. Click it for the cutaway.
 * It uses the same footprint and doorway as the houses, so people walk in and out the same way.
 */
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { scaledBox } from './geometry';
import { useMats } from './materials';
import { useView } from '../store';

const W = 10;
const D = 8;
const BASE = 0.3;
const FLOOR = 3.4; // storey height
const STOREYS = 3;
const MULLION = 0.08;

/** One glass wall with slim vertical frames, and an optional doorway in the middle. */
/** Tinted, see-through curtain-wall glass. */
const curtain = new MeshPhysicalMaterial({ color: '#5f86a6', metalness: 0.2, roughness: 0.06, transparent: true, opacity: 0.42, envMapIntensity: 1.4, clearcoat: 1, depthWrite: false });

function GlassWall({ length, door = false, position, rotationY = 0 }: { length: number; door?: boolean; position: [number, number, number]; rotationY?: number }) {
  const m = useMats();
  const panes = Math.round(length / 1.25);
  const pw = length / panes;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: panes }, (_, i) => {
        const x = -length / 2 + pw * (i + 0.5);
        const isDoor = door && Math.abs(x) < pw * 0.6;
        return (
          <group key={i}>
            {!isDoor && (
              <mesh position={[x, FLOOR / 2, 0]} material={curtain}>
                <boxGeometry args={[pw - MULLION, FLOOR - 0.1, 0.04]} />
              </mesh>
            )}
            <mesh position={[x - pw / 2, FLOOR / 2, 0]} material={m.metal} castShadow>
              <boxGeometry args={[MULLION, FLOOR, 0.12]} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[length / 2, FLOOR / 2, 0]} material={m.metal} castShadow>
        <boxGeometry args={[MULLION, FLOOR, 0.12]} />
      </mesh>
    </group>
  );
}

function Desk({ x, z, accent }: { x: number; z: number; accent: MeshStandardMaterial }) {
  const m = useMats();
  return (
    <group position={[x, BASE, z]}>
      <mesh position={[0, 0.74, 0]} geometry={scaledBox(2.5, 0.05, 1.3)} material={m.paint} castShadow receiveShadow />
      {[-1.15, 1.15].map((dx) => (
        <mesh key={dx} position={[dx, 0.37, 0]} material={m.metal}>
          <boxGeometry args={[0.05, 0.72, 1.2]} />
        </mesh>
      ))}
      {/* a low screen between the two sides, and a monitor for each seat */}
      <mesh position={[0, 0.98, 0]} material={accent}>
        <boxGeometry args={[2.4, 0.42, 0.04]} />
      </mesh>
      {[-0.6, 0.6].flatMap((dx) =>
        [-1, 1].map((side) => (
          <group key={`${dx}${side}`} position={[dx, 0.77, side * 0.28]}>
            <mesh position={[0, 0.27, 0]} material={m.metal} castShadow>
              <boxGeometry args={[0.62, 0.36, 0.03]} />
            </mesh>
            <mesh position={[0, 0.27, side * 0.02]}>
              <boxGeometry args={[0.56, 0.3, 0.005]} />
              <meshStandardMaterial color="#9fd0ff" emissive="#5aa9ff" emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0, 0.06, 0]} material={m.metal}>
              <boxGeometry args={[0.06, 0.12, 0.06]} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

export function TechOffice({ id, name, position, rotationY, accent }: { id: string; name: string; position: [number, number, number]; rotationY: number; accent: string }) {
  const m = useMats();
  const cut = useView((s) => s.cutaway === id);
  const toggle = useView((s) => s.toggleCutaway);
  const brand = useMemo(() => new MeshStandardMaterial({ color: accent, roughness: 0.5, emissive: new Color(accent), emissiveIntensity: 0.25 }), [accent]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggle(id);
  };
  const height = BASE + FLOOR * STOREYS;

  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={onClick}>
      {/* slab and polished floor */}
      <mesh position={[0, BASE / 2, 0]} geometry={scaledBox(W + 0.6, BASE, D + 0.6, 2)} material={m.concrete} receiveShadow castShadow />
      <mesh position={[0, BASE + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W - 0.2, D - 0.2]} />
        <meshStandardMaterial color="#d9d6cf" roughness={0.35} />
      </mesh>

      {/* ground floor: glass all round, the front and right side hide in cutaway */}
      {!cut && <GlassWall length={W} door position={[0, BASE, D / 2]} />}
      <GlassWall length={W} position={[0, BASE, -D / 2]} rotationY={Math.PI} />
      <GlassWall length={D} position={[-W / 2, BASE, 0]} rotationY={-Math.PI / 2} />
      {!cut && <GlassWall length={D} position={[W / 2, BASE, 0]} rotationY={Math.PI / 2} />}

      {/* inside: reception, desks, lounge */}
      <group>
        <mesh position={[-2.6, BASE + 0.55, 1.45]} geometry={scaledBox(2.2, 1.1, 0.6)} material={m.paint} castShadow receiveShadow />
        <mesh position={[-2.6, BASE + 0.75, 1.14]} material={brand}>
          <boxGeometry args={[1.4, 0.3, 0.02]} />
        </mesh>
        <Desk x={-2.8} z={-2.55} accent={brand} />
        <Desk x={2.8} z={-2.55} accent={brand} />
        <mesh position={[3.0, BASE + 0.22, 2.85]} material={m.wood} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.44, 20]} />
        </mesh>
        {[2.0, 4.0].map((x) => (
          <mesh key={x} position={[x, BASE + 0.25, 2.85]} material={m.fabric('#e8e3d8')} castShadow>
            <boxGeometry args={[0.55, 0.5, 1.6]} />
          </mesh>
        ))}
        {[-4.4, 4.4].map((x) => (
          <group key={x} position={[x, BASE, -3.5]}>
            <mesh position={[0, 0.35, 0]} material={m.concrete} castShadow>
              <cylinderGeometry args={[0.25, 0.2, 0.7, 12]} />
            </mesh>
            <mesh position={[0, 1.05, 0]} material={m.leavesLight} castShadow>
              <icosahedronGeometry args={[0.45, 1]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* upper floors, roof and sign hide in cutaway */}
      {!cut && (
        <group>
          {Array.from({ length: STOREYS }, (_, i) => (
            <mesh key={i} position={[0, BASE + FLOOR * (i + 1) - 0.12, 0]} geometry={scaledBox(W + 0.4, 0.3, D + 0.4, 2)} material={m.trim} castShadow receiveShadow />
          ))}
          {Array.from({ length: STOREYS - 1 }, (_, i) => {
            const y = BASE + FLOOR * (i + 1) + 0.03;
            return (
              <group key={i}>
                <GlassWall length={W} position={[0, y, D / 2]} />
                <GlassWall length={W} position={[0, y, -D / 2]} rotationY={Math.PI} />
                <GlassWall length={D} position={[-W / 2, y, 0]} rotationY={-Math.PI / 2} />
                <GlassWall length={D} position={[W / 2, y, 0]} rotationY={Math.PI / 2} />
                {/* the floors are lit and furnished too, seen through the glass */}
                <mesh position={[0, y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[W - 0.3, D - 0.3]} />
                  <meshStandardMaterial color="#cfcac0" roughness={0.5} />
                </mesh>
                <mesh position={[0, y + FLOOR - 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[W - 0.3, D - 0.3]} />
                  <meshStandardMaterial color="#fffaf0" emissive="#fff4dc" emissiveIntensity={0.35} />
                </mesh>
                {[-2.8, 2.8].map((x) => (
                  <mesh key={x} position={[x, y + 0.75, -1]} geometry={scaledBox(2.5, 0.05, 1.3)} material={m.paint} castShadow />
                ))}
              </group>
            );
          })}
          {/* roof parapet and plant room */}
          <mesh position={[0, height + 0.35, 0]} geometry={scaledBox(W + 0.4, 0.7, D + 0.4, 2)} material={m.trim} castShadow />
          <mesh position={[-2.2, height + 1.2, -1.5]} geometry={scaledBox(3, 1.6, 2.5, 2)} material={m.concrete} castShadow />
          {/* brand stripe and canopy over the door */}
          <mesh position={[0, BASE + FLOOR - 0.12, D / 2 + 0.22]} material={brand}>
            <boxGeometry args={[W + 0.4, 0.3, 0.04]} />
          </mesh>
          <mesh position={[0, BASE + 2.7, D / 2 + 0.9]} geometry={scaledBox(3.2, 0.12, 1.6, 2)} material={m.trim} castShadow />
        </group>
      )}
      <Html position={[0, cut ? BASE + FLOOR + 0.3 : height + 1.3, D / 2]} center zIndexRange={[5, 0]}>
        <div className="sign tech">{name} · hi-tech</div>
      </Html>
      {cut && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[7.2, 7.5, 64]} />
          <meshBasicMaterial color="#f2b544" transparent opacity={0.85} />
        </mesh>
      )}

      {/* front step and path to the sidewalk */}
      <mesh position={[0, 0.1, D / 2 + 0.45]} geometry={scaledBox(2.4, 0.2, 0.7, 2)} material={m.concrete} castShadow receiveShadow />
      <mesh position={[0, 0.03, D / 2 + 2.85]} geometry={scaledBox(1.6, 0.06, 4.2, 2)} material={m.concrete} receiveShadow />
    </group>
  );
}
