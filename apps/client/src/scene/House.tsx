import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Material, PointLight } from 'three';
import { gable, Opening, scaledBox, wallPieces } from './geometry';
import { useMats } from './materials';
import { sunAt } from './sun';
import { useView } from '../store';

const W = 10; // width along x (m)
const D = 8; // depth along z (m)
const H = 3; // wall height (m)
const T = 0.2; // wall thickness (m)
const BASE = 0.3; // floor slab height (m)
const RISE = 2.4; // roof rise (m)
const OVERHANG = 0.4;

interface WallProps {
  length: number;
  openings: Opening[];
  material: Material;
  position: [number, number, number];
  rotationY?: number;
  texScale: number;
}

/** One wall with its window and door openings, glass, frames and door. */
function Wall({ length, openings, material, position, rotationY = 0, texScale }: WallProps) {
  const m = useMats();
  const pieces = useMemo(() => wallPieces(length, H, openings), [length, openings]);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          geometry={scaledBox(p.w, p.h, T, texScale)}
          material={material}
          position={[p.x, p.y, 0]}
          castShadow
          receiveShadow
        />
      ))}
      {openings.map((o, i) => {
        const w = o.x1 - o.x0;
        const h = o.y1 - o.y0;
        const cx = (o.x0 + o.x1) / 2;
        const cy = (o.y0 + o.y1) / 2;
        if (o.kind === 'gap') return null;
        if (o.kind === 'door') {
          return (
            <group key={i} position={[cx, cy, 0]}>
              <mesh geometry={scaledBox(w - 0.04, h - 0.02, 0.06, 1)} material={m.wood} castShadow />
              <mesh position={[w / 2 - 0.15, 0, 0.06]} material={m.metal}>
                <sphereGeometry args={[0.04, 12, 12]} />
              </mesh>
              <mesh position={[0, h / 2 + 0.04, 0]} geometry={scaledBox(w + 0.16, 0.08, T + 0.06)} material={m.trim} />
            </group>
          );
        }
        return (
          <group key={i} position={[cx, cy, 0]}>
            <mesh geometry={scaledBox(w, h, 0.03)} material={m.glass} />
            {/* frame */}
            <mesh position={[0, h / 2 - 0.04, 0]} geometry={scaledBox(w, 0.08, T + 0.04)} material={m.trim} castShadow />
            <mesh position={[0, -h / 2 + 0.04, 0]} geometry={scaledBox(w, 0.08, T + 0.04)} material={m.trim} />
            <mesh position={[-w / 2 + 0.04, 0, 0]} geometry={scaledBox(0.08, h, T + 0.04)} material={m.trim} />
            <mesh position={[w / 2 - 0.04, 0, 0]} geometry={scaledBox(0.08, h, T + 0.04)} material={m.trim} />
            <mesh geometry={scaledBox(0.05, h, 0.08)} material={m.trim} />
            <mesh geometry={scaledBox(w, 0.05, 0.08)} material={m.trim} />
            {/* sill */}
            <mesh position={[0, -h / 2 - 0.04, 0.08]} geometry={scaledBox(w + 0.2, 0.06, T + 0.2)} material={m.trim} castShadow />
          </group>
        );
      })}
    </group>
  );
}

const FRONT: Opening[] = [
  { x0: -0.55, x1: 0.55, y0: 0, y1: 2.2, kind: 'door' },
  { x0: -3.7, x1: -1.8, y0: 0.9, y1: 2.3, kind: 'window' },
  { x0: 1.8, x1: 3.7, y0: 0.9, y1: 2.3, kind: 'window' },
];
const BACK: Opening[] = [
  { x0: -3.4, x1: -1.9, y0: 1.1, y1: 2.3, kind: 'window' },
  { x0: 1.6, x1: 3.6, y0: 0.9, y1: 2.3, kind: 'window' },
];
const SIDE: Opening[] = [{ x0: -0.9, x1: 0.9, y0: 0.9, y1: 2.3, kind: 'window' }];
const PARTITION: Opening[] = [
  { x0: -2.8, x1: -1.8, y0: 0, y1: 2.2, kind: 'gap' },
  { x0: 1.2, x1: 2.2, y0: 0, y1: 2.2, kind: 'gap' },
];
const PARTITION_SIDE: Opening[] = [{ x0: -0.2, x1: 0.8, y0: 0, y1: 2.2, kind: 'gap' }];

