import * as THREE from 'three';

export const OLD_ROOT_SITE_X = 770;
export const OLD_ROOT_SITE_Z = 790;
export const TEMP_SPAWN_ON_OLD_ROOT_ISLAND = true;

const OLD_ROOT_SITE_URL = './images/old_root_site.png';
const OLD_ROOT_SITE_FACADE_Z = -104;
const OLD_ROOT_WALL_SAMPLE_STEP = 2;
const OLD_ROOT_WALL_INLIER_DIST = 4.75;
const OLD_ROOT_WALL_MIN_PIXELS = 80;
const OLD_ROOT_WALL_MIN_LENGTH = 48;
const OLD_ROOT_SITE_OFFSET_X = -14;
const OLD_ROOT_SITE_OFFSET_Z = -14;

async function makeOldRootSiteTexture() {
  const img = new Image();
  img.src = OLD_ROOT_SITE_URL + '?v=' + Date.now();
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 8 && g < 8 && b < 8) data[i + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeOldRootPanelMaterial(baseTexture, xOffset) {
  const tex = baseTexture.clone();
  tex.repeat.set(1 / 3, 0.68);
  tex.offset.set(xOffset, 0.0);
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    fog: true
  });
}

function isOldRootWallPixel(r, g, b, a) {
  if (a < 16) return false;
  return r >= 180 && g <= 80 && b >= 140;
}

function collectOldRootWallPointsFromBitmap(data, metrics) {
  const { mapW, mapH, cell, halfW, halfH } = metrics;
  const idx = (x, y) => y * mapW + x;
  const mapPixelToWorld2 = (x, y) => new THREE.Vector2(x * cell - halfW + cell * 0.5, y * cell - halfH + cell * 0.5);
  const points = [];

  for (let y = 0; y < mapH; y += OLD_ROOT_WALL_SAMPLE_STEP) {
    for (let x = 0; x < mapW; x += OLD_ROOT_WALL_SAMPLE_STEP) {
      const p = idx(x, y) * 4;
      if (!isOldRootWallPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) continue;
      const world = mapPixelToWorld2(x, y);
      points.push({ x: world.x, z: world.y });
    }
  }
  return points;
}

function fitOldRootWallSegments(points) {
  const segments = [];
  let remaining = points.slice();
  let seed = 0x51e67755;
  const rand = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let pass = 0; pass < 3 && remaining.length >= OLD_ROOT_WALL_MIN_PIXELS; pass++) {
    let best = null;
    const iterations = Math.min(1200, Math.max(260, remaining.length * 2));

    for (let n = 0; n < iterations; n++) {
      const a = remaining[(rand() * remaining.length) | 0];
      const b = remaining[(rand() * remaining.length) | 0];
      if (!a || !b || a === b) continue;

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < OLD_ROOT_WALL_MIN_LENGTH) continue;

      const ux = dx / len;
      const uz = dz / len;
      const inliers = [];
      let minT = Infinity;
      let maxT = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        const rx = p.x - a.x;
        const rz = p.z - a.z;
        const dist = Math.abs(rx * uz - rz * ux);
        if (dist > OLD_ROOT_WALL_INLIER_DIST) continue;
        const t = rx * ux + rz * uz;
        inliers.push(i);
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
      }

      const span = maxT - minT;
      if (inliers.length < OLD_ROOT_WALL_MIN_PIXELS || span < OLD_ROOT_WALL_MIN_LENGTH) continue;
      const score = inliers.length * span;
      if (!best || score > best.score) best = { score, a, ux, uz, inliers, minT, maxT, span };
    }

    if (!best) break;

    const p1 = new THREE.Vector2(best.a.x + best.ux * best.minT, best.a.z + best.uz * best.minT);
    const p2 = new THREE.Vector2(best.a.x + best.ux * best.maxT, best.a.z + best.uz * best.maxT);
    segments.push({
      a: p1,
      b: p2,
      center: p1.clone().add(p2).multiplyScalar(0.5),
      length: best.span,
      yaw: Math.atan2(-(p2.y - p1.y), p2.x - p1.x)
    });

    const inlierSet = new Set(best.inliers);
    remaining = remaining.filter((_, i) => !inlierSet.has(i));
  }

  return segments;
}

function findOldRootWallLayout(data, metrics) {
  if (!data) return null;
  const points = collectOldRootWallPointsFromBitmap(data, metrics);
  if (points.length < OLD_ROOT_WALL_MIN_PIXELS) return null;

  const segments = fitOldRootWallSegments(points);
  if (segments.length < 3) return null;

  const centroid = points.reduce((acc, p) => {
    acc.x += p.x;
    acc.y += p.z;
    return acc;
  }, new THREE.Vector2()).multiplyScalar(1 / points.length);

  let middle = segments[0];
  let middleDist = Infinity;
  for (const segment of segments) {
    const d = segment.center.distanceToSquared(centroid);
    if (d < middleDist) {
      middle = segment;
      middleDist = d;
    }
  }

  const sides = segments.filter(segment => segment !== middle);
  const middleDir = middle.b.clone().sub(middle.a).normalize();
  sides.sort((a, b) => {
    const av = a.center.clone().sub(middle.center);
    const bv = b.center.clone().sub(middle.center);
    const ac = middleDir.x * av.y - middleDir.y * av.x;
    const bc = middleDir.x * bv.y - middleDir.y * bv.x;
    return ac - bc;
  });

  const all = [middle, ...sides];
  const reserveCenter = all.reduce((acc, segment) => acc.add(segment.center), new THREE.Vector2()).multiplyScalar(1 / all.length);
  const reserveRadius = Math.max(180, ...all.map(segment => segment.center.distanceTo(reserveCenter) + segment.length * 0.6));
  return { middle, left: sides[0], right: sides[1], reserveCenter, reserveRadius };
}

