import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Leva } from 'leva';
import Scene from './scene/Scene.jsx';
import { RadioProvider } from './audio/RadioContext.jsx';
import RadioOverlay from './ui/RadioOverlay.jsx';

export default function App() {
  return (
    <RadioProvider>
      <Leva
        collapsed
        titleBar={{ title: 'Aquarium controls', drag: true }}
        theme={{
          colors: {
            accent1: '#7cc3e8',
            accent2: '#5fa3c8',
            highlight1: '#a8c8d8',
          },
        }}
      />
      <Canvas
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 0, 6], fov: 55, near: 0.1, far: 80 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      <div className="vignette" />
      <div className="overlay">
        <div className="overlay__title">Dark Aquarium · POC</div>
        <div className="overlay__hint">
          Drag to turn · scroll to drift · find the beacon
        </div>
      </div>
      <RadioOverlay />
    </RadioProvider>
  );
}
