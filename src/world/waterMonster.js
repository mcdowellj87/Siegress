import * as THREE from 'three';

const WATER_MONSTER_URL = './images/water_monster.png';
const FALLBACK_MAP_X = 1455;
const FALLBACK_MAP_Y = 828;
const SUBMERGED_FRACTION = 0.0;
const BACK_TILT = THREE.MathUtils.degToRad(-60);

export function findWaterMonsterSpawnMarker(data, mapW, mapH) {
  if (!data) return null;

  const mask = new Uint8Array(mapW * mapH);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    if (data[p] >= 240 && data[p + 1] <= 24 && data[p + 2] >= 240 && data[p + 3] >= 16) {
      mask[i] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;

    const queue = [start];
    seen[start] = 1;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = mapW;
    let minY = mapH;
    let maxX = 0;
    let maxY = 0;

    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      const x = i % mapW;
      const y = Math.floor(i / mapW);
      count++;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [i - 1, i + 1, i - mapW, i + mapW];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || !mask[next] || seen[next]) continue;
        const nx = next % mapW;
        const ny = Math.floor(next / mapW);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const fill = count / (width * height);
    const compact = width <= 64 && height <= 64 && fill >= 0.45;
    if (compact && count >= 9 && (!best || count > best.count)) {
      best = { x: sumX / count, y: sumY / count, minX, minY, maxX, maxY, count };
    }
  }

  return best;
}

export function createWaterMonsterSystem({ levelRoot, getMetrics, getPlayerPosition, playerHeight }) {
  const textureLoader = new THREE.TextureLoader();
  let texture = null;
  let monster = null;

  async function build(mapData) {
    if (monster) {
      monster.parent?.remove(monster);
      monster.geometry.dispose();
      monster.material.dispose();
      monster = null;
    }

    if (!texture) {
      texture = await textureLoader.loadAsync(WATER_MONSTER_URL);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }

    const { mapW, mapH, cell, halfW, halfH, seaLevel } = getMetrics();
    if (!mapW || !mapH) return;

    const aspect = texture.image.width / texture.image.height;
    const apparentHeight = playerHeight * 0.128;
    const displayHeight = apparentHeight / Math.cos(Math.abs(BACK_TILT));
    const displayWidth = apparentHeight * aspect;
    const geometry = new THREE.PlaneGeometry(displayWidth, displayHeight);
    geometry.translate(0, displayHeight * (0.5 - SUBMERGED_FRACTION), 0);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.04,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true
    });

    monster = new THREE.Mesh(geometry, material);
    const marker = findWaterMonsterSpawnMarker(mapData, mapW, mapH);
    const mapX = THREE.MathUtils.clamp(marker?.x ?? FALLBACK_MAP_X, 0, mapW - 1);
    const mapY = THREE.MathUtils.clamp(marker?.y ?? FALLBACK_MAP_Y, 0, mapH - 1);
    monster.position.set(
      mapX * cell - halfW + cell * 0.5,
      seaLevel + 0.05,
      mapY * cell - halfH + cell * 0.5
    );
    monster.renderOrder = 3;
    levelRoot.add(monster);
    update();
  }

  function update() {
    if (!monster) return;
    const player = getPlayerPosition();
    monster.lookAt(player.x, monster.position.y, player.z);
    monster.rotateX(BACK_TILT);
  }

  return { build, update };
}
