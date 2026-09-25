import * as THREE from 'three';

const MOUND_RADIAL_SEGMENTS = 16;
const MOUND_ANGULAR_SEGMENTS = 64;

function isMoundPixel(r, g, b, a) {
  return a >= 16 && r === 0xff && g === 0x3a && b === 0x8a;
}

function moundLift(height, radialSq) {
  return height * Math.sqrt(Math.max(0, 1 - radialSq));
}

function buildTerrainConformingGeometry(mound, heightAtWorldRaw) {
  const positions = [];
  const indices = [];
  const { centerX, centerZ, radiusX, radiusZ, height } = mound;

  positions.push(centerX, heightAtWorldRaw(centerX, centerZ) + height, centerZ);

  for (let ring = 1; ring <= MOUND_RADIAL_SEGMENTS; ring++) {
    const radial = ring / MOUND_RADIAL_SEGMENTS;
    const lift = moundLift(height, radial * radial);
    for (let segment = 0; segment < MOUND_ANGULAR_SEGMENTS; segment++) {
      const angle = (segment / MOUND_ANGULAR_SEGMENTS) * Math.PI * 2;
      const wx = centerX + Math.cos(angle) * radiusX * radial;
      const wz = centerZ + Math.sin(angle) * radiusZ * radial;
      positions.push(wx, heightAtWorldRaw(wx, wz) + lift, wz);
    }
  }

  for (let segment = 0; segment < MOUND_ANGULAR_SEGMENTS; segment++) {
    const current = 1 + segment;
    const next = 1 + ((segment + 1) % MOUND_ANGULAR_SEGMENTS);
    indices.push(0, next, current);
  }

  for (let ring = 2; ring <= MOUND_RADIAL_SEGMENTS; ring++) {
    const previousStart = 1 + (ring - 2) * MOUND_ANGULAR_SEGMENTS;
    const currentStart = 1 + (ring - 1) * MOUND_ANGULAR_SEGMENTS;
    for (let segment = 0; segment < MOUND_ANGULAR_SEGMENTS; segment++) {
      const nextSegment = (segment + 1) % MOUND_ANGULAR_SEGMENTS;
      const a = previousStart + segment;
      const b = previousStart + nextSegment;
      const c = currentStart + segment;
      const d = currentStart + nextSegment;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createMoundSystem({
  levelRoot,
  getMetrics,
  heightAtWorldRaw,
  moundHeight,
  gradientMap
}) {
  let moundMesh = null;
  let mound = null;

  function clear() {
    if (moundMesh) {
      levelRoot.remove(moundMesh);
      moundMesh.geometry.dispose();
      moundMesh.material.dispose();
    }
    moundMesh = null;
    mound = null;
  }

  function buildFromBitmap(data) {
    clear();
    const { mapW, mapH, cell, halfW, halfH } = getMetrics();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let pixelCount = 0;

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const p = (y * mapW + x) * 4;
        if (!isMoundPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixelCount++;
      }
    }
    if (!pixelCount) return;

    const centerX = ((minX + maxX + 1) * 0.5) * cell - halfW;
    const centerZ = ((minY + maxY + 1) * 0.5) * cell - halfH;
    const radiusX = Math.max(cell, (maxX - minX + 1) * cell * 0.5);
    const radiusZ = Math.max(cell, (maxY - minY + 1) * cell * 0.5);
    const baseY = heightAtWorldRaw(centerX, centerZ);

    mound = { centerX, centerZ, radiusX, radiusZ, baseY, height: moundHeight, pixelCount };

    const geometry = buildTerrainConformingGeometry(mound, heightAtWorldRaw);
    const material = new THREE.MeshToonMaterial({
      color: 0x3f8b68,
      emissive: 0x051813,
      emissiveIntensity: 0.24,
      gradientMap,
      fog: true
    });
    moundMesh = new THREE.Mesh(geometry, material);
    moundMesh.name = 'map-mound';
    moundMesh.receiveShadow = true;
    moundMesh.castShadow = false;
    moundMesh.renderOrder = 2;
    levelRoot.add(moundMesh);

  }

  function surfaceHeightAtWorld(wx, wz) {
    if (!mound) return -Infinity;
    const nx = (wx - mound.centerX) / mound.radiusX;
    const nz = (wz - mound.centerZ) / mound.radiusZ;
    const radialSq = nx * nx + nz * nz;
    if (radialSq >= 1) return -Infinity;
    return heightAtWorldRaw(wx, wz) + moundLift(mound.height, radialSq);
  }

  return {
    buildFromBitmap,
    clear,
    surfaceHeightAtWorld,
    get state() {
      return mound ? { ...mound } : null;
    }
  };
}
