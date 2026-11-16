/**
 * The Phase 2 places: civic buildings, the club, the factory, shopfronts, villas with pools, the public pool,
 * empty lots for sale and building sites that rise as the builders work. Each faces +z in its own frame,
 * like the houses, so people walk in and out the same way.
 */
import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CanvasTexture, Color, Group, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { Building } from '@agentville/core';
import { scaledBox } from './geometry';
import { useMats } from './materials';
import { sunAt } from './sun';
import { useView } from '../store';
import { Counter, Stool, Table } from './Interiors';

const Y = 0.3; // floor height
const W = 10;
const D = 8;

// ---------------------------------------------------------------- shared materials

const water = new MeshStandardMaterial({ color: '#2f8fbf', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82 });
const tiles = new MeshStandardMaterial({ color: '#8fd0e6', roughness: 0.4 });
const dirt = new MeshStandardMaterial({ color: '#8a7358', roughness: 1 });
const safety = new MeshStandardMaterial({ color: '#f08a24', roughness: 0.7 });
const red = new MeshStandardMaterial({ color: '#d63a3a', emissive: new Color('#ff3b3b'), emissiveIntensity: 0.2 });
/** Neon tubes for the club, brighter after dark. */
const neonA = new MeshStandardMaterial({ color: '#ff4fd8', emissive: new Color('#ff3fd0'), emissiveIntensity: 0.5 });
const neonB = new MeshStandardMaterial({ color: '#4fe3ff', emissive: new Color('#3fd8ff'), emissiveIntensity: 0.5 });
const floorLights = ['#ff4fd8', '#4fe3ff', '#ffd84f', '#7a5cff'].map((c) => new MeshStandardMaterial({ color: c, emissive: new Color(c), emissiveIntensity: 0.4 }));

/** Brightens every glowing material together, once per frame. */
export function NightGlow() {
  useFrame(() => {
    const { night } = sunAt(useView.getState().hour);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    neonA.emissiveIntensity = 0.5 + night * 5;
    neonB.emissiveIntensity = 0.5 + night * 4 * (0.6 + 0.4 * pulse);
    red.emissiveIntensity = 0.2 + night * 2.5;
    floorLights.forEach((m, i) => (m.emissiveIntensity = 0.3 + (0.5 + 0.5 * Math.sin(performance.now() / 260 + i * 1.7)) * (0.4 + night * 2.5)));
  });
  return null;
}

