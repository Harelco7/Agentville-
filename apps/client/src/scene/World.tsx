import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { buildingRotation, CROSS_XS, LOT_XS, LOT_Z, lotCentre, STREETS, type Building } from '@agentville/core';
import { MaterialsContext, useMaterials } from './materials';
import { Lighting } from './Lighting';
import { Forest, Ground, Hedge, LampLights, StreetLight, Tree, WALK_Z, type TreeSpot } from './Street';
import { GRAND, House, SHOPFRONT } from './House';
import { TechOffice } from './TechOffice';
import { CafeInterior, OfficeInterior, Park, ShopInterior } from './Interiors';
import { Awning, BankInterior, ClinicInterior, ClubInterior, FactoryInterior, FactoryRoof, Flag, Lot, Neon, NightGlow, Portico, PublicPool, RedCross, VillaPool } from './Buildings';
import { People, TownClock } from './Agents';
import { CutawayLight } from './CutawayLight';
import { CameraRig } from './CameraRig';
import { useTown } from '../town/store';
import { LITE } from '../quality';

const LONG = STREETS.filter((s) => s.axis === 'x');
const nearCross = (x: number, gap: number) => CROSS_XS.some((c) => Math.abs(x - c) < gap);

/** Trees in the back gardens along every street, placed the same way every time. */
function useTrees(): TreeSpot[] {
  return useMemo(() => {
    const trees: TreeSpot[] = [];
    let seed = 1;
    for (const s of LONG) {
      for (const side of [-1, 1]) {
        for (const lx of LOT_XS) {
          const x = lx + 8.5 + ((seed * 7) % 3) - 1;
          if (!nearCross(x, 7) && x < 200) trees.push({ p: [x, 0, s.at + side * (LOT_Z + 7 + ((seed * 3) % 4))], s: 0.9 + ((seed * 13) % 5) / 10, seed });
          seed++;
        }
      }
    }
    return trees;
  }, []);
}

/** Street lamps along both sides of every long street, alternating sides. */
function useLamps() {
  return useMemo(() => {
    const lamps: { p: [number, number, number]; facing: 1 | -1 }[] = [];
    for (const s of LONG) {
      let i = 0;
      for (let x = -192; x <= 192; x += 22) {
        if (nearCross(x, 8)) continue;
        const side = i++ % 2 ? 1 : -1;
        lamps.push({ p: [x, 0.16, s.at + side * (WALK_Z + 0.8)], facing: side > 0 ? -1 : 1 });
      }
    }
    return lamps;
  }, []);
}

const RESIDENTIAL = new Set<Building['kind']>(['home', 'villa', 'apartments']);

