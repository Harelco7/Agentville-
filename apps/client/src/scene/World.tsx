import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { buildingRotation, LOT_XS, LOT_Z, WALK_Z, type Building } from '@agentville/core';
import { MaterialsContext, useMaterials } from './materials';
import { Lighting } from './Lighting';
import { Ground, Hedge, StreetLight, Tree } from './Street';
import { House } from './House';
import { Park } from './Interiors';
import { People, TownClock } from './Agents';
import { CutawayLight } from './CutawayLight';
import { CameraRig } from './CameraRig';
import { useTown } from '../town/store';

/** Trees behind and between the lots, placed the same way every time. */
function useTrees(): { p: [number, number, number]; s: number; seed: number }[] {
  return useMemo(() => {
    const trees: { p: [number, number, number]; s: number; seed: number }[] = [];
    let seed = 1;
    for (const side of [-1, 1]) {
      for (const x of [-60, ...LOT_XS.map((v) => v + 10)]) {
        trees.push({ p: [x + ((seed * 7) % 5) - 2, 0, side * (LOT_Z + 6 + ((seed * 3) % 4))], s: 0.95 + ((seed * 13) % 5) / 10, seed: seed++ });
      }
      for (const x of [-70, 70]) trees.push({ p: [x, 0, side * (LOT_Z - 2)], s: 1.2, seed: seed++ });
    }
    return trees;
  }, []);
}

function Lot({ b }: { b: Building }) {
  const position: [number, number, number] = [b.x, 0, b.side * LOT_Z];
  const rotationY = buildingRotation(b);
  if (b.kind === 'park') {
    return (
      <group>
        <Park position={position} rotationY={rotationY} />
        <Tree position={[b.x - 3.5, 0, b.side * (LOT_Z + 3.5)]} scale={1.2} seed={b.x + 3} />
        <Tree position={[b.x + 4, 0, b.side * (LOT_Z + 4)]} scale={1.05} seed={b.x + 9} />
      </group>
    );
  }
  // Front hedges with a gap for the path. Local z of the hedge line is 7.4 from the lot centre.
  const hedgeZ = b.side * (LOT_Z - 7.4);
  return (
    <group>
      <House id={b.id} kind={b.kind} name={b.name} position={position} rotationY={rotationY} walls={b.walls} roof={b.roof} accent={b.accent} />
      <Hedge position={[b.x - 4.1, 0, hedgeZ]} length={6.6} />
      <Hedge position={[b.x + 4.1, 0, hedgeZ]} length={6.6} />
    </group>
  );
}

/** In development, expose the camera and controls for automated screenshots. */
function DevHooks() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    (window as unknown as { __cam: unknown }).__cam = { camera, controls };
  }, [camera, controls]);
  return null;
}

/** The whole street, built from the town the simulation describes. */
export function World() {
  const materials = useMaterials();
  const buildings = useTown((s) => s.buildings);
  const trees = useTrees();
  return (
    <MaterialsContext.Provider value={materials}>
      <TownClock />
      {import.meta.env.DEV && <DevHooks />}
      <Lighting />
      <Ground />
      {buildings.map((b) => (
        <Lot key={b.id} b={b} />
      ))}
      {trees.map((t) => (
        <Tree key={t.seed} position={t.p} scale={t.s} seed={t.seed} />
      ))}
      {[-60, -20, 20, 60].map((x) => (
        <StreetLight key={`n${x}`} position={[x, 0.16, -WALK_Z - 0.8]} facing={1} />
      ))}
      {[-40, 0, 40].map((x) => (
        <StreetLight key={`s${x}`} position={[x, 0.16, WALK_Z + 0.8]} facing={-1} />
      ))}
      <CutawayLight />
      <People />

      <CameraRig />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={1.2} intensity={2.2} distanceFalloff={0.6} quality="medium" />
        <Bloom mipmapBlur luminanceThreshold={1} intensity={0.7} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.3} darkness={0.45} />
        <SMAA />
      </EffectComposer>
    </MaterialsContext.Provider>
  );
}
