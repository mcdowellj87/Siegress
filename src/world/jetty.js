import * as THREE from 'three';

const JETTY_COLORS = [
  [206, 197, 0],
  [220, 206, 0],
  [239, 224, 0],
  [246, 231, 0],
  [255, 241, 19],
  [255, 242, 46],
  [255, 244, 72],
  [255, 247, 117]
];
const JETTY_COLOR_TOLERANCE = 18;
const JETTY_WATER_CLEARANCE = 0.8;
const JETTY_EMBED_DEPTH = 1.2;

export function jettyLevelForPixel(r, g, b, a = 255) {
  if (a < 16) return -1;
  let bestLevel = -1;
  let bestDistanceSq = Infinity;
  for (let level = 0; level < JETTY_COLORS.length; level++) {
    const color = JETTY_COLORS[level];
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    if (
      Math.abs(dr) > JETTY_COLOR_TOLERANCE ||
      Math.abs(dg) > JETTY_COLOR_TOLERANCE ||
      Math.abs(db) > JETTY_COLOR_TOLERANCE
    ) continue;
    const distanceSq = dr * dr + dg * dg + db * db;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestLevel = level;
    }
  }
  return bestLevel;
}

export function restoreWorldMapUnderJetty(data, baselineData, mapW, mapH, padding = 12) {
  if (!baselineData || baselineData.length !== data.length) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const p = (y * mapW + x) * 4;
      if (jettyLevelForPixel(data[p], data[p + 1], data[p + 2], data[p + 3]) < 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return false;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(mapW - 1, maxX + padding);
  maxY = Math.min(mapH - 1, maxY + padding);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = (y * mapW + x) * 4;
      data[p] = baselineData[p];
      data[p + 1] = baselineData[p + 1];
      data[p + 2] = baselineData[p + 2];
      data[p + 3] = baselineData[p + 3];
    }
  }
  return true;
}

export function createJettySystem({
  levelRoot,
  colliders,
  getMetrics,
  seawallHeight
}) {
  let jettyGroup = null;

  function clear() {
    if (!jettyGroup) return;
    levelRoot.remove(jettyGroup);
    jettyGroup.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    jettyGroup = null;
  }

  function buildFromBitmap(data) {
    clear();
    const { mapW, mapH, cell, halfW, halfH, seaLevel } = getMetrics();
    const stepHeight = (seawallHeight - JETTY_WATER_CLEARANCE) / (JETTY_COLORS.length - 1);
    const pixelsByLevel = Array.from({ length: JETTY_COLORS.length }, () => []);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const p = (y * mapW + x) * 4;
        const level = jettyLevelForPixel(data[p], data[p + 1], data[p + 2], data[p + 3]);
        if (level >= 0) pixelsByLevel[level].push({ x, y });
      }
    }
    if (!pixelsByLevel.some((pixels) => pixels.length)) return;

    const group = new THREE.Group();
    group.name = 'mushroom-entry-jetty';
    const colors = [
      0x5d5a52,
      0x6d685a,
      0x7d7662,
      0x8e856b,
      0xa19876,
      0xb4a880,
      0xc7b98a,
      0xdacb97
    ];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    for (let level = 0; level < pixelsByLevel.length; level++) {
      const pixels = pixelsByLevel[level];
      if (!pixels.length) continue;
      const topY = seaLevel + JETTY_WATER_CLEARANCE + level * stepHeight;
      const bottomY = seaLevel - JETTY_EMBED_DEPTH;
      const blockHeight = topY - bottomY;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({
        color: colors[level],
        roughness: 0.9,
        metalness: 0.0,
        emissive: colors[level],
        emissiveIntensity: 0.035
      });
      const mesh = new THREE.InstancedMesh(geometry, material, pixels.length);
      mesh.name = `jetty-level-${level}`;
      mesh.receiveShadow = true;

      for (let i = 0; i < pixels.length; i++) {
        const pixel = pixels[i];
        position.set(
          pixel.x * cell - halfW + cell * 0.5,
          bottomY + blockHeight * 0.5,
          pixel.y * cell - halfH + cell * 0.5
        );
        scale.set(cell * 1.04, blockHeight, cell * 1.04);
        matrix.compose(position, new THREE.Quaternion(), scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }

    for (let y = 0; y < mapH; y++) {
      let x = 0;
      while (x < mapW) {
        const p = (y * mapW + x) * 4;
        const level = jettyLevelForPixel(data[p], data[p + 1], data[p + 2], data[p + 3]);
        if (level < 0) {
          x++;
          continue;
        }
        const startX = x;
        x++;
        while (x < mapW) {
          const nextP = (y * mapW + x) * 4;
          if (jettyLevelForPixel(data[nextP], data[nextP + 1], data[nextP + 2], data[nextP + 3]) !== level) break;
          x++;
        }
        const topY = seaLevel + JETTY_WATER_CLEARANCE + level * stepHeight;
        colliders.push({
          type: 'platform',
          min: new THREE.Vector3(startX * cell - halfW, seaLevel - JETTY_EMBED_DEPTH, y * cell - halfH),
          max: new THREE.Vector3(x * cell - halfW, topY, (y + 1) * cell - halfH),
          tag: 'jetty-step'
        });
      }
    }

    jettyGroup = group;
    levelRoot.add(group);
  }

  return { buildFromBitmap, clear };
}
