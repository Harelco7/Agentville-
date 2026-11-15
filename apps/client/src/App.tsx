import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import { World } from './scene/World';
import { Hud } from './ui/Hud';
import { useView } from './store';
import { ErrorScreen } from './ErrorScreen';

export function App() {
  const clearCutaway = useView((s) => s.clearCutaway);
  return (
    <ErrorScreen>
      <Canvas
        shadows="soft"
        flat
        dpr={[1, 2]}
        camera={{ position: [24, 15, 18], fov: 40, near: 0.1, far: 5000 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
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