/** Furniture for a living room, kitchen and bedroom. Seen through windows and in cutaway. */
function Interior({ accent }: { accent: string }) {
  const m = useMats();
  const y = BASE;
  const fabric = m.fabric(accent);
  return (
    <group>
      {/* living room (front right) */}
      <mesh position={[2.2, y + 0.005, 1.9]} material={m.fabric('#b8ab95')} receiveShadow>
        <boxGeometry args={[2.6, 0.01, 1.9]} />
      </mesh>
      <mesh position={[2.2, y + 0.22, 3.15]} material={fabric} castShadow receiveShadow>
        <boxGeometry args={[2.3, 0.44, 0.9]} />
      </mesh>
      <mesh position={[2.2, y + 0.62, 3.52]} material={fabric} castShadow>
        <boxGeometry args={[2.3, 0.5, 0.2]} />
      </mesh>
      <mesh position={[1.0, y + 0.32, 3.15]} material={fabric} castShadow>
        <boxGeometry args={[0.2, 0.64, 0.9]} />
      </mesh>
      <mesh position={[3.4, y + 0.32, 3.15]} material={fabric} castShadow>
        <boxGeometry args={[0.2, 0.64, 0.9]} />
      </mesh>
      <mesh position={[2.2, y + 0.2, 2.0]} geometry={scaledBox(1.1, 0.4, 0.6)} material={m.wood} castShadow receiveShadow />
      <mesh position={[2.2, y + 0.25, -0.15]} geometry={scaledBox(1.8, 0.5, 0.4)} material={m.wood} castShadow />
      <mesh position={[2.2, y + 1.15, -0.32]} material={m.metal}>
        <boxGeometry args={[1.5, 0.85, 0.05]} />
      </mesh>
      {/* dining (front left) */}
      <mesh position={[-2.6, y + 0.74, 2.2]} geometry={scaledBox(1.5, 0.05, 0.9)} material={m.wood} castShadow receiveShadow />
      {[-0.6, 0.6].map((dx) =>
        [-0.35, 0.35].map((dz) => (
          <mesh key={`${dx}${dz}`} position={[-2.6 + dx, y + 0.36, 2.2 + dz]} material={m.wood} castShadow>
            <boxGeometry args={[0.05, 0.72, 0.05]} />
          </mesh>
        )),
      )}
      {[1.55, 2.85].map((z) => (
        <mesh key={z} position={[-2.6, y + 0.45, z]} material={m.fabric('#6b5a4a')} castShadow>
          <boxGeometry args={[0.45, 0.9, 0.45]} />
        </mesh>
      ))}
      {/* kitchen (back left) */}
      <mesh position={[-2.6, y + 0.45, -3.4]} material={m.paint} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.9, 0.6]} />
      </mesh>
      <mesh position={[-2.6, y + 0.92, -3.4]} material={m.concrete} castShadow>
        <boxGeometry args={[3.7, 0.05, 0.65]} />
      </mesh>
      <mesh position={[-4.35, y + 0.95, -3.3]} material={m.metal} castShadow>
        <boxGeometry args={[0.8, 1.9, 0.7]} />
      </mesh>
      {/* bedroom (back right) */}
      <mesh position={[2.9, y + 0.22, -2.4]} geometry={scaledBox(1.8, 0.44, 2.1)} material={m.wood} castShadow receiveShadow />
      <mesh position={[2.9, y + 0.5, -2.15]} material={m.fabric('#5f7f9e')} castShadow>
        <boxGeometry args={[1.82, 0.14, 1.6]} />
      </mesh>
      {[2.45, 3.35].map((x) => (
        <mesh key={x} position={[x, y + 0.55, -3.2]} material={m.fabric('#f1eee8')} castShadow>
          <boxGeometry args={[0.7, 0.16, 0.4]} />
        </mesh>
      ))}
      <mesh position={[2.9, y + 0.7, -3.55]} geometry={scaledBox(1.9, 1.0, 0.08)} material={m.wood} castShadow />
    </group>
  );
}

export interface HouseProps {
  id: string;
  position: [number, number, number];
  walls: 'brick' | 'plaster' | 'plasterBlue';
  roof: 'red' | 'slate';
  accent: string;
}

