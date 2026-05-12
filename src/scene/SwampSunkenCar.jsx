import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Distant submerged car — Swamp Molly only. Hull reads as a near-black
 * silhouette (BasicMaterial) so it is only picked out by its hard edges
 * against murk and by faint hollow headlight volumes — not by surface lighting.
 */

/** Half-length of headlight cone along local cylinder axis (before mesh rotation). */
const SHAFT_HALF = 7.5;

const HEADLIGHT_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying float vDepth;

  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const HEADLIGHT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSoftness;
  uniform vec3 uCoreColor;
  uniform vec3 uHazeColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uMurk;
  uniform float uRadiusNarrow;
  uniform float uRadiusWide;

  varying vec3 vLocal;
  varying float vDepth;

  void main() {
    float y = vLocal.y;
    float along =
      smoothstep(-SHAFT_HALF, -SHAFT_HALF * 0.68, y)
      * (1.0 - smoothstep(SHAFT_HALF * 0.72, SHAFT_HALF, y));
    float r = length(vLocal.xz);
    float yNorm = clamp((y + SHAFT_HALF) / max(0.0001, 2.0 * SHAFT_HALF), 0.0, 1.0);
    float coneR = mix(uRadiusNarrow, uRadiusWide, yNorm);
    float edge = 1.0 - smoothstep(coneR * (0.1 + uSoftness * 0.2), coneR, r);

    // Hollow beam: suppress the core, keep a soft shell (faint shafts in murk).
    float radialNorm = r / max(0.04, coneR);
    float hollowRing =
      smoothstep(0.06, 0.38, radialNorm) * (1.0 - smoothstep(0.74, 0.97, radialNorm));
    hollowRing = mix(0.14, 1.0, hollowRing);

    float flicker =
      0.97
      + 0.02 * sin(uTime * 0.48 + y * 0.32)
      + 0.015 * sin(uTime * 0.82 - r * 1.1);

    float fogF = clamp(
      (vDepth - uFogNear) / max(0.0001, uFogFar - uFogNear),
      0.0,
      1.0
    );
    float fogDissolve = mix(1.0, 0.14, pow(fogF, 1.42));
    fogDissolve *= mix(1.0, 0.5, uMurk * fogF);

    float alpha = along * edge * hollowRing * uIntensity * flicker * fogDissolve;

    if (alpha < 0.0008) discard;

    vec3 col = mix(uHazeColor, uCoreColor, edge * 0.28 * hollowRing);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`.replace(/SHAFT_HALF/g, SHAFT_HALF.toFixed(1));

function createHeadlightMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: HEADLIGHT_VERT,
    fragmentShader: HEADLIGHT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.1 },
      uSoftness: { value: 1 },
      uCoreColor: { value: new THREE.Color('#dce8f2') },
      uHazeColor: { value: new THREE.Color('#6d7f88') },
      uFogNear: { value: 7 },
      uFogFar: { value: 34 },
      uMurk: { value: 0.85 },
      uRadiusNarrow: { value: 0.1 },
      uRadiusWide: { value: 2.45 },
    },
  });
}

function MurkHeadlightCone({ geometry, fogNear, fogFar, fogColor, murk }) {
  const mat = useMemo(() => createHeadlightMaterial(), []);

  const haze = useMemo(() => {
    const c = new THREE.Color(fogColor);
    c.multiplyScalar(0.55);
    c.offsetHSL(0, -0.04, 0.06);
    return c;
  }, [fogColor]);

  const core = useMemo(() => {
    const c = new THREE.Color('#b8c4d0');
    c.lerp(new THREE.Color(fogColor), 0.35);
    c.multiplyScalar(0.55);
    return c;
  }, [fogColor]);

  useFrame((s) => {
    const m = mat;
    if (!m) return;
    m.uniforms.uTime.value = s.clock.elapsedTime;
    m.uniforms.uFogNear.value = fogNear;
    m.uniforms.uFogFar.value = fogFar;
    m.uniforms.uMurk.value = murk;
    m.uniforms.uIntensity.value = 0.042;
    m.uniforms.uSoftness.value = 1.4;
    m.uniforms.uCoreColor.value.copy(core);
    m.uniforms.uHazeColor.value.copy(haze);
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, SHAFT_HALF]}
      geometry={geometry}
      material={mat}
      frustumCulled={false}
      raycast={() => null}
      renderOrder={-2}
    />
  );
}

/**
 * @param {{
 *   seabedY: number;
 *   fogNear: number;
 *   fogFar: number;
 *   fogColor: string;
 * }} props
 */
export default function SwampSunkenCar({
  seabedY = -12,
  fogNear,
  fogFar,
  fogColor,
}) {
  const bodyMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#020403'),
        fog: true,
      }),
    [],
  );

  const mudSkirtMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#000000'),
        transparent: true,
        opacity: 0.96,
        fog: true,
        depthWrite: false,
      }),
    [],
  );

  const shadowHaloMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#010102'),
        transparent: true,
        opacity: 0.88,
        fog: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [],
  );

  const lampMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#030504'),
        fog: true,
      }),
    [],
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#040607'),
        transparent: true,
        opacity: 0.28,
        fog: true,
      }),
    [],
  );

  const headlightGlowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#4a5a62'),
        transparent: true,
        opacity: 0.22,
        fog: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const coneGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.09, 2.52, SHAFT_HALF * 2, 18, 1, false);
    g.computeVertexNormals();
    return g;
  }, []);

  /**
   * `seabedY` matches kelp roots (negative Y). Park the hull so its lowest
   * geometry sits below that reference — partially “in the mud” while the
   * cabin stays readable above the murk line.
   */
  const floorY = seabedY + 0.22;
  /** Far +Z: behind default camera; only obvious when the viewer turns around. */
  const groupPos = useMemo(() => [-4.45, floorY - 0.68, 71], [floorY]);

  const murk = 0.94;

  const lightY = -0.08;
  const lightZ = 3.28;
  const lightX = 1.14;

  return (
    <group position={groupPos} rotation={[0, Math.PI, 0]}>
      <group scale={1.14}>
        {/* Lower body / rocker (long wheelbase), sunken into floor reference */}
        <mesh
          castShadow={false}
          material={bodyMat}
          position={[0, 0.04, -0.18]}
        >
          <boxGeometry args={[3.45, 0.72, 6.45]} />
        </mesh>

        {/* Hood — forward mass; slight taper reads less like a floating brick */}
        <mesh
          castShadow={false}
          material={bodyMat}
          position={[0, 0.26, 2.22]}
          rotation={[-0.14, 0, 0]}
          scale={[1.02, 1, 1.04]}
        >
          <boxGeometry args={[3.05, 0.5, 1.92]} />
        </mesh>

        {/* Cowl / dash shelf between hood and windshield */}
        <mesh castShadow={false} material={bodyMat} position={[0, 0.58, 1.08]}>
          <boxGeometry args={[2.55, 0.2, 0.42]} />
        </mesh>

        {/* Cabin */}
        <mesh castShadow={false} material={bodyMat} position={[0, 0.84, -0.28]}>
          <boxGeometry args={[2.22, 0.88, 2.95]} />
        </mesh>

        {/* Roof — slightly narrower than belt for sedan taper */}
        <mesh castShadow={false} material={bodyMat} position={[0, 1.34, -0.2]}>
          <boxGeometry args={[1.76, 0.26, 2.38]} />
        </mesh>

        {/* C-pillar hints */}
        <mesh castShadow={false} material={bodyMat} position={[-0.98, 1.12, -1.38]}>
          <boxGeometry args={[0.2, 0.52, 0.42]} />
        </mesh>
        <mesh castShadow={false} material={bodyMat} position={[0.98, 1.12, -1.38]}>
          <boxGeometry args={[0.2, 0.52, 0.42]} />
        </mesh>

        {/* Trunk / rear mass */}
        <mesh castShadow={false} material={bodyMat} position={[0, 0.26, -2.92]}>
          <boxGeometry args={[2.85, 0.68, 2.12]} />
        </mesh>

        {/* Shoulder / fender line */}
        <mesh castShadow={false} material={bodyMat} position={[0, 0.44, 0.85]}>
          <boxGeometry args={[3.32, 0.22, 1.25]} />
        </mesh>

        {/* Windshield + rear glass */}
        <mesh material={glassMat} position={[0, 0.95, 0.72]} rotation={[0.42, 0, 0]}>
          <planeGeometry args={[1.78, 0.78]} />
        </mesh>
        <mesh material={glassMat} position={[0, 0.88, -1.22]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[1.52, 0.55]} />
        </mesh>

        {/* Wheels */}
        {[
          [-1.18, -0.18, 1.62],
          [1.18, -0.18, 1.62],
          [-1.12, -0.2, -1.52],
          [1.12, -0.2, -1.52],
        ].map((p, i) => (
          <mesh
            key={i}
            castShadow={false}
            material={bodyMat}
            position={p}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.41, 0.43, 0.4, 10]} />
          </mesh>
        ))}

        {/* Front wheel-arch brows */}
        <mesh castShadow={false} material={bodyMat} position={[-1.02, 0.32, 1.62]}>
          <boxGeometry args={[0.22, 0.28, 0.52]} />
        </mesh>
        <mesh castShadow={false} material={bodyMat} position={[1.02, 0.32, 1.62]}>
          <boxGeometry args={[0.22, 0.28, 0.52]} />
        </mesh>
        {/* Rear arch brows */}
        <mesh castShadow={false} material={bodyMat} position={[-0.98, 0.28, -1.52]}>
          <boxGeometry args={[0.2, 0.24, 0.48]} />
        </mesh>
        <mesh castShadow={false} material={bodyMat} position={[0.98, 0.28, -1.52]}>
          <boxGeometry args={[0.2, 0.24, 0.48]} />
        </mesh>

        {/* Grille band — sells “front of car” between lamps */}
        <mesh castShadow={false} material={lampMat} position={[0, -0.12, 3.02]}>
          <boxGeometry args={[1.85, 0.14, 0.12]} />
        </mesh>

        {/* Shadow envelope: slightly larger than hull; car reads as a cut-out in murk */}
        <mesh
          castShadow={false}
          material={shadowHaloMat}
          position={[0, 0.1, -0.15]}
          renderOrder={-6}
        >
          <boxGeometry args={[4.95, 2.05, 8.25]} />
        </mesh>

        {/* Murk skirts — anchor silhouette into black water */}
        <mesh
          castShadow={false}
          material={mudSkirtMat}
          position={[0, -0.75, -0.1]}
          renderOrder={-4}
        >
          <boxGeometry args={[4.65, 1.45, 8.35]} />
        </mesh>
        <mesh
          castShadow={false}
          material={mudSkirtMat}
          position={[0, -0.82, 2.38]}
          rotation={[-0.22, 0, 0]}
          renderOrder={-4}
        >
          <boxGeometry args={[4.2, 1.05, 2.25]} />
        </mesh>
        <mesh
          castShadow={false}
          material={mudSkirtMat}
          position={[0, -0.68, -2.85]}
          rotation={[0.12, 0, 0]}
          renderOrder={-4}
        >
          <boxGeometry args={[3.55, 0.95, 1.75]} />
        </mesh>

        {/* Lamps — wider track, larger lenses */}
        <mesh material={lampMat} position={[-lightX, lightY, lightZ]}>
          <boxGeometry args={[0.58, 0.42, 0.18]} />
        </mesh>
        <mesh material={lampMat} position={[lightX, lightY, lightZ]}>
          <boxGeometry args={[0.58, 0.42, 0.18]} />
        </mesh>
        <mesh material={headlightGlowMat} position={[-lightX, lightY, lightZ + 0.07]}>
          <circleGeometry args={[0.2, 14]} />
        </mesh>
        <mesh material={headlightGlowMat} position={[lightX, lightY, lightZ + 0.07]}>
          <circleGeometry args={[0.2, 14]} />
        </mesh>

        <group position={[-lightX, lightY, lightZ + 0.11]}>
          <MurkHeadlightCone
            geometry={coneGeom}
            fogNear={fogNear}
            fogFar={fogFar}
            fogColor={fogColor}
            murk={murk}
          />
        </group>
        <group position={[lightX, lightY, lightZ + 0.11]}>
          <MurkHeadlightCone
            geometry={coneGeom}
            fogNear={fogNear}
            fogFar={fogFar}
            fogColor={fogColor}
            murk={murk}
          />
        </group>
      </group>
    </group>
  );
}