function Place({ b }: { b: Building }) {
  const c = lotCentre(b);
  const position: [number, number, number] = [c.x, 0, c.z];
  const rotationY = buildingRotation(b);
  const common = { id: b.id, position, rotationY, walls: b.walls, roof: b.roof, accent: b.accent };
  const hedgeZ = c.z - b.side * 7.4;
  const hedges = RESIDENTIAL.has(b.kind) && (
    <>
      <Hedge position={[c.x - 4.1, 0, hedgeZ]} length={6.6} />
      <Hedge position={[c.x + 4.1, 0, hedgeZ]} length={6.6} />
    </>
  );
  switch (b.kind) {
    case 'park':
      return (
        <group>
          <Park position={position} rotationY={rotationY} />
          <Tree position={[c.x - 3.5, 0, c.z + b.side * 3.5]} scale={1.2} seed={Math.round(c.x) + 3} />
          <Tree position={[c.x + 4, 0, c.z + b.side * 4]} scale={1.05} seed={Math.round(c.x) + 9} />
        </group>
      );
    case 'tech':
      return <TechOffice id={b.id} name={b.name} position={position} rotationY={rotationY} accent={b.accent} />;
    case 'pool':
      return <PublicPool id={b.id} name={b.name} position={position} rotationY={rotationY} accent={b.accent} />;
    case 'lot':
      return <Lot b={b} position={position} rotationY={rotationY} />;
    case 'apartments':
      return (
        <>
          <House {...common} walls="brick" upper={2} flat sign={b.name} />
          {hedges}
        </>
      );
    case 'villa':
      return (
        <>
          <House {...common} upper={1} flat sign={null}>
            <VillaPool />
          </House>
          {hedges}
        </>
      );
    case 'cafe':
      return (
        <House {...common} sign={b.name} front={SHOPFRONT} interior={<CafeInterior accent={b.accent} />}>
          <Awning color={b.accent} />
        </House>
      );
    case 'shop':
      return (
        <House {...common} sign={b.name} front={SHOPFRONT} interior={<ShopInterior accent={b.accent} />}>
          <Awning color={b.accent} />
        </House>
      );
    case 'office':
      return <House {...common} sign={b.name} interior={<OfficeInterior accent={b.accent} />} />;
    case 'townhall':
      return (
        <House {...common} roof="slate" upper={1} front={GRAND} sign={b.name} interior={<OfficeInterior accent={b.accent} />}>
          <Portico />
          <Flag x={-4.6} z={6.4} color={b.accent} />
        </House>
      );
    case 'bank':
      return (
        <House {...common} upper={1} flat front={GRAND} sign={b.name} interior={<BankInterior accent={b.accent} />}>
          <Portico />
        </House>
      );
    case 'clinic':
      return (
        <House {...common} walls="plaster" flat sign={b.name} front={SHOPFRONT} interior={<ClinicInterior accent={b.accent} />}>
          <RedCross />
        </House>
      );
    case 'club':
      return (
        <House {...common} flat open sign={b.name} interior={<ClubInterior />}>
          <Neon />
        </House>
      );
    case 'factory':
      return (
        <House {...common} walls="brick" upper={1} flat open sign={b.name} interior={<FactoryInterior accent={b.accent} />}>
          <FactoryRoof top={0.3 + 3 * 2 + 0.2} />
        </House>
      );
    case 'store': {
      const type = b.business?.type;
      const interior = type === 'cafe' || type === 'restaurant' || type === 'bakery' ? <CafeInterior accent={b.accent} /> : <ShopInterior accent={b.accent} />;
      return (
        <House {...common} flat open sign={b.name} front={SHOPFRONT} interior={interior}>
          {b.business && <Awning color={b.accent} />}
        </House>
      );
    }
    default:
      return (
        <>
          <House {...common} sign={null} />
          {hedges}
        </>
      );
  }
}

/** In development, expose the camera and controls for automated screenshots. */
function DevHooks() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    (window as unknown as { __cam: unknown }).__cam = { camera, controls, scene };
  }, [camera, controls, scene]);
  return null;
}

/** The whole town, built from what the simulation describes. */
export function World() {
  const materials = useMaterials();
  const buildings = useTown((s) => s.buildings);
  const trees = useTrees();
  const lamps = useLamps();
  return (
    <MaterialsContext.Provider value={materials}>
      <TownClock />
      <NightGlow />
      {(import.meta.env.DEV || import.meta.env.MODE === 'artifact') && <DevHooks />}
      <Lighting />
      <Ground />
      {buildings.map((b) => (
        <Place key={b.id} b={b} />
      ))}
      <Forest trees={trees} />
      {lamps.map((l) => (
        <StreetLight key={`${l.p[0]},${l.p[2]}`} position={l.p} facing={l.facing} />
      ))}
      <LampLights lamps={lamps} />
      <CutawayLight />
      <People />

      <CameraRig />

      {LITE ? null : (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={1.2} intensity={2.2} distanceFalloff={0.6} quality="medium" />
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.7} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.3} darkness={0.45} />
          <SMAA />
        </EffectComposer>
      )}
    </MaterialsContext.Provider>
  );
}