export function createOldRootSiteSystem({ levelRoot, getMetrics, hasHeights }) {
  let oldRootSiteGroup = null;
  let oldRootSiteReserve = { x: OLD_ROOT_SITE_X, z: OLD_ROOT_SITE_Z, r: 180 };

  function clear() {
    if (!oldRootSiteGroup) return;
    levelRoot.remove(oldRootSiteGroup);
    oldRootSiteGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    oldRootSiteGroup = null;
  }

  async function build(dataOriginal) {
    clear();
    if (!hasHeights()) return;

    const metrics = getMetrics();
    const wallHeight = 210;
    const group = new THREE.Group();
    group.position.set(OLD_ROOT_SITE_OFFSET_X, 0, OLD_ROOT_SITE_OFFSET_Z);

    const texture = await makeOldRootSiteTexture();
    const middleMat = makeOldRootPanelMaterial(texture, 1 / 3);
    const leftMat = makeOldRootPanelMaterial(texture, 2 / 3);
    const rightMat = makeOldRootPanelMaterial(texture, 0);
    const layout = findOldRootWallLayout(dataOriginal, metrics);

    function addWall(name, segment, height, mat, flipX = false) {
      const width = Math.max(OLD_ROOT_WALL_MIN_LENGTH, segment.length);
      const artGeo = new THREE.PlaneGeometry(width * 1.01, height * 1.01, 1, 1);
      const art = new THREE.Mesh(artGeo, mat);
      art.name = name;
      art.position.set(segment.center.x, metrics.seaLevel + height * 0.505, segment.center.y);
      art.rotation.y = segment.yaw;
      if (flipX) art.scale.x = -1;
      art.renderOrder = 2;
      group.add(art);
      return art;
    }

    const fallbackLayout = {
      middle: {
        center: new THREE.Vector2(OLD_ROOT_SITE_X, OLD_ROOT_SITE_Z + OLD_ROOT_SITE_FACADE_Z),
        length: 168,
        yaw: Math.PI
      },
      left: {
        center: new THREE.Vector2(OLD_ROOT_SITE_X - 110, OLD_ROOT_SITE_Z - 70),
        length: 138,
        yaw: Math.PI * 0.74
      },
      right: {
        center: new THREE.Vector2(OLD_ROOT_SITE_X + 110, OLD_ROOT_SITE_Z - 70),
        length: 138,
        yaw: -Math.PI * 0.74
      },
      reserveCenter: new THREE.Vector2(OLD_ROOT_SITE_X, OLD_ROOT_SITE_Z),
      reserveRadius: 180
    };
    const wallLayout = layout || fallbackLayout;

    addWall('old-root-middle-wall', wallLayout.middle, wallHeight, middleMat);
    addWall('old-root-left-wall', wallLayout.left, wallHeight * 0.92, leftMat, true);
    addWall('old-root-right-wall', wallLayout.right, wallHeight * 0.92, rightMat);
    oldRootSiteReserve = {
      x: wallLayout.reserveCenter.x + OLD_ROOT_SITE_OFFSET_X,
      z: wallLayout.reserveCenter.y + OLD_ROOT_SITE_OFFSET_Z,
      r: wallLayout.reserveRadius
    };

    const floorGeo = new THREE.CircleGeometry(108, 24, 0.08 * Math.PI, 0.84 * Math.PI);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x3f424b,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'old-root-cut-floor';
    const middleNormal = new THREE.Vector2(Math.sin(wallLayout.middle.yaw), Math.cos(wallLayout.middle.yaw));
    floor.position.set(
      wallLayout.middle.center.x + middleNormal.x * 42,
      metrics.seaLevel + 0.18,
      wallLayout.middle.center.y + middleNormal.y * 42
    );
    floor.rotation.y = wallLayout.middle.yaw;
    floor.renderOrder = 1;
    group.add(floor);

    oldRootSiteGroup = group;
    levelRoot.add(oldRootSiteGroup);
  }

  function isInsideReserve(wx, wz) {
    const dx = wx - oldRootSiteReserve.x;
    const dz = wz - oldRootSiteReserve.z;
    return dx * dx + dz * dz < oldRootSiteReserve.r * oldRootSiteReserve.r;
  }

  return { build, clear, isInsideReserve };
}
