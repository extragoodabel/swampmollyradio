import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Brief “look this way” cue after the rusty car opens the poem.
 * Billboard ↑, no raycasts, fades while drifting toward the poem anchor.
 */
export default function SwampPoemRevealArrowCue({
  from,
  to,
  duration = 2.35,
  onComplete,
}) {
  const groupRef = useRef(null);
  const matRef = useRef(null);
  const fromV = useMemo(() => new THREE.Vector3(from[0], from[1], from[2]), [from]);
  const toV = useMemo(() => new THREE.Vector3(to[0], to[1], to[2]), [to]);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const t0 = useRef(null);
  const finished = useRef(false);

  const map = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 88px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillText('↑', 64, 72);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, []);

  useEffect(() => {
    t0.current = null;
    finished.current = false;
  }, [from, to]);

  useFrame((st) => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    if (t0.current == null) t0.current = st.clock.elapsedTime;
    const age = st.clock.elapsedTime - t0.current;
    const u = Math.min(1, age / duration);
    const fade = 1 - u;
    m.opacity = Math.max(0, fade * 0.88);
    pos.lerpVectors(fromV, toV, 0.1 + u * 0.42);
    g.position.copy(pos);
    if (u >= 1 && !finished.current) {
      finished.current = true;
      onComplete?.();
    }
  });

  return (
    <group ref={groupRef}>
      <Billboard follow>
        <mesh raycast={() => null} renderOrder={220}>
          <planeGeometry args={[2.4, 2.4]} />
          <meshBasicMaterial
            ref={matRef}
            map={map}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  );
}