function boardTexture(text: string, bg: string, fg: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.strokeRect(8, 8, 240, 112);
  g.fillStyle = fg;
  g.font = 'bold 46px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
let boards: { sale: MeshStandardMaterial; sold: MeshStandardMaterial } | null = null;
function useBoards() {
  if (!boards) {
    boards = {
      sale: new MeshStandardMaterial({ map: boardTexture('FOR SALE', '#f4efe2', '#b8322b'), roughness: 0.7 }),
      sold: new MeshStandardMaterial({ map: boardTexture('SOLD', '#2b3a4a', '#f2b544'), roughness: 0.7 }),
    };
  }
  return boards;
}

// ---------------------------------------------------------------- fronts and extras

/** A striped canvas awning over a shopfront. */
export function Awning({ color }: { color: string }) {
  const m = useMats();
  return (
    <group position={[0, Y + 2.85, D / 2 + 0.65]}>
      <mesh rotation={[0.38, 0, 0]} material={m.fabric(color)} castShadow>
        <boxGeometry args={[W - 0.4, 0.06, 1.4]} />
      </mesh>
      {[-1, 1].map((f) => (
        <mesh key={f} position={[f * (W / 2 - 0.3), -0.2, 0.3]} rotation={[0.38, 0, 0]} material={m.metal}>
          <boxGeometry args={[0.04, 0.04, 1.4]} />
        </mesh>
      ))}
    </group>
  );
}

/** Columns and a pediment in front of a civic building. */
export function Portico({ height = 3.2 }: { height?: number }) {
  const m = useMats();
  return (
    <group position={[0, Y, D / 2 + 1.1]}>
      <mesh position={[0, -0.12, 0]} geometry={scaledBox(W - 0.6, 0.12, 2.2, 2)} material={m.concrete} receiveShadow />
      {[-3.9, -2.1, 2.1, 3.9].map((x) => (
        <mesh key={x} position={[x, height / 2, 0.6]} material={m.trim} castShadow>
          <cylinderGeometry args={[0.2, 0.24, height, 14]} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.15, 0.1]} geometry={scaledBox(W - 0.2, 0.3, 2.4, 2)} material={m.trim} castShadow />
    </group>
  );
}

export function Flag({ x, z, color, height = 7 }: { x: number; z: number; color: string; height?: number }) {
  const m = useMats();
  const cloth = useRef<Group>(null);
  useFrame(() => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(performance.now() / 700 + x) * 0.18;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} material={m.metal} castShadow>
        <cylinderGeometry args={[0.05, 0.07, height, 8]} />
      </mesh>
      <group ref={cloth} position={[0, height - 0.6, 0]}>
        <mesh position={[0.65, 0, 0]} material={m.fabric(color)} castShadow>
          <boxGeometry args={[1.3, 0.8, 0.02]} />
        </mesh>
      </group>
    </group>
  );
}

/** A glowing red cross on the clinic. */
export function RedCross() {
  return (
    <group position={[3.3, Y + 2.45, D / 2 + 0.08]}>
      <mesh material={red}>
        <boxGeometry args={[0.9, 0.28, 0.06]} />
      </mesh>
      <mesh material={red}>
        <boxGeometry args={[0.28, 0.9, 0.06]} />
      </mesh>
    </group>
  );
}

/** Neon strips along the club's front. */
export function Neon() {
  return (
    <group position={[0, 0, D / 2 + 0.12]}>
      <mesh position={[0, Y + 3.05, 0]} material={neonA}>
        <boxGeometry args={[W - 0.2, 0.08, 0.06]} />
      </mesh>
      <mesh position={[0, Y + 0.1, 0]} material={neonB}>
        <boxGeometry args={[W - 0.2, 0.06, 0.06]} />
      </mesh>
      {[-1, 1].map((f) => (
        <mesh key={f} position={[f * 1.0, Y + 1.25, 0]} material={neonB}>
          <boxGeometry args={[0.06, 2.4, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** The factory's saw-tooth roof lights and its tall chimney. */
export function FactoryRoof({ top }: { top: number }) {
  const m = useMats();
  return (
    <group position={[0, top, 0]}>
      {[-3, 0, 3].map((x) => (
        <group key={x} position={[x, 0.2, 0]}>
          <mesh position={[0, 0.7, 0]} rotation={[0, 0, 0.5]} geometry={scaledBox(0.12, 2.2, D - 0.4)} material={m.roofSlate} castShadow />
          <mesh position={[0.55, 0.7, 0]} geometry={scaledBox(0.05, 1.4, D - 0.6)} material={m.glass} />
        </group>
      ))}
      <mesh position={[-3.6, 4.5, -2.6]} material={m.brick} castShadow>
        <cylinderGeometry args={[0.55, 0.75, 9, 16]} />
      </mesh>
      <mesh position={[-3.6, 9.1, -2.6]} material={m.metal}>
        <cylinderGeometry args={[0.62, 0.62, 0.3, 16]} />
      </mesh>
    </group>
  );
}

/** A private pool to the side of a villa, with two loungers. People stand in the water up to their chest. */
export function VillaPool() {
  const m = useMats();
  return (
    <group position={[7.5, 0, 0.7]}>
      <mesh position={[0, 0.08, 0]} geometry={scaledBox(4.2, 0.16, 7.4, 2)} material={m.concrete} receiveShadow />
      <mesh position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} material={tiles}>
        <planeGeometry args={[3.0, 6.2]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} material={water}>
        <planeGeometry args={[3.0, 6.2]} />
      </mesh>
      {[-1, 1].map((f) => (
        <mesh key={f} position={[f * 0.9, 0.42, -4.3]} rotation={[-0.3, 0, 0]} material={m.fabric('#f1eee8')} castShadow>
          <boxGeometry args={[0.7, 0.12, 1.8]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- interiors

export function ClubInterior() {
  const m = useMats();
  return (
    <group>
      {/* dance floor */}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[-1.8 + (i % 4) * 1.2, Y + 0.01, 0.2 + Math.floor(i / 4) * 0.9]} rotation={[-Math.PI / 2, 0, 0]} material={floorLights[(i + Math.floor(i / 4)) % 4]}>
          <planeGeometry args={[1.15, 0.85]} />
        </mesh>
      ))}
      <Counter x={-2.1} z={-3.3} width={3.6} />
      {[-3.2, -2.1, -1.0].map((x) => (
        <Stool key={x} x={x} z={-2.5} color="#2a2a3a" />
      ))}
      {/* booths */}
      {[2.4, 3.4].map((x) => (
        <Table key={x} x={x} z={-2.6} w={0.7} d={0.7} />
      ))}
      <mesh position={[3.2, Y + 0.5, 3.1]} geometry={scaledBox(1.6, 1.0, 0.8)} material={m.metal} castShadow />
    </group>
  );
}

export function FactoryInterior({ accent }: { accent: string }) {
  const m = useMats();
  return (
    <group>
      {/* a long workbench line and machines */}
      <mesh position={[0, Y + 0.45, -2.3]} geometry={scaledBox(8.2, 0.9, 0.9)} material={m.metal} castShadow receiveShadow />
      {[-3, 0, 3].map((x) => (
        <group key={x} position={[x, Y, -2.3]}>
          <mesh position={[0, 1.3, 0]} geometry={scaledBox(1.2, 0.8, 0.8)} material={m.fabric(accent)} castShadow />
        </group>
      ))}
      {[-2.5, 2.5].map((x) => (
        <mesh key={x} position={[x, Y + 0.6, 0.6]} geometry={scaledBox(1.6, 1.2, 1.2)} material={m.wood} castShadow receiveShadow />
      ))}
      <Counter x={0.4} z={3.3} width={2.2} />
    </group>
  );
}

export function ClinicInterior({ accent }: { accent: string }) {
  const m = useMats();
  return (
    <group>
      {/* waiting chairs, a reception desk, two beds in the back */}
      {[-3.4, -2.4, -1.4].map((x) => (
        <mesh key={x} position={[x - 0.45, Y + 0.25, 2.6]} geometry={scaledBox(0.5, 0.5, 0.5)} material={m.fabric(accent)} castShadow />
      ))}
      <Counter x={2.6} z={1.2} width={2.0} />
      {[-2.6, 2.9].map((x) => (
        <group key={x} position={[x, Y, -2.6]}>
          <mesh position={[0, 0.45, 0]} geometry={scaledBox(1.0, 0.2, 2.0)} material={m.fabric('#f4f6f8')} castShadow receiveShadow />
          <mesh position={[0, 0.2, 0]} geometry={scaledBox(0.9, 0.4, 1.8)} material={m.metal} />
        </group>
      ))}
    </group>
  );
}

export function BankInterior({ accent }: { accent: string }) {
  const m = useMats();
  return (
    <group>
      <Counter x={-1.4} z={-0.2} width={5} />
      <mesh position={[-1.4, Y + 1.4, -0.2]} geometry={scaledBox(5, 0.9, 0.04)} material={m.glass} />
      <mesh position={[3.3, Y + 1.0, -3.3]} geometry={scaledBox(1.6, 2.0, 0.8)} material={m.metal} castShadow />
      <mesh position={[0, Y + 0.005, 2.2]} rotation={[-Math.PI / 2, 0, 0]} material={m.fabric(accent)}>
        <planeGeometry args={[3.4, 2.4]} />
      </mesh>
      <Table x={-2.8} z={-2.4} w={1.6} />
      <Table x={2.2} z={-2.2} w={1.6} />
    </group>
  );
}

// ---------------------------------------------------------------- outdoor places

function Lounger({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  const m = useMats();
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      <mesh position={[0, 0.32, 0]} rotation={[-0.2, 0, 0]} material={m.fabric('#f1eee8')} castShadow>
        <boxGeometry args={[0.7, 0.1, 1.9]} />
      </mesh>
      <mesh position={[0, 0.15, 0]} material={m.metal}>
        <boxGeometry args={[0.6, 0.3, 1.6]} />
      </mesh>
    </group>
  );
}

function Umbrella({ x, z, color }: { x: number; z: number; color: string }) {
  const m = useMats();
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.2, 0]} material={m.metal}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
      </mesh>
      <mesh position={[0, 2.3, 0]} material={m.fabric(color)} castShadow>
        <coneGeometry args={[1.3, 0.5, 10, 1, true]} />
      </mesh>
    </group>
  );
}

/** The Linden Lido: an open-air pool with a deck, benches, loungers, umbrellas and a ticket booth. */
export function PublicPool({ id, name, position, rotationY, accent }: { id: string; name: string; position: [number, number, number]; rotationY: number; accent: string }) {
  const m = useMats();
  const toggle = useView((s) => s.toggleCutaway);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggle(id);
  };
  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={onClick}>
      <mesh position={[0, 0.06, 0]} geometry={scaledBox(15, 0.12, 10.5, 3)} material={m.concrete} receiveShadow />
      <mesh position={[0, 0.03, 6.8]} geometry={scaledBox(1.6, 0.06, 3.2, 2)} material={m.concrete} receiveShadow />
      {/* basin: coping, tiled floor and the water */}
      {[-1, 1].map((f) => (
        <group key={f}>
          <mesh position={[0, 0.2, f * 2.55]} geometry={scaledBox(7.8, 0.16, 0.3)} material={m.trim} castShadow />
          <mesh position={[f * 3.75, 0.2, -0.1]} geometry={scaledBox(0.3, 0.16, 5.4)} material={m.trim} castShadow />
        </group>
      ))}
      <mesh position={[0, 0.13, -0.1]} rotation={[-Math.PI / 2, 0, 0]} material={tiles}>
        <planeGeometry args={[7.2, 4.8]} />
      </mesh>
      <mesh position={[0, 0.3, -0.1]} rotation={[-Math.PI / 2, 0, 0]} material={water}>
        <planeGeometry args={[7.2, 4.8]} />
      </mesh>
      {/* lane ropes */}
      {[-0.9, 0.7].map((z) => (
        <mesh key={z} position={[0, 0.31, z]} rotation={[0, 0, Math.PI / 2]} material={m.fabric(accent)}>
          <cylinderGeometry args={[0.04, 0.04, 7.2, 6]} />
        </mesh>
      ))}
      {/* benches along the front and sides */}
      {[-6, -4.5, -3, 3, 4.5, 6].map((x) => (
        <mesh key={x} position={[x, 0.45, 3.65]} geometry={scaledBox(1.2, 0.08, 0.45)} material={m.wood} castShadow />
      ))}
      {[-6.8, 6.8].map((x) => (
        <mesh key={x} position={[x, 0.45, -2.5]} geometry={scaledBox(0.45, 0.08, 1.4)} material={m.wood} castShadow />
      ))}
      <Lounger x={-5.4} z={-0.6} />
      <Lounger x={5.4} z={-0.6} />
      <Umbrella x={-5.6} z={-3.4} color={accent} />
      <Umbrella x={5.6} z={-3.4} color="#f2b544" />
      {/* lifeguard chair and ticket booth */}
      <mesh position={[0, 1.0, -3.6]} geometry={scaledBox(0.7, 2.0, 0.7)} material={m.fabric('#e8e2d0')} castShadow />
      <group position={[1.8, 0, 4.4]}>
        <mesh position={[0, 1.2, 0]} geometry={scaledBox(1.6, 2.4, 1.3, 2)} material={m.plaster} castShadow receiveShadow />
        <mesh position={[0, 2.5, 0]} geometry={scaledBox(1.9, 0.12, 1.6)} material={m.fabric(accent)} castShadow />
      </group>
      {/* a low fence */}
      {[-1, 1].map((f) => (
        <mesh key={f} position={[f * 7.6, 0.5, 0]} geometry={scaledBox(0.06, 1.0, 10.4)} material={m.metal} />
      ))}
      <mesh position={[0, 0.5, -5.2]} geometry={scaledBox(15.2, 1.0, 0.06)} material={m.metal} />
      <Html position={[0, 3.2, 5]} center zIndexRange={[5, 0]}>
        <div className="sign">{name}</div>
      </Html>
    </group>
  );
}

/** How tall each kind of building ends up, for the rising frame on a building site. */
const FINAL_HEIGHT: Record<string, number> = { home: 5.4, villa: 6.3, apartments: 9.3, store: 3.3 };

/**
 * An empty lot: grass with a "for sale" board, a "sold" board once someone owns it,
 * or a building site whose walls and scaffolding rise with the builders' hours.
 */
export function Lot({ b, position, rotationY }: { b: Building; position: [number, number, number]; rotationY: number }) {
  const m = useMats();
  const board = useBoards();
  const toggle = useView((s) => s.toggleCutaway);
  const c = b.construction;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggle(b.id);
  };
  if (!c) {
    return (
      <group position={position} rotation={[0, rotationY, 0]} onClick={onClick}>
        <group position={[3.6, 0, 6.2]} rotation={[0, -0.25, 0]}>
          {[-0.55, 0.55].map((x) => (
            <mesh key={x} position={[x, 0.7, 0]} material={m.wood} castShadow>
              <boxGeometry args={[0.08, 1.4, 0.08]} />
            </mesh>
          ))}
          <mesh position={[0, 1.2, 0.05]} material={b.ownerId ? board.sold : board.sale} castShadow>
            <boxGeometry args={[1.4, 0.7, 0.04]} />
          </mesh>
        </group>
      </group>
    );
  }
  return <BuildingSite b={b} position={position} rotationY={rotationY} onClick={onClick} />;
}

function BuildingSite({ b, position, rotationY, onClick }: { b: Building; position: [number, number, number]; rotationY: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const m = useMats();
  const c = b.construction!;
  const p = Math.max(0.04, Math.min(1, c.done / Math.max(1, c.needed)));
  const full = FINAL_HEIGHT[c.target] ?? 5;
  const h = full * p;
  const poles = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -5.6; x <= 5.61; x += 2.8) out.push([x, -4.6], [x, 4.6]);
    for (const z of [-1.6, 1.6]) out.push([-5.6, z], [5.6, z]);
    return out;
  }, []);
  const levels = Math.max(1, Math.floor((h + 1) / 2));
  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={onClick}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={dirt} receiveShadow>
        <planeGeometry args={[14, 12]} />
      </mesh>
      <mesh position={[0, 0.15, 0]} geometry={scaledBox(W + 0.3, 0.3, D + 0.3, 2)} material={m.concrete} castShadow receiveShadow />
      {/* the walls so far */}
      {h > 0.4 && (
        <group position={[0, 0.3, 0]}>
          {[-1, 1].map((f) => (
            <mesh key={`z${f}`} position={[0, h / 2, f * (D / 2 - 0.1)]} geometry={scaledBox(W, h, 0.2, 1.4)} material={m.brick} castShadow receiveShadow />
          ))}
          {[-1, 1].map((f) => (
            <mesh key={`x${f}`} position={[f * (W / 2 - 0.1), h / 2, 0]} geometry={scaledBox(0.2, h, D - 0.4, 1.4)} material={m.brick} castShadow receiveShadow />
          ))}
        </group>
      )}
      {/* scaffolding a little ahead of the walls */}
      {poles.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (h + 1.2) / 2, z]} material={m.metal} castShadow>
          <cylinderGeometry args={[0.04, 0.04, h + 1.2, 6]} />
        </mesh>
      ))}
      {Array.from({ length: levels }, (_, i) => (
        <group key={i} position={[0, 1 + i * 2, 0]}>
          {[-1, 1].map((f) => (
            <mesh key={f} position={[0, 0, f * 4.6]} geometry={scaledBox(11.4, 0.06, 0.5)} material={m.wood} castShadow />
          ))}
        </group>
      ))}
      {/* a crane for the big jobs */}
      {(c.target === 'apartments' || c.target === 'villa') && (
        <group position={[-6.8, 0, -3.5]}>
          <mesh position={[0, 7, 0]} geometry={scaledBox(0.5, 14, 0.5)} material={safety} castShadow />
          <mesh position={[3.5, 13.8, 0]} geometry={scaledBox(9, 0.35, 0.35)} material={safety} castShadow />
          <mesh position={[-1.6, 13.5, 0]} geometry={scaledBox(1.4, 0.9, 0.9)} material={m.concrete} castShadow />
        </group>
      )}
      {/* pallets of bricks and a barrier along the front */}
      <mesh position={[4.2, 0.4, 5.8]} geometry={scaledBox(1.2, 0.8, 1.0, 1.4)} material={m.brick} castShadow />
      <mesh position={[-4.2, 0.3, 5.8]} geometry={scaledBox(1.6, 0.6, 0.8)} material={m.wood} castShadow />
      {[-5.5, -2.5, 2.5, 5.5].map((x) => (
        <mesh key={x} position={[x, 0.5, 7.2]} geometry={scaledBox(2.4, 0.25, 0.08)} material={safety} castShadow />
      ))}
      <Html position={[0, Math.max(h, 2) + 1.8, 4.8]} center zIndexRange={[5, 0]}>
        <div className="sign building">
          {b.name.replace(' (being built)', '')} · {Math.round(p * 100)}%
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------- cars

