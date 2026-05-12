import * as THREE from 'three';

function meshLooksLikeHeadlightPart(obj) {
  const n = (obj.name || '').toLowerCase();
  return (
    n.includes('headlight') ||
    n.includes('head_lamp') ||
    n.includes('headlamp') ||
    n.includes('fari') ||
    (n.includes('lamp') && (n.includes('front') || n.includes('head'))) ||
    (n.includes('light') && n.includes('front'))
  );
}

/**
 * Shared material pass for submerged Swamp Molly GLB props — murk, no showroom sheen.
 */
export function dimSwampMaterials(root, fogMurk) {
  const headlightMurk = new THREE.Color('#2a2418');

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geom = obj.geometry;
    if (geom && !geom.boundingBox) geom.computeBoundingBox();

    const mats = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    const nextMats = mats.map((mat) => {
      if (!mat) return mat;

      const emissive = mat.emissive;
      const emInt =
        mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : 0;
      const hasEmissiveGlow =
        emissive && emissive.getHex() > 0x020202 && emInt > 0.02;
      const tx =
        'transmission' in mat && mat.transmission !== undefined
          ? mat.transmission
          : 0;
      const isLitGlass =
        tx > 0 ||
        (mat.transparent && mat.opacity < 0.95 && !hasEmissiveGlow);

      if (emissive && emissive.getHex() > 0x020202 && emInt > 0.02) {
        const m = mat.clone();
        m.fog = true;
        const hlMesh = meshLooksLikeHeadlightPart(obj);
        if (hlMesh) {
          /** Keep GLB lamp glass nearly dark at distance — real glow is `SubmergedHeadlights`. */
          m.emissiveIntensity = Math.min(0.045, emInt * 0.08 + 0.012);
          m.emissive.multiplyScalar(0.35).lerp(fogMurk, 0.72);
          if (m.color) m.color.lerp(fogMurk, 0.55);
        } else {
          m.emissiveIntensity = Math.min(0.35, emInt * 0.12);
          m.emissive.multiplyScalar(0.35).lerp(fogMurk, 0.58);
          if (m.color) m.color.multiplyScalar(0.32);
        }
        m.toneMapped = true;
        m.needsUpdate = true;
        return m;
      }

      if (mat.isMeshPhysicalMaterial || mat.isMeshStandardMaterial) {
        const m = mat.clone();
        m.fog = true;
        if (meshLooksLikeHeadlightPart(obj)) {
          /** Sealed-beam glass: minimal surface glow; cones carry the read. */
          m.envMapIntensity = 0;
          if (!m.emissive) m.emissive = new THREE.Color(0);
          m.emissive.copy(fogMurk).lerp(new THREE.Color('#2a2618'), 0.4);
          m.emissiveIntensity = Math.min(0.055, (m.emissiveIntensity ?? 0) * 0.08 + 0.02);
          m.roughness = Math.min(1, (m.roughness ?? 0.5) + 0.22);
          m.metalness = Math.min(0.04, m.metalness ?? 0);
          if (m.color) m.color.lerp(fogMurk, 0.72);
          if ('transmission' in m) m.transmission = Math.min(m.transmission, 0.06);
          m.needsUpdate = true;
          return m;
        }
        m.envMapIntensity = 0;
        m.roughness = Math.min(
          1,
          (m.roughness ?? 0.65) + 0.28,
        );
        m.metalness = Math.min(0.22, (m.metalness ?? 0) * 0.35);
        if ('clearcoat' in m) m.clearcoat = 0;
        if ('sheen' in m) m.sheen = 0;
        if ('transmission' in m) m.transmission = Math.min(m.transmission, 0.06);
        if ('ior' in m) m.ior = 1.2;
        if (m.color) m.color.multiplyScalar(0.4).lerp(headlightMurk, 0.08);
        m.needsUpdate = true;
        return m;
      }

      if (mat.isMeshLambertMaterial || mat.isMeshPhongMaterial) {
        const m = mat.clone();
        m.fog = true;
        if (m.color) m.color.multiplyScalar(0.38);
        if ('shininess' in m) m.shininess = Math.min(m.shininess ?? 12, 8);
        if ('specular' in m && m.specular?.multiplyScalar)
          m.specular.multiplyScalar(0.12);
        m.needsUpdate = true;
        return m;
      }

      if (mat.isMeshBasicMaterial) {
        const m = mat.clone();
        m.fog = true;
        if (m.color) m.color.multiplyScalar(0.42);
        if (m.map) m.map = m.map;
        m.needsUpdate = true;
        return m;
      }

      if (isLitGlass) {
        const m = mat.clone();
        m.fog = true;
        m.opacity = Math.min(0.22, (m.opacity ?? 0.5) * 0.45);
        m.transparent = true;
        if ('roughness' in m) m.roughness = 1;
        if ('metalness' in m) m.metalness = 0;
        if ('envMapIntensity' in m) m.envMapIntensity = 0;
        m.needsUpdate = true;
        return m;
      }

      return mat;
    });

    obj.material = Array.isArray(obj.material) ? nextMats : nextMats[0];
  });
}

/** Head lamp centers in root local space (after scale + sink). */
export function collectHeadlightAnchors(root) {
  root.updateWorldMatrix(true, true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const anchors = [];
  const _w = new THREE.Vector3();
  const _size = new THREE.Vector3();
  const rootBox = new THREE.Box3().setFromObject(root);
  const rootSize = rootBox.getSize(_size);
  const rootDiag = Math.max(0.001, rootSize.length());

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    let isLamp = meshLooksLikeHeadlightPart(obj);
    if (!isLamp) {
      for (const mat of mats) {
        if (!mat || !mat.emissive) continue;
        const emInt =
          mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : 0;
        if (mat.emissive.getHex() > 0x030303 && emInt > 0.008) {
          isLamp = true;
          break;
        }
      }
    }
    if (!isLamp) return;

    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const meshSize = new THREE.Vector3();
    obj.geometry.boundingBox.getSize(meshSize);
    /** Drop full-body meshes mis-tagged as lamps (huge AABB vs car shell). */
    if (meshSize.length() > rootDiag * 0.42) return;

    obj.geometry.boundingBox.getCenter(_w);
    _w.applyMatrix4(obj.matrixWorld);
    _w.applyMatrix4(invRoot);

    anchors.push(_w.clone());
  });

  anchors.sort((a, b) => a.x - b.x);

  if (anchors.length === 0) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const span = Math.max(0.35, size.x * 0.22);
    anchors.push(
      new THREE.Vector3(c.x - span, c.y + size.y * 0.02, box.max.z - size.z * 0.06),
      new THREE.Vector3(c.x + span, c.y + size.y * 0.02, box.max.z - size.z * 0.06),
    );
  } else if (anchors.length === 1) {
    const a = anchors[0];
    anchors.push(new THREE.Vector3(a.x - 0.75, a.y, a.z));
  }

  return anchors.slice(0, 2);
}
