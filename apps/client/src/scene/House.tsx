import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group, Material } from 'three';
import { gable, Opening, scaledBox, wallPieces } from './geometry';
import { useMats } from './materials';
import { useView } from '../store';
import { LITE } from '../quality';

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
export function Interior({ accent }: { accent: string }) {
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

export const SHOPFRONT: Opening[] = [
  { x0: -0.6, x1: 0.6, y0: 0, y1: 2.3, kind: 'door' },
  { x0: -4.3, x1: -1.0, y0: 0.35, y1: 2.6, kind: 'window' },
  { x0: 1.0, x1: 4.3, y0: 0.35, y1: 2.6, kind: 'window' },
];
export const GRAND: Opening[] = [
  { x0: -0.7, x1: 0.7, y0: 0, y1: 2.5, kind: 'door' },
  { x0: -4.1, x1: -3.0, y0: 0.8, y1: 2.5, kind: 'window' },
  { x0: -2.4, x1: -1.3, y0: 0.8, y1: 2.5, kind: 'window' },
  { x0: 1.3, x1: 2.4, y0: 0.8, y1: 2.5, kind: 'window' },
  { x0: 3.0, x1: 4.1, y0: 0.8, y1: 2.5, kind: 'window' },
];

export interface HouseProps {
  id: string;
  position: [number, number, number];
  rotationY: number;
  walls: 'brick' | 'plaster' | 'plasterBlue';
  roof: 'red' | 'slate';
  accent: string;
  /** Furniture inside the ground floor. */
  interior?: ReactNode;
  /** A sign over the door, or nothing for a private home. */
  sign?: string | null;
  /** Floors above the ground floor. */
  upper?: number;
  /** A flat roof with a parapet instead of a pitched one. */
  flat?: boolean;
  front?: Opening[];
  /** No inner walls (shops, the club). */
  open?: boolean;
  /** Extras in the building's own frame: awnings, columns, a pool. */
  children?: ReactNode;
}

/** The closed floors above the ground floor: walls with lit windows. */
function UpperFloors({ floors, material, texScale }: { floors: number; material: Material; texScale: number }) {
  const m = useMats();
  return (
    <group>
      {Array.from({ length: floors }, (_, i) => {
        const y = BASE + H * (i + 1);
        return (
          <group key={i} position={[0, y, 0]}>
            <mesh position={[0, H / 2, 0]} geometry={scaledBox(W, H, D, texScale)} material={material} castShadow receiveShadow />
            {/* a band between floors */}
            <mesh position={[0, 0.06, 0]} geometry={scaledBox(W + 0.12, 0.12, D + 0.12)} material={m.trim} />
            {[-1, 1].map((f) =>
              [-3, 0, 3].map((x) => (
                <group key={`${f}${x}`} position={[x, 1.65, f * (D / 2 + 0.02)]}>
                  <mesh geometry={scaledBox(1.7, 1.4, 0.04)} material={m.glass} />
                  <mesh position={[0, -0.76, f * 0.06]} geometry={scaledBox(1.9, 0.08, 0.14)} material={m.trim} />
                </group>
              )),
            )}
            {[-1, 1].map((f) => (
              <mesh key={f} position={[f * (W / 2 + 0.02), 1.65, 0]} geometry={scaledBox(0.04, 1.4, 1.6)} material={m.glass} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

/**
 * A building that faces +z in its own frame: a home, a shop, a civic building or a block of flats.
 * The ground floor is open to view in cutaway (click it); upper floors and the roof lift away.
 * Far from the camera, the furniture inside isn't drawn.
 */
export function House({ id, position, rotationY, walls, roof, accent, interior, sign, upper = 0, flat = false, front = FRONT, open = false, children }: HouseProps) {
  const m = useMats();
  const cut = useView((s) => s.cutaway === id);
  const toggle = useView((s) => s.toggleCutaway);
  const camera = useThree((s) => s.camera);
  const inside = useRef<Group>(null);
  const wallMat = m[walls];
  const roofMat = roof === 'red' ? m.roofRed : m.roofSlate;
  const texScale = walls === 'brick' ? 1.4 : 2;
  const top = BASE + H * (1 + upper);

  const slope = Math.hypot(D / 2 + OVERHANG, RISE);
  const pitch = Math.atan2(RISE, D / 2 + OVERHANG);
  const gableGeo = useMemo(() => gable(D, RISE, T, texScale), [texScale]);

  useFrame(() => {
    const g = inside.current;
    if (!g) return;
    const near = Math.hypot(camera.position.x - position[0], camera.position.z - position[2]) < (LITE ? 45 : 75);
    g.visible = cut || near;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggle(id);
  };

  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={onClick}>
      {/* slab and floor */}
      <mesh position={[0, BASE / 2, 0]} geometry={scaledBox(W + 0.3, BASE, D + 0.3, 2)} material={m.concrete} receiveShadow castShadow />
      <mesh position={[0, BASE + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.floorWood} receiveShadow>
        <planeGeometry args={[W - 2 * T, D - 2 * T]} />
      </mesh>

      {/* walls: the front and the right side hide in cutaway */}
      {!cut && <Wall length={W} openings={front} material={wallMat} position={[0, BASE, D / 2 - T / 2]} texScale={texScale} />}
      <Wall length={W} openings={BACK} material={wallMat} position={[0, BASE, -D / 2 + T / 2]} rotationY={Math.PI} texScale={texScale} />
      <Wall length={D - 2 * T} openings={SIDE} material={wallMat} position={[-W / 2 + T / 2, BASE, 0]} rotationY={-Math.PI / 2} texScale={texScale} />
      {!cut && <Wall length={D - 2 * T} openings={SIDE} material={wallMat} position={[W / 2 - T / 2, BASE, 0]} rotationY={Math.PI / 2} texScale={texScale} />}
      <group ref={inside}>
        {!open && <Wall length={W - 2 * T} openings={PARTITION} material={m.paint} position={[0, BASE, -0.5]} texScale={2} />}
        {!open && <Wall length={3.3} openings={PARTITION_SIDE} material={m.paint} position={[0.5, BASE, -2.15]} rotationY={Math.PI / 2} texScale={2} />}
        {interior ?? <Interior accent={accent} />}
      </group>
      {sign && (
        <Html position={[0, top + (flat ? 0.6 : 0.2), D / 2 + 0.3]} center zIndexRange={[5, 0]}>
          <div className="sign">{sign}</div>
        </Html>
      )}

      {/* upper floors and the roof hide in cutaway */}
      {!cut && upper > 0 && <UpperFloors floors={upper} material={wallMat} texScale={texScale} />}
      {!cut && flat && (
        <group position={[0, top, 0]}>
          <mesh position={[0, 0.1, 0]} geometry={scaledBox(W + 0.3, 0.2, D + 0.3, 2)} material={m.concrete} castShadow receiveShadow />
          {[-1, 1].map((f) => (
            <mesh key={`z${f}`} position={[0, 0.45, f * (D / 2 + 0.05)]} geometry={scaledBox(W + 0.3, 0.5, 0.2, texScale)} material={wallMat} castShadow />
          ))}
          {[-1, 1].map((f) => (
            <mesh key={`x${f}`} position={[f * (W / 2 + 0.05), 0.45, 0]} geometry={scaledBox(0.2, 0.5, D + 0.1, texScale)} material={wallMat} castShadow />
          ))}
          {/* a rooftop unit */}
          <mesh position={[2.6, 0.6, -1.6]} geometry={scaledBox(1.6, 0.8, 1.2)} material={m.metal} castShadow />
        </group>
      )}
      {!cut && !flat && (
        <group position={[0, top - BASE - H, 0]}>
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
        // A soft outline on the ground so the selected building reads clearly.
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[7.2, 7.5, 64]} />
          <meshBasicMaterial color="#f2b544" transparent opacity={0.85} />
        </mesh>
      )}
      {children}

      {/* front step and path to the sidewalk */}
      <mesh position={[0, 0.1, D / 2 + 0.45]} geometry={scaledBox(1.8, 0.2, 0.7, 2)} material={m.concrete} castShadow receiveShadow />
      <mesh position={[0, 0.03, D / 2 + 2.85]} geometry={scaledBox(1.3, 0.06, 4.2, 2)} material={m.concrete} receiveShadow />
    </group>
  );
}
