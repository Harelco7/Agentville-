import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PointLight } from 'three';
import { lotCentre } from '@agentville/core';
import { sunAt } from './sun';
import { useView } from '../store';
import { useTown } from '../town/store';

/**
 * One warm light that moves into whichever building is opened in cutaway.
 * A single light (instead of one per house) keeps the street fast to draw.
 */
export function CutawayLight() {
  const light = useRef<PointLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const { cutaway, hour } = useView.getState();
    const b = cutaway ? useTown.getState().buildings.find((x) => x.id === cutaway) : undefined;
    if (!b) {
      l.intensity = 0;
      return;
    }
    const c = lotCentre(b);
    l.position.set(c.x, 2.7, c.z - b.side * 0.5);
    l.intensity = 14 + sunAt(hour).night * 24;
  });
  return <pointLight ref={light} color="#ffcf96" distance={16} decay={2} intensity={0} />;
}
