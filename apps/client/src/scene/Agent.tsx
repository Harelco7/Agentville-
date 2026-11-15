import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const MODEL = '/assets/models/Xbot.glb';

export interface AgentProps {
  name: string;
  activity: string;
  /** Body colour (stands in for clothing until real character models arrive). */
  color: string;
  /** Start point. */
  position: [number, number, number];
  /** If set, the agent walks back and forth along x between these two values. */
  walkBetween?: [number, number];
  /** Facing angle when standing still, in radians. */
  facing?: number;
}

/** A person: an animated character, a walk path and a name label. */
export function Agent({ name, activity, color, position, walkBetween, facing = 0 }: AgentProps) {
  const { scene, animations } = useGLTF(MODEL);
  const group = useRef<Group>(null);
  const dir = useRef(1);

  const model = useMemo(() => {
    const c = clone(scene);
    c.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = (mesh.material as MeshStandardMaterial).clone();
      if (mat.name.includes('Body')) mat.color.set(color);
      else mat.color.set('#2e2a27');
      mat.roughness = 0.75;
      mat.metalness = 0;
      mesh.material = mat;
    });
    return c;
  }, [scene, color]);

  const { actions } = useAnimations(animations, group);
  const walking = Boolean(walkBetween);

  useEffect(() => {
    const action = actions[walking ? 'walk' : 'idle'];
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, walking]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (!walkBetween) {
      g.rotation.y = facing;
      return;
    }
    const speed = 1.35; // m/s, matches the walk cycle
    g.position.x += dir.current * speed * Math.min(dt, 0.05);
    if (g.position.x > walkBetween[1]) dir.current = -1;
    if (g.position.x < walkBetween[0]) dir.current = 1;
    g.rotation.y = dir.current > 0 ? Math.PI / 2 : -Math.PI / 2;
  });

  return (
    <group ref={group} position={position}>
      <primitive object={model} />
      <Html position={[0, 2.15, 0]} center distanceFactor={28} zIndexRange={[10, 0]}>
        <div className="agent-label">
          <strong>{name}</strong>
          <span>{activity}</span>
        </div>
      </Html>
    </group>
  );
}

useGLTF.preload(MODEL);
