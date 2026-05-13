import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * JPEG/PNG served from `public/images/`. (Previous file was JFIF data with a `.png`
 * name — no alpha; we derive mask from luminance in `buildLuminanceAlphaTexture`.)
 */
export const FLOATING_CREDITS_TEXTURE_URL = '/images/credits.jpg';

function smoothstep01(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {THREE.Texture} sourceTex
 * @returns {THREE.Texture}
 */
function buildLuminanceAlphaTexture(sourceTex) {
  const img = sourceTex.image;
  if (!img || !(img.naturalWidth || img.width)) return sourceTex;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceTex;

  try {
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const mx = Math.max(r, g, b) / 255;
      if (mx < 0.048) {
        d[i + 3] = 0;
      } else {
        d[i + 3] = Math.round(smoothstep01(0.036, 0.13, mx) * 255);
      }
    }
    ctx.putImageData(id, 0, 0);
  } catch (e) {
    console.warn('[FloatingCreditsBag] alpha key failed:', e?.message ?? e);
    return sourceTex;
  }

  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.needsUpdate = true;
  out.minFilter = THREE.LinearMipmapLinearFilter;
  out.magFilter = THREE.LinearFilter;
  out.wrapS = THREE.ClampToEdgeWrapping;
  out.wrapT = THREE.ClampToEdgeWrapping;
  out.generateMipmaps = true;
  return out;
}

const PLANE_SEG = 26;

/**
 * Slow-drifting plastic bag — peripheral path, keyed transparency, soft vertex ripple.
 */
export default function FloatingCreditsBag({ themeId }) {
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const geoRef = useRef(null);
  const basePosRef = useRef(null);

  const tex = useTexture(FLOATING_CREDITS_TEXTURE_URL, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
  });

  const mapTex = useMemo(() => buildLuminanceAlphaTexture(tex), [tex]);

  useEffect(
    () => () => {
      if (mapTex !== tex) mapTex.dispose();
    },
    [mapTex, tex],
  );

  const { planeW, planeH } = useMemo(() => {
    const w = tex.image?.width || 512;
    const h = tex.image?.height || 512;
    const baseW = 1.48;
    return { planeW: baseW, planeH: baseW * (h / w) };
  }, [tex]);

  const { tint, opacity } = useMemo(() => {
    const swamp = themeId === 'swamp';
    return {
      tint: new THREE.Color(swamp ? '#c8e4d6' : '#d4ebfe'),
      opacity: swamp ? 0.68 : 0.72,
    };
  }, [themeId]);

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: mapTex,
        color: tint,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        alphaTest: 0.02,
      }),
    [mapTex, tint, opacity],
  );

  useEffect(
    () => () => {
      mat.dispose();
    },
    [mat],
  );

  useLayoutEffect(() => {
    const g = geoRef.current;
    if (!g) return;
    const pos = g.attributes.position;
    basePosRef.current = new Float32Array(pos.array);
  }, [planeW, planeH]);

  const phaseRef = useRef([
    Math.PI * (1.05 + Math.random() * 0.15),
    Math.PI * (0.25 + Math.random() * 0.2),
    Math.PI * (0.55 + Math.random() * 0.12),
  ]);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    const mesh = meshRef.current;
    const geo = geoRef.current;
    const base = basePosRef.current;
    if (!g) return;

    const t = clock.elapsedTime;
    const [p0, p1, p2] = phaseRef.current;

    const u = t * 0.026 + p0;
    const v = t * 0.0195 + p1;
    const wv = t * 0.016 + p2;

    const R =
      20 +
      6.2 * Math.sin(u * 0.98) +
      2.4 * Math.cos(wv * 0.68) +
      1.3 * Math.sin(v * 0.47 + p2);
    const ang =
      u * 0.74 +
      0.45 * Math.sin(v * 0.58) +
      1.18 +
      0.22 * Math.sin(wv * 0.33);
    const ell = 0.68 + 0.2 * Math.sin(wv * 0.82);

    let x = R * Math.cos(ang) * ell;
    let z = R * Math.sin(ang) * 0.91;
    let y =
      1.2 +
      4.2 * Math.sin(v * 0.84) +
      1.35 * Math.cos(u * 0.41) +
      0.85 * Math.sin(wv * 0.31);

    const xz = Math.hypot(x, z);
    const rMin = 12.4;
    if (xz < rMin) {
      const s = rMin / Math.max(0.001, xz);
      x *= s;
      z *= s;
    }

    y = THREE.MathUtils.clamp(y, -5.8, 8.2);

    g.position.set(x, y, z);

    g.rotation.set(
      0.26 * Math.sin(v * 0.34),
      ang + Math.PI * 0.5 + 0.16 * Math.sin(u * 0.87),
      0.2 * Math.cos(wv * 0.44),
    );

    if (mesh) {
      mesh.rotation.z = 0.11 * Math.sin(t * 0.1 + p2);
    }

    if (geo && base) {
      const pos = geo.attributes.position;
      const arr = pos.array;
      const invW = 2 / planeW;
      const invH = 2 / planeH;
      for (let i = 0; i < arr.length / 3; i += 1) {
        const i3 = i * 3;
        const ox = base[i3];
        const oy = base[i3 + 1];
        const oz = base[i3 + 2];
        const nx = ox * invW;
        const ny = oy * invH;
        const w1 = Math.sin(t * 0.68 + nx * 5.2 + ny * 3.1);
        const w2 = Math.sin(t * 1.02 - nx * 4 + ny * 2.8);
        const w3 = Math.cos(t * 0.52 + oy * 5.5 + nx * 2.2);
        const fold =
          0.088 * w1 + 0.062 * w2 + 0.042 * w3 + 0.028 * Math.sin(t * 0.38 + i * 0.09);
        arr[i3] = ox + nx * fold;
        arr[i3 + 1] = oy + fold * 0.92 + 0.038 * Math.sin(t * 0.61 + ox * 4.1);
        arr[i3 + 2] = oz + (0.4 + 0.6 * ny * ny) * 0.075 * Math.sin(t * 0.84 + nx * 3.3);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} material={mat}>
        <planeGeometry ref={geoRef} args={[planeW, planeH, PLANE_SEG, PLANE_SEG]} />
      </mesh>
    </group>
  );
}
