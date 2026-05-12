import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * `?aqtypetest=1` — huge system-font banner in front of camera to verify
 * canvas→texture→mesh path (not troika).
 */
export default function TypoEmergencyTest() {
  const map = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 118px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TEST TYPOGRAPHY', 512, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, []);

  return (
    <mesh position={[0, 0.35, 5.2]} renderOrder={200}>
      <planeGeometry args={[11, 2.6]} />
      <meshBasicMaterial
        map={map}
        transparent
        opacity={1}
        fog={false}
        toneMapped={false}
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