const CAR_COLORS = ['#b8322b', '#2f5f8f', '#e8e4da', '#2b2b2f', '#5b7d4a', '#c9a23a', '#7a7f87'];
const carPaint = CAR_COLORS.map((c) => new MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.35 }));

/** A small car someone drives on longer trips. Faces +z. */
export function Car({ colorIndex }: { colorIndex: number }) {
  const m = useMats();
  const paint = carPaint[colorIndex % carPaint.length];
  return (
    <group>
      <mesh position={[0, 0.55, 0]} geometry={scaledBox(1.7, 0.6, 3.9)} material={paint} castShadow />
      <mesh position={[0, 1.08, -0.2]} geometry={scaledBox(1.5, 0.5, 2.0)} material={paint} castShadow />
      <mesh position={[0, 1.08, -0.2]} geometry={scaledBox(1.52, 0.38, 1.8)} material={m.glass} />
      {[-0.8, 0.8].flatMap((x) =>
        [-1.25, 1.25].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation={[0, 0, Math.PI / 2]} material={m.metal} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.22, 14]} />
          </mesh>
        )),
      )}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.62, 1.96]} material={m.lampGlow}>
          <boxGeometry args={[0.3, 0.12, 0.04]} />
        </mesh>
      ))}
    </group>
  );
}
