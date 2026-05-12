import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Mid-distance instanced fish layer.
 *
 * Design goals:
 *   - 300-600 fish that "fill" the volume around the viewer
 *     vertically and behind / above / below the camera, without each
 *     being a full React component.
 *   - One draw call. One geometry. One material. Per-instance data
 *     lives in CPU `Float32Array`s and is pushed to the GPU each
 *     frame.
 *   - Cheaper motion than the hero school: linear velocity + a small
 *     shared sine wave, no current sampling, no scatter, no shimmer.
 *   - Camera-relative recycling: any instance that drifts outside a
 *     soft sphere around the camera is teleported to a random
 *     position inside the sphere on the opposite side, so the volume
 *     around the viewer never empties out as the camera drifts.
 *
 * Implementation notes:
 *   - `InstancedMesh` of a unit `PlaneGeometry`.
 *   - Custom `ShaderMaterial` with a billboard vertex shader. The
 *     plane is re-aligned to the camera each frame *inside* the shader
 *     (using `viewMatrix * instance origin` and then adding the local
 *     corner offset in view space). The instance's "rotation" is
 *     ignored — only its position and scale columns are read out of
 *     `instanceMatrix`. This keeps CPU work minimal: we only need to
 *     write a translation + scale matrix per instance per frame.
 *   - Per-instance attributes (`aFlip`, `aOpacity`, `aPhase`) ride on
 *     the geometry as `InstancedBufferAttribute`s and never change.
 *   - The shader does its own depth-based fog tint so distant
 *     midfield fish dissolve into `fogColor` and (mostly) fade out
 *     rather than popping at the far plane.
 */

const VERTEX_SHADER = /* glsl */ `
  attribute float aFlip;
  attribute float aOpacity;
  attribute float aPhase;

  uniform float uTime;
  uniform float uAspect;

  varying vec2 vUv;
  varying float vOpacity;
  varying float vFlip;
  varying float vDepth;
  varying float vCamDist;

  void main() {
    // Pull position + per-axis scale out of the instanceMatrix.
    // Rotation columns are ignored -- we billboard in view space.
    vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float scaleX = length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z));
    float scaleY = length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z));

    // Tiny tail-wag wiggle on the bottom-half corners only, so the
    // silhouette has a faint sense of swimming. position.x runs -0.5..0.5
    // and position.y runs -0.5..0.5 for a unit PlaneGeometry.
    float wag = sin(uTime * 2.4 + aPhase) * 0.025;
    float wagShape = step(position.x, 0.0); // only the tail half

    vec2 quad = vec2(
      position.x * uAspect * scaleX,
      position.y * scaleY
    );
    quad.y += wag * wagShape * scaleY * 0.5;

    // Place the instance origin in view space, then offset by the
    // camera-aligned quad. Result: the plane always faces the camera.
    vec4 mv = viewMatrix * worldOrigin;
    mv.xy += quad;

    gl_Position = projectionMatrix * mv;

    vUv = uv;
    vOpacity = aOpacity;
    vFlip = aFlip;
    vDepth = -mv.z;
    // Full 3D distance from the camera to this instance's origin.
    // Used in the fragment shader for the edge-falloff fade so that
    // fish at the rim of the world sphere read as faint texture
    // rather than discrete sprites.
    vCamDist = length(worldOrigin.xyz - cameraPosition);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uOpacityMul;
  uniform float uWorldRadius;
  uniform float uPeripheral;

  varying vec2 vUv;
  varying float vOpacity;
  varying float vFlip;
  varying float vDepth;
  varying float vCamDist;

  void main() {
    vec2 uv = vUv;
    // Left/right flip via the per-instance direction.
    if (vFlip < 0.0) uv.x = 1.0 - uv.x;
    vec4 tex = texture2D(uMap, uv);
    if (tex.a < 0.04) discard;

    // Depth fade matched to the scene fog. Midfield fish should
    // dissolve into the water medium rather than vanish.
    float fog = clamp(
      (vDepth - uFogNear) / max(0.0001, uFogFar - uFogNear),
      0.0, 1.0
    );

    // Radial edge fade: as a fish approaches the periphery of the
    // surround sphere, its opacity bleeds toward the uPeripheral
    // multiplier. This is what gives the volume "breathing space"
    // and stops the rim from feeling crowded.
    float rim = smoothstep(0.4, 1.0, vCamDist / max(0.0001, uWorldRadius));
    float edgeFade = mix(1.0, uPeripheral, rim);

    // Stronger fog tint than before -- distant fish should read as
    // colored water, not as sharply-defined fish.
    vec3 color = mix(tex.rgb, uFogColor, fog * 0.92);
    float alpha = tex.a * vOpacity * uOpacityMul * edgeFade
                * (1.0 - fog * 0.7);

    gl_FragColor = vec4(color, alpha);
  }
`;

