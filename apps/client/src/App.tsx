import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { World } from './scene/World';
import { Hud } from './ui/Hud';
import { useView } from './store';
import { ErrorScreen } from './ErrorScreen';
import { startTown } from './town/connection';
import { LITE } from './quality';

export function App() {
  const clearCutaway = useView((s) => s.clearCutaway);
  useEffect(startTown, []);
  return (
    <ErrorScreen>
      <Canvas
        shadows={LITE ? false : 'soft'}
        flat={!LITE}
        dpr={LITE ? 1 : [1, 2]}
        camera={{ position: [46, 34, 44], fov: 40, near: 0.1, far: 5000 }}
        gl={{ antialias: LITE, powerPreference: 'high-performance' }}
        onCreated={({ gl }) =>
          gl.domElement.addEventListener('webglcontextlost', () => {
            // The graphics chip gave up (usually out of memory on a phone): say so instead of a blank screen.
            document.body.dataset.glLost = '1';
          })
        }
        onPointerMissed={clearCutaway}
      >
        <Suspense fallback={null}>
          <World />
        </Suspense>
      </Canvas>
      <Hud />
      <Loader />
    </ErrorScreen>
  );
}
