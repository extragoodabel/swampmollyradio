import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * `LightBeam`
 *
 * Broad, atmospheric underwater sunlight. A single plane that
 * billboards around its beam axis -- the plane's "up" is locked to
 * the configured beam direction, its normal rotates to face the
 * camera. That keeps the shaft visible from any horizontal viewing
 * angle without flattening into a screen-space overlay.
 *
 * The mesh is additive + depthTest on / depthWrite off, so:
 *   - fish *behind* the beam pick up the beam's brightness (the
 *     "fish glow when they swim through" read), and
 *   - fish *in front* still occlude it (the "shaft cuts through
 *     the mid-distance" read).
 *
 * Volumetric feel is built from four shader layers:
 *
 *   1. A wide Gaussian "halo" cross-section -- this is the
 *      cathedral light. It defines the *region* of water that's
 *      illuminated. Tunable via `uBeamDiffusion` (sigma) and
 *      `uBeamRegionSize` (scale).
 *   2. A narrower Gaussian "core" sitting inside the halo. This is
 *      the visibly-warmer center of the shaft. Tunable via
 *      `uBeamFalloff` and softened further by `uBeamSoftness`.
 *   3. A low-frequency, slow-drifting noise field (3 sine layers
 *      at different angles & speeds) that adds soft caustic
 *      variation inside the beam. Tunable via `uBeamCausticStrength`
 *      and `uBeamNoiseScale`.
 *   4. Smooth vertical end-fade (top + bottom) so the beam enters
 *      and exits the water without hard caps.
 *
 * Colour mixes a cool aqua base toward a warm cream centre, biased
 * by the core falloff (the halo stays aqua, the centre warms).
 * `uBeamOpacity` is a global multiplier on the whole envelope so
 * the beam can be sat further back into the haze.
 *
 * Fog awareness: view-space depth folds into a brightness
 * multiplier so the distal end of the beam dissolves into the
 * water medium instead of popping into nothing.
 */

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uSoftness;
  uniform float uFalloff;
  uniform float uDiffusion;
  uniform float uCausticStrength;
  uniform float uNoiseScale;
  uniform float uShimmerSpeed;
  uniform float uColorWarmth;
  uniform vec3 uColdColor;
  uniform vec3 uWarmColor;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec2 vUv;
  varying float vDepth;

  // Smooth Gaussian-ish bell evaluated at distance |d| with sigma s.
  // exp(-d^2 / s^2) gives a clean falloff without the sharp tip of
  // pow((1 - d), n). Clamping s away from 0 keeps the expression
  // numerically safe when the slider goes near zero.
  float bell(float d, float s) {
    float sig = max(0.04, s);
    float k = d / sig;
    return exp(-k * k);
  }

  void main() {
    // Lateral position: 0 at the beam centre, 1 at either edge of
    // the geometry. Note that the geometry is already widened by
    // beamRegionSize on the JS side, so this UV space is the *full
    // visible region*, not just the bright core.
    float dx = abs(vUv.x - 0.5) * 2.0;

    // Wide diffuse halo defines the illuminated region. This is
    // what gives the cathedral-light shape: a broad, soft glow
    // that everything inside it sits in.
    float halo = bell(dx, uDiffusion);

    // Narrower bright core sits *inside* the halo. uSoftness
    // raises the bell to a fractional power, slumping the tip --
    // small values (< 1) give a broader plateau, larger values
    // give a tighter centre line. Default 1.5 is a gentle plateau.
    float core = pow(bell(dx, uFalloff), max(0.4, uSoftness));

    // Combined cross-section. The halo provides the floor; the
    // core lifts the centre. Mixed (not summed) so we never go
    // above 1.0 before later multipliers.
    float crossSec = max(halo * 0.55, core);

    // Anything outside the visible halo we just drop -- saves a
    // lot of fragment work for the long thin shaft.
    if (crossSec < 0.0025) discard;

    // Vertical end-fades. Larger windows (0.78 -> 0.85 at the top,
    // 0.30 -> 0.35 at the bottom) keep the beam from terminating
    // visibly; combined with the wider region this reads as light
    // entering through the surface and dispersing into depth.
    float topFade = smoothstep(1.0, 0.82, vUv.y);
    float botFade = smoothstep(0.0, 0.35, vUv.y);
    float lengthMask = topFade * botFade;

    // Three slow, low-frequency sine layers at different angles
    // and drift rates produce a soft caustic field. The point is
    // not to look like waves -- it's to give the impression of
    // sunlight being slowly refracted by moving water above. Low
    // amplitude (controlled by uCausticStrength) keeps it
    // atmospheric rather than busy.
    float t = uTime * uShimmerSpeed;
    float n1 = sin(vUv.y * uNoiseScale * 1.3 - t * 0.55 + vUv.x * 1.7);
    float n2 = sin(vUv.y * uNoiseScale * 0.7 + t * 0.32 - vUv.x * 1.2);
    float n3 = sin((vUv.x + vUv.y) * uNoiseScale * 0.9 + t * 0.41);
    float n = (n1 + n2 + n3) / 3.0;       // -1..1
    float caustic = 1.0 + n * uCausticStrength * 0.5;

    // Colour: halo stays cool aqua, centre warms toward cream.
    // The core (not the halo) drives the warm-mix amount so the
    // outer region never picks up a strong yellow cast.
    vec3 color = mix(uColdColor, uWarmColor, clamp(core * uColorWarmth, 0.0, 1.0));

    // Fog attenuation: the distal end of the beam fades into the
    // water medium so it doesn't pop against the dark background.
    float fogF = clamp(
      (vDepth - uFogNear) / max(0.0001, uFogFar - uFogNear),
      0.0, 1.0
    );
    float fogAtten = 1.0 - fogF * 0.65;

    float alpha =
      crossSec * lengthMask * caustic * uIntensity * uOpacity * fogAtten;

    // Additive blending consumes alpha as brightness. Multiplying
    // color by caustic too means the caustic field modulates both
    // hue intensity and opacity, which sells the refraction.
    gl_FragColor = vec4(color * caustic, alpha);
  }
`;

export default function LightBeam({
  position = [-5, 8, -6],
  angleDegrees = 18,
  width = 4.5,
  length = 16,
  regionSize = 1.8,
  intensity = 1.0,
  opacity = 0.85,
  softness = 1.5,
  falloff = 0.5,
  diffusion = 1.1,
  causticStrength = 0.35,
  noiseScale = 6.0,
  shimmerSpeed = 1.0,
  colorWarmth = 0.65,
  fogNear = 4,
  fogFar = 28,
}) {
  const meshRef = useRef();
  const { camera } = useThree();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: intensity },
          uOpacity: { value: opacity },
          uSoftness: { value: softness },
          uFalloff: { value: falloff },
          uDiffusion: { value: diffusion },
          uCausticStrength: { value: causticStrength },
          uNoiseScale: { value: noiseScale },
          uShimmerSpeed: { value: shimmerSpeed },
          uColorWarmth: { value: colorWarmth },
          // Aqua tint that matches the water medium.
          uColdColor: { value: new THREE.Color('#6fb5cf') },
          // Soft warm sun. Slightly cream, not saturated yellow.
          uWarmColor: { value: new THREE.Color('#fff1c8') },
          uFogNear: { value: fogNear },
          uFogFar: { value: fogFar },
        },
      }),
    // Uniforms are updated imperatively in useFrame; the material is
    // built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Unit plane; final dimensions come from mesh.scale each frame so
  // Leva sliders apply without rebuilding the geometry.
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  // Scratch vectors -- avoid allocating in the hot loop.
  const scratch = useMemo(
    () => ({
      camPos: new THREE.Vector3(),
      meshPos: new THREE.Vector3(),
      toCam: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      direction: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((s) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = s.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    material.uniforms.uIntensity.value = intensity;
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uSoftness.value = softness;
    material.uniforms.uFalloff.value = falloff;
    material.uniforms.uDiffusion.value = diffusion;
    material.uniforms.uCausticStrength.value = causticStrength;
    material.uniforms.uNoiseScale.value = noiseScale;
    material.uniforms.uShimmerSpeed.value = shimmerSpeed;
    material.uniforms.uColorWarmth.value = colorWarmth;
    material.uniforms.uFogNear.value = fogNear;
    material.uniforms.uFogFar.value = fogFar;

    // Beam direction in world space. angle is the tilt from straight
    // down, measured around the Z axis. A positive angle tilts the
    // beam toward +X (rightward) as it descends, so a beam entering
    // upper-left and angled "slightly downward" reads naturally as
    // pointing inward into the scene.
    const a = (angleDegrees * Math.PI) / 180;
    scratch.direction.set(Math.sin(a), -Math.cos(a), 0).normalize();

    // Position the *centre* of the plane at half the beam length
    // below the configured source position, so the source sits at
    // the top of the visible shaft.
    const halfLen = length * 0.5;
    mesh.position.set(
      position[0] + scratch.direction.x * halfLen,
      position[1] + scratch.direction.y * halfLen,
      position[2] + scratch.direction.z * halfLen,
    );

    // Billboard around the beam direction: keep the plane's "up"
    // locked to `direction` and rotate around that axis until the
    // plane normal points at the camera.
    camera.getWorldPosition(scratch.camPos);
    mesh.getWorldPosition(scratch.meshPos);
    scratch.toCam.copy(scratch.camPos).sub(scratch.meshPos);

    // right = direction X toCam (perp to both)
    scratch.right.crossVectors(scratch.direction, scratch.toCam);
    const rLen = scratch.right.length();
    if (rLen < 1e-5) {
      // Degenerate: camera is on the beam axis. Pick an arbitrary
      // perpendicular so the plane still has a defined orientation.
      scratch.right.set(1, 0, 0);
    } else {
      scratch.right.multiplyScalar(1.0 / rLen);
    }
    scratch.up.copy(scratch.direction); // already unit
    scratch.forward.crossVectors(scratch.right, scratch.up).normalize();

    scratch.basis.makeBasis(scratch.right, scratch.up, scratch.forward);
    mesh.quaternion.setFromRotationMatrix(scratch.basis);

    // Lateral scale = width * regionSize. The bright core stays
    // anchored to `width`; the diffuse halo extends out to the
    // full geometry width (which is width * regionSize). That's
    // what makes the beam read as "a region of illuminated water"
    // rather than a single shaft.
    mesh.scale.set(width * regionSize, length, 1);
  });

  return (
    <mesh
      ref={meshRef}
      frustumCulled={false}
      // Decorative -- never block clicks on the radio beacon.
      raycast={() => null}
      // Render after opaque fish so additive blending lands on top
      // of fish pixels that are *behind* the beam in z.
      renderOrder={2}
      geometry={geometry}
      material={material}
    />
  );
}
