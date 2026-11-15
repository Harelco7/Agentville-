import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Sky, Stars } from '@react-three/drei';
import { DirectionalLight, Fog, HemisphereLight, Group } from 'three';
import { sunAt } from './sun';
import { useMats } from './materials';
import { useView } from '../store';
import { useHdri } from '../assets';

/** Sun, moon, sky, image-based light and fog, all driven by the hour of the day. */
export function Lighting() {
  const hour = useView((s) => s.hour);
  const scene = useThree((s) => s.scene);
  const m = useMats();
  const hdri = useHdri();
  const sun = useRef<DirectionalLight>(null);
  const moon = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const stars = useRef<Group>(null);
  const state = sunAt(hour);

  useFrame(() => {
    const s = sunAt(useView.getState().hour);
    if (sun.current) {
      sun.current.position.copy(s.direction).multiplyScalar(80);
      sun.current.intensity = 3.2 * s.day;
      sun.current.color.copy(s.color);
    }
    if (moon.current) moon.current.intensity = 0.45 * s.night;
    if (hemi.current) hemi.current.intensity = 0.08 + 0.35 * s.day;
    scene.environmentIntensity = 0.12 + 0.88 * s.day;
    if (scene.fog instanceof Fog) scene.fog.color.copy(s.fog);
    m.glass.emissiveIntensity = 0.05 + s.night * 1.4;
    m.lampGlow.emissiveIntensity = s.night * 8;
    if (stars.current) stars.current.visible = s.night > 0.4;
  });

  return (
    <>
      <fog attach="fog" args={[state.fog, 80, 320]} />
      <Sky
        distance={4500}
        sunPosition={state.direction.clone().multiplyScalar(100).toArray()}
        turbidity={7}
        rayleigh={1.6}
        mieCoefficient={0.006}
        mieDirectionalG={0.82}
      />
      <group ref={stars}>
        <Stars radius={300} depth={60} count={2500} factor={5} fade speed={0.3} />
      </group>
      <Environment map={hdri} />
      <hemisphereLight ref={hemi} args={['#c7dcff', '#5a6a3c', 0.3]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-85}
        shadow-camera-right={85}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight ref={moon} position={[40, 60, 30]} color="#8ea6ff" intensity={0} />
    </>
  );
}
