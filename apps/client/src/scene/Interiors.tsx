/** Furniture for the café, the shop and the office, laid out around the spots where people sit and work. */
import { scaledBox } from './geometry';
import { useMats } from './materials';

const Y = 0.3; // floor height

function Table({ x, z, w = 0.8, d = 0.8 }: { x: number; z: number; w?: number; d?: number }) {
  const m = useMats();
  return (
    <group position={[x, Y, z]}>
      <mesh position={[0, 0.74, 0]} geometry={scaledBox(w, 0.05, d)} material={m.wood} castShadow receiveShadow />
      <mesh position={[0, 0.37, 0]} material={m.metal} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.72, 8]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} material={m.metal}>
        <cylinderGeometry args={[0.28, 0.28, 0.02, 16]} />
      </mesh>
    </group>
  );
}

function Stool({ x, z, color }: { x: number; z: number; color: string }) {
  const m = useMats();
  return (
    <mesh position={[x, Y + 0.23, z]} material={m.fabric(color)} castShadow>
      <cylinderGeometry args={[0.2, 0.2, 0.46, 12]} />
    </mesh>
  );
}

/** Back counter with a coffee machine, used by the café and shop. */
function Counter({ x, z, width }: { x: number; z: number; width: number }) {
  const m = useMats();
  return (
    <group position={[x, Y, z]}>
      <mesh position={[0, 0.45, 0]} material={m.paint} castShadow receiveShadow>
        <boxGeometry args={[width, 0.9, 0.6]} />
      </mesh>
      <mesh position={[0, 0.92, 0]} material={m.concrete} castShadow>
        <boxGeometry args={[width + 0.1, 0.05, 0.65]} />
      </mesh>
    </group>
  );
}

export function CafeInterior({ accent }: { accent: string }) {
  const m = useMats();
  return (
    <group>
      <Table x={-2.55} z={1.9} />
      <Table x={2.25} z={1.9} />
      <Table x={-2.55} z={3.0} />
      <Table x={2.6} z={-2.4} />
      {[-3.2, -1.9].map((x) => [1.9, 3.0].map((z) => <Stool key={`${x}${z}`} x={x} z={z} color={accent} />))}
      {[1.6, 2.9].map((x) => <Stool key={x} x={x} z={1.9} color={accent} />)}
      {[2.0, 3.2].map((x) => <Stool key={x} x={x} z={-2.4} color={accent} />)}
      <Counter x={-2.4} z={-3.4} width={3.4} />
      <mesh position={[-3.4, Y + 1.15, -3.45]} material={m.metal} castShadow>
        <boxGeometry args={[0.5, 0.45, 0.4]} />
      </mesh>
      <mesh position={[-1.5, Y + 1.0, -3.45]} material={m.fabric('#f1eee8')}>
        <cylinderGeometry args={[0.12, 0.1, 0.18, 12]} />
      </mesh>
    </group>
  );
}

export function ShopInterior({ accent }: { accent: string }) {
  const m = useMats();
  const goods = ['#c9483b', '#e3b23c', '#6f9a3a', '#e7e1d2', '#7b5ea7'];
  return (
    <group>
      {[-2.6, 2.4].map((x) => (
        <group key={x} position={[x, Y, 1.5]}>
          <mesh position={[0, 0.8, 0]} geometry={scaledBox(2.2, 1.6, 0.45)} material={m.wood} castShadow receiveShadow />
          {[0.45, 0.95, 1.45].map((y, row) =>
            [-0.8, -0.4, 0, 0.4, 0.8].map((dx, i) => (
              <mesh key={`${y}${dx}`} position={[dx, y + 0.12, 0.25]} material={m.fabric(goods[(i + row) % goods.length])} castShadow>
                <boxGeometry args={[0.28, 0.24, 0.12]} />
              </mesh>
            )),
          )}
        </group>
      ))}
      <Counter x={-2.6} z={-3.3} width={2.6} />
      <mesh position={[2.2, Y + 0.45, -3.3]} geometry={scaledBox(1.6, 0.9, 0.6)} material={m.fabric(accent)} castShadow receiveShadow />
    </group>
  );
}

export function OfficeInterior({ accent }: { accent: string }) {
  const m = useMats();
  const desks: [number, number][] = [
    [-2.8, 1.15],
    [2.6, 1.15],
    [-2.2, -3.0],
    [2.9, -3.0],
  ];
  return (
    <group>
      {desks.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, Y, z]}>
          <mesh position={[0, 0.74, 0]} geometry={scaledBox(x < 0 && z < 0 ? 2.0 : 1.6, 0.05, 0.75)} material={m.wood} castShadow receiveShadow />
          {[-0.6, 0.6].map((dx) => (
            <mesh key={dx} position={[dx, 0.37, 0]} material={m.metal}>
              <boxGeometry args={[0.05, 0.72, 0.65]} />
            </mesh>
          ))}
          <mesh position={[0, 1.0, -0.2]} material={m.metal} castShadow>
            <boxGeometry args={[0.6, 0.38, 0.04]} />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.2, Y + 0.5, 3.3]} material={m.fabric(accent)} castShadow>
        <cylinderGeometry args={[0.25, 0.2, 1.0, 12]} />
      </mesh>
      <mesh position={[-0.2, Y + 1.25, 3.3]} material={m.leaves} castShadow>
        <icosahedronGeometry args={[0.45, 1]} />
      </mesh>
    </group>
  );
}

/** Linden Park: a lawn with paths, benches facing the street, a fountain and trees. */
export function Park({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const m = useMats();
  const benches: [number, number, number, number][] = [
    [-3.7, 2.05, 0, 2.2],
    [3.7, 2.05, 0, 2.2],
    [0, -2.85, Math.PI, 2.6],
  ];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.03, 3.6]} rotation={[-Math.PI / 2, 0, 0]} material={m.concrete} receiveShadow>
        <planeGeometry args={[1.6, 7]} />
      </mesh>
      <mesh position={[0, 0.03, 1.2]} rotation={[-Math.PI / 2, 0, 0]} material={m.concrete} receiveShadow>
        <planeGeometry args={[11, 1.4]} />
      </mesh>
      <mesh position={[0, 0.03, -1.2]} rotation={[-Math.PI / 2, 0, 0]} material={m.concrete} receiveShadow>
        <circleGeometry args={[2.3, 32]} />
      </mesh>
      {/* fountain */}
      <mesh position={[0, 0.25, -1.2]} material={m.concrete} castShadow receiveShadow>
        <cylinderGeometry args={[1.3, 1.4, 0.5, 32]} />
      </mesh>
      <mesh position={[0, 0.46, -1.2]}>
        <cylinderGeometry args={[1.15, 1.15, 0.05, 32]} />
        <meshStandardMaterial color="#5f8fa8" roughness={0.08} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.9, -1.2]} material={m.concrete} castShadow>
        <cylinderGeometry args={[0.15, 0.25, 0.9, 12]} />
      </mesh>
      {benches.map(([x, z, ry, len]) => (
        <group key={`${x}${z}`} position={[x, 0, z]} rotation={[0, ry, 0]}>
          <mesh position={[0, 0.45, 0]} geometry={scaledBox(len, 0.06, 0.45)} material={m.wood} castShadow receiveShadow />
          <mesh position={[0, 0.75, -0.22]} geometry={scaledBox(len, 0.45, 0.05)} material={m.wood} castShadow />
          {[-len / 2 + 0.15, len / 2 - 0.15].map((dx) => (
            <mesh key={dx} position={[dx, 0.22, 0]} material={m.metal} castShadow>
              <boxGeometry args={[0.06, 0.44, 0.45]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
