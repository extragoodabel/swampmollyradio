import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/**
 * Fixed DOM readout updated from the R3F loop — proves useFrame + camera
 * are advancing without routing React state every tick.
 */
export default function AquariumEngineDebug({ enabled }) {
  const { camera, gl } = useThree();
  const panelRef = useRef(null);
  const frames = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const el = document.createElement('div');
    el.setAttribute('data-aq-engine-debug', '1');
    el.style.cssText = [
      'position:fixed',
      'left:8px',
      'top:8px',
      'z-index:2147483000',
      'font:11px/1.35 ui-monospace,Menlo,monospace',
      'color:#9f0',
      'background:rgba(0,12,8,0.78)',
      'padding:8px 10px',
      'border-radius:4px',
      'pointer-events:none',
      'white-space:pre',
      'max-width:min(420px,96vw)',
    ].join(';');
    el.textContent = 'aquarium debug…';
    document.body.appendChild(el);
    panelRef.current = el;

    return () => {
      el.remove();
      panelRef.current = null;
    };
  }, [enabled]);

  useFrame((state, delta) => {
    if (!enabled || !panelRef.current) return;

    frames.current += 1;
    if (frames.current % 4 !== 0) return;

    const p = camera.position;
    const y = camera.rotation.y;
    const x = camera.rotation.x;
    const clockOk = Number.isFinite(state.clock.elapsedTime);

    panelRef.current.textContent = [
      `useFrame alive (tick ${frames.current})`,
      `clock ${clockOk ? state.clock.elapsedTime.toFixed(2) : 'BAD'}  dt ${delta.toFixed(4)}`,
      `cam pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`,
      `cam rot yaw ${y.toFixed(3)} pit ${x.toFixed(3)}`,
      `dpr ${gl.getPixelRatio?.() ?? '?'}`,
    ].join('\n');
  });

  return null;
}
