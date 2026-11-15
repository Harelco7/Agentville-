import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { MaterialsContext, useMaterials } from './materials';
import { Lighting } from './Lighting';
import { Ground, Hedge, StreetLight, Tree, WALK_Z } from './Street';
import { House } from './House';
import { Agent } from './Agent';

const HOUSE_Z = -14;

/** The look-test street: two houses, gardens, trees, street lights and two people. */
export function World() {
  const materials = useMaterials();
  return (
    <MaterialsContext.Provider value={materials}>
      <Lighting />
      <Ground />

      <House id="cohen" position={[-9, 0, HOUSE_Z]} walls="brick" roof="slate" accent="#8a5a44" />
      <House id="levi" position={[9, 0, HOUSE_Z]} walls="plaster" roof="red" accent="#4f6d7a" />

      {/* front hedges with a gap for each path */}
      {[-9, 9].map((x) => (
        <group key={x}>
          <Hedge position={[x - 4.1, 0, -6.6]} length={6.6} />
          <Hedge position={[x + 4.1, 0, -6.6]} length={6.6} />
        </group>
      ))}

      <Tree position={[-17, 0, -20]} scale={1.15} seed={3} />
      <Tree position={[0, 0, -21]} scale={1.3} seed={7} />
      <Tree position={[17, 0, -19]} scale={1.05} seed={11} />
      <Tree position={[-14, 0, 8.5]} seed={5} />
      <Tree position={[4, 0, 9]} scale={1.2} seed={13} />
      <Tree position={[20, 0, 8]} scale={0.95} seed={17} />
      <Tree position={[-30, 0, -12]} scale={1.2} seed={19} />
      <Tree position={[30, 0, -10]} scale={1.1} seed={23} />

      <StreetLight position={[-18, 0.16, -WALK_Z - 0.8]} facing={1} />
      <StreetLight position={[0, 0.16, -WALK_Z - 0.8]} facing={1} />
      <StreetLight position={[18, 0.16, -WALK_Z - 0.8]} facing={1} />

      <Agent name="Maya" activity="walking to the café" color="#c0563b" position={[-6, 0.16, -WALK_Z]} walkBetween={[-24, 24]} />
      <Agent name="Dana" activity="waiting for Maya" color="#3f6f9c" position={[-8.2, 0.06, -7.6]} facing={0.6} />

      <OrbitControls
        makeDefault
        target={[0, 1.5, -8]}
        minDistance={6}
        maxDistance={90}
        maxPolarAngle={1.45}
        enableDamping
      />

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