function MidfieldImpl({
  count,
  worldRadius,
  verticalSpread,
  swimSpeed,
  distantFishOpacity,
  fogColor,
  fogNear,
  fogFar,
  texture,
}) {
  const meshRef = useRef();
  const { camera } = useThree();

  // Texture aspect drives plane width; salmon SVG is 2:1.
  const aspect = useMemo(() => {
    const img = texture.image;
    if (img && img.width && img.height) return img.width / img.height;
    return 2.0;
  }, [texture]);

  // CPU-side per-instance state. Reallocated only when `count` /
  // `worldRadius` / `verticalSpread` change.
  const state = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const flip = new Float32Array(count);
    const opacity = new Float32Array(count);
    const phase = new Float32Array(count);

    const cameraPos = new THREE.Vector3();
    camera.getWorldPosition(cameraPos);

    const verticalRatio = verticalSpread / worldRadius;

    for (let i = 0; i < count; i++) {
      // Distribute on/inside a sphere around the camera. Bias toward
      // the outside (Math.pow(rng, 0.65)) so the shell of the volume
      // is denser than dead-center; the hero fish handle the close-in
      // band.
      const r = worldRadius * (0.35 + 0.65 * Math.pow(Math.random(), 0.65));
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i * 3 + 0] = cameraPos.x + r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = cameraPos.y + r * Math.cos(phi) * verticalRatio;
      pos[i * 3 + 2] = cameraPos.z + r * Math.sin(phi) * Math.sin(theta);

      const dir = Math.random() < 0.55 ? 1 : -1; // slight rightward bias
      flip[i] = dir;
      vel[i * 3 + 0] = (0.18 + Math.random() * 0.35) * dir;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.08;

      // Smaller and more variable than hero fish, so they read as
      // farther even when they happen to drift close.
      scale[i] = 0.35 + Math.random() * 0.55;
      opacity[i] = 0.55 + Math.random() * 0.45;
      phase[i] = Math.random() * Math.PI * 2;
    }

    return { pos, vel, scale, flip, opacity, phase };
  }, [count, worldRadius, verticalSpread, camera]);

  // Geometry + per-instance attribute buffers. Recreated when count
  // changes because InstancedBufferAttribute size is fixed.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute(
      'aFlip',
      new THREE.InstancedBufferAttribute(state.flip, 1),
    );
    g.setAttribute(
      'aOpacity',
      new THREE.InstancedBufferAttribute(state.opacity, 1),
    );
    g.setAttribute(
      'aPhase',
      new THREE.InstancedBufferAttribute(state.phase, 1),
    );
    return g;
    // We deliberately do not include `state` (it would dispose the
    // geometry on every regeneration, which we do want), but ESLint
    // wants the dep so keep it.
  }, [state]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uAspect: { value: aspect },
        uFogColor: { value: new THREE.Color(fogColor) },
        uFogNear: { value: fogNear },
        uFogFar: { value: fogFar },
        uOpacityMul: { value: distantFishOpacity },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // We update uniforms imperatively below; recreating the material
    // on every uniform change would thrash the GPU.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, aspect]);

  // Push leva-driven values into uniforms without rebuilding material.
  useEffect(() => {
    if (!material) return;
    material.uniforms.uOpacityMul.value = distantFishOpacity;
    material.uniforms.uFogColor.value.set(fogColor);
    material.uniforms.uFogNear.value = fogNear;
    material.uniforms.uFogFar.value = fogFar;
  }, [material, distantFishOpacity, fogColor, fogNear, fogFar]);

  // Initialise instanceMatrix once, mark dynamic so the per-frame
  // updates don't reallocate buffers.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tmp = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      tmp.position.set(
        state.pos[i * 3 + 0],
        state.pos[i * 3 + 1],
        state.pos[i * 3 + 2],
      );
      const s = state.scale[i];
      tmp.scale.set(s, s, 1);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, state]);

  // Shared scratch objects to avoid allocations in the hot loop.
  const scratch = useMemo(
    () => ({
      tmp: new THREE.Object3D(),
      cam: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((s, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = s.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    camera.getWorldPosition(scratch.cam);

    const dt = Math.min(delta, 0.05); // tab-switch safety
    const vRatio = verticalSpread / worldRadius;
    const radius = worldRadius * 1.08;
    const radiusSq = radius * radius;
    // Shared global drift -- a single sine evaluation broadcast to all
    // fish. Keeps the layer cheap while still adding a wave-like feel.
    const driftY = Math.sin(t * 0.45) * 0.04;
    const driftX = Math.cos(t * 0.32) * 0.06;

    for (let i = 0; i < count; i++) {
      const ix = i * 3;

      state.pos[ix + 0] +=
        (state.vel[ix + 0] + driftX) * dt * swimSpeed;
      state.pos[ix + 1] +=
        (state.vel[ix + 1] + driftY) * dt * swimSpeed;
      state.pos[ix + 2] += state.vel[ix + 2] * dt * swimSpeed;

      // Camera-relative wrap. Treat the volume as an ellipsoid so the
      // vertical extent (`verticalSpread`) can be smaller than the
      // horizontal radius without flattening the layer at the poles.
      const dx = state.pos[ix + 0] - scratch.cam.x;
      const dyW = (state.pos[ix + 1] - scratch.cam.y) / vRatio;
      const dz = state.pos[ix + 2] - scratch.cam.z;
      const distSq = dx * dx + dyW * dyW + dz * dz;

      if (distSq > radiusSq) {
        // Place on the opposite side of the camera, at ~75-95% of the
        // sphere radius, with a small lateral jitter so consecutive
        // wraps don't form a visible "incoming stream".
        const len = Math.sqrt(distSq);
        const nx = -dx / len;
        const ny = -dyW / len;
        const nz = -dz / len;
        const r = worldRadius * (0.72 + Math.random() * 0.22);
        state.pos[ix + 0] =
          scratch.cam.x + nx * r + (Math.random() - 0.5) * 0.6;
        state.pos[ix + 1] =
          scratch.cam.y + ny * r * vRatio + (Math.random() - 0.5) * 0.4;
        state.pos[ix + 2] =
          scratch.cam.z + nz * r + (Math.random() - 0.5) * 0.6;
      }

      scratch.tmp.position.set(
        state.pos[ix + 0],
        state.pos[ix + 1],
        state.pos[ix + 2],
      );
      const sc = state.scale[i];
      scratch.tmp.scale.set(sc, sc, 1);
      scratch.tmp.rotation.set(0, 0, 0);
      scratch.tmp.updateMatrix();
      mesh.setMatrixAt(i, scratch.tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
      // Decorative -- never block pointer events from the radio beacon
      // or other interactive props.
      raycast={() => null}
    />
  );
}

/**
 * Public component. Loads the salmon SVG (using the same `useTexture`
 * call as `SalmonSchool`, so the cache hit is free) and renders the
 * instanced mesh. If the count is zero or layers are disabled the
 * caller can simply not mount this component.
 */
export default function MidfieldSchool({
  count = 400,
  worldRadius = 18,
  verticalSpread = 12,
  swimSpeed = 0.6,
  distantFishOpacity = 0.55,
  fogColor = '#0e3850',
  fogNear = 4,
  fogFar = 28,
}) {
  const texture = useTexture('/fish/salmon.svg');

  // `useTexture` returns a configured Three texture; ensure
  // alpha/transparency handling is sane.
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  if (!count || count <= 0) return null;

  return (
    <MidfieldImpl
      count={count}
      worldRadius={worldRadius}
      verticalSpread={verticalSpread}
      swimSpeed={swimSpeed}
      distantFishOpacity={distantFishOpacity}
      fogColor={fogColor}
      fogNear={fogNear}
      fogFar={fogFar}
      texture={texture}
    />
  );
}