/** A detached house that faces +z. Click it to toggle the cutaway view. */
export function House({ id, position, walls, roof, accent }: HouseProps) {
  const m = useMats();
  const cut = useView((s) => s.cutaway === id);
  const toggle = useView((s) => s.toggleCutaway);
  const light = useRef<PointLight>(null);
  const wallMat = m[walls];
  const roofMat = roof === 'red' ? m.roofRed : m.roofSlate;
  const texScale = walls === 'brick' ? 1.4 : 2;

  const slope = Math.hypot(D / 2 + OVERHANG, RISE);
  const pitch = Math.atan2(RISE, D / 2 + OVERHANG);
  const gableGeo = useMemo(() => gable(D, RISE, T, texScale), [texScale]);

  useFrame(() => {
    if (!light.current) return;
    const { night } = sunAt(useView.getState().hour);
    light.current.intensity = 6 + night * 22 + (cut ? 10 : 0);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggle(id);
  };

  return (
    <group position={position} onClick={onClick}>
      {/* slab and floor */}
      <mesh position={[0, BASE / 2, 0]} geometry={scaledBox(W + 0.3, BASE, D + 0.3, 2)} material={m.concrete} receiveShadow castShadow />
      <mesh position={[0, BASE + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.floorWood} receiveShadow>
        <planeGeometry args={[W - 2 * T, D - 2 * T]} />
      </mesh>

      {/* walls: the front and the right side hide in cutaway */}
      {!cut && <Wall length={W} openings={FRONT} material={wallMat} position={[0, BASE, D / 2 - T / 2]} texScale={texScale} />}
      <Wall length={W} openings={BACK} material={wallMat} position={[0, BASE, -D / 2 + T / 2]} rotationY={Math.PI} texScale={texScale} />
      <Wall length={D - 2 * T} openings={SIDE} material={wallMat} position={[-W / 2 + T / 2, BASE, 0]} rotationY={-Math.PI / 2} texScale={texScale} />
      {!cut && <Wall length={D - 2 * T} openings={SIDE} material={wallMat} position={[W / 2 - T / 2, BASE, 0]} rotationY={Math.PI / 2} texScale={texScale} />}
      <Wall length={W - 2 * T} openings={PARTITION} material={m.paint} position={[0, BASE, -0.5]} texScale={2} />
      <Wall length={3.3} openings={PARTITION_SIDE} material={m.paint} position={[0.5, BASE, -2.15]} rotationY={Math.PI / 2} texScale={2} />

      <Interior accent={accent} />
      <pointLight ref={light} position={[0, BASE + 2.4, 0.5]} color="#ffcf96" distance={14} decay={2} intensity={6} />

      {/* roof, gables and chimney hide in cutaway */}
      {!cut && (
        <group>
          <mesh
            position={[0, BASE + H + RISE / 2, (D / 2 + OVERHANG) / 2]}
            rotation={[pitch, 0, 0]}
            geometry={scaledBox(W + 2 * OVERHANG, 0.14, slope, 2.2)}
            material={roofMat}
            castShadow
            receiveShadow
          />
          <mesh
            position={[0, BASE + H + RISE / 2, -(D / 2 + OVERHANG) / 2]}
            rotation={[-pitch, 0, 0]}
            geometry={scaledBox(W + 2 * OVERHANG, 0.14, slope, 2.2)}
            material={roofMat}
            castShadow
            receiveShadow
          />
          <mesh position={[0, BASE + H + RISE + 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={roofMat} castShadow>
            <cylinderGeometry args={[0.1, 0.1, W + 2 * OVERHANG, 8]} />
          </mesh>
          <mesh geometry={gableGeo} material={wallMat} position={[-W / 2 + T / 2, BASE + H, 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
          <mesh geometry={gableGeo} material={wallMat} position={[W / 2 - T / 2, BASE + H, 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
          <mesh position={[3, BASE + H + 1.9, -1.6]} geometry={scaledBox(0.7, 2.0, 0.7, 1.4)} material={m.brick} castShadow />
        </group>
      )}
      {cut && (
        // A soft outline on the ground so the selected house reads clearly.
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[7.2, 7.5, 64]} />
          <meshBasicMaterial color="#f2b544" transparent opacity={0.85} />
        </mesh>
      )}

      {/* front step and path to the sidewalk */}
      <mesh position={[0, 0.1, D / 2 + 0.45]} geometry={scaledBox(1.8, 0.2, 0.7, 2)} material={m.concrete} castShadow receiveShadow />
      <mesh position={[0, 0.03, D / 2 + 2.85]} geometry={scaledBox(1.3, 0.06, 4.2, 2)} material={m.concrete} receiveShadow />
    </group>
  );
}
