import * as THREE from 'three';

const SEAWALL_THICKNESS = 8.0;
const SEAWALL_EMBED_DEPTH = 16.0;
const SEAWALL_COLLIDER_BUFFER = 1.5;
const SEAWALL_POINT_SPACING = 20.0;
const SEAWALL_TRACE_MAX_GAP_PX = 12;
const SEAWALL_SEGMENT_OVERLAP = SEAWALL_THICKNESS * 1.25;
const SEAWALL_MIN_PATH_PIXELS = 80;
const SEAWALL_MIN_EXTENT_PX = 120;

export function calculateSeawallHeight(playerCapsuleH, playerRadius) {
  return (playerCapsuleH + playerRadius * 2.0) * 0.443;
}

function isSeawallPathPixel(r, g, b, a) {
  if (a < 16) return false;
  return r >= 190 && g <= 135 && b <= 135 && r >= g + 60 && r >= b + 60;
}

function collectSeawallPathsFromBitmap(data, metrics) {
  const { mapW, mapH, cell, halfW, halfH } = metrics;
  const idx = (x, y) => y * mapW + x;
  const mask = new Uint8Array(mapW * mapH);
  const redIndices = [];

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const i = idx(x, y);
      const p = i * 4;
      if (isSeawallPathPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) {
        mask[i] = 1;
        redIndices.push(i);
      }
    }
  }

  const seen = new Uint8Array(mapW * mapH);
  const paths = [];
  const stack = [];

  function addComponent(startI) {
    stack.length = 0;
    stack.push(startI);
    seen[startI] = 1;

    const points = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    while (stack.length) {
      const i = stack.pop();
      const x = i % mapW;
      const y = (i / mapW) | 0;
      points.push({ x, y });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;
          const ni = idx(nx, ny);
          if (!mask[ni] || seen[ni]) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }

    const extent = Math.max(maxX - minX, maxY - minY);
    if (points.length < SEAWALL_MIN_PATH_PIXELS || extent < SEAWALL_MIN_EXTENT_PX) return;

    const remaining = new Set(points.map(p => idx(p.x, p.y)));
    while (remaining.size) {
      let startI = null;
      let startX = Infinity;
      let startY = Infinity;
      for (const i of remaining) {
        const x = i % mapW;
        const y = (i / mapW) | 0;
        if (y < startY || (y === startY && x < startX)) {
          startI = i;
          startX = x;
          startY = y;
        }
      }
      if (startI === null) break;

      const ordered = [];
      let cur = { x: startX, y: startY };
      while (remaining.size) {
        ordered.push(cur);
        remaining.delete(idx(cur.x, cur.y));

        let best = null;
        let bestD2 = Infinity;
        for (const ni of remaining) {
          const nx = ni % mapW;
          const ny = (ni / mapW) | 0;
          const dx = nx - cur.x;
          const dy = ny - cur.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = { x: nx, y: ny };
          }
        }
        if (!best || bestD2 > SEAWALL_TRACE_MAX_GAP_PX * SEAWALL_TRACE_MAX_GAP_PX) break;
        cur = best;
      }

      const sampled = [];
      const toWorldPoint = (p) => new THREE.Vector2(
        p.x * cell - halfW + cell * 0.5,
        p.y * cell - halfH + cell * 0.5
      );

      if (ordered.length) sampled.push(toWorldPoint(ordered[0]));
      let carry = 0;
      let prev = ordered.length ? toWorldPoint(ordered[0]) : null;

      for (let i = 1; i < ordered.length; i++) {
        const next = toWorldPoint(ordered[i]);
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
          prev = next;
          continue;
        }

        let traveled = 0;
        while (carry + (dist - traveled) >= SEAWALL_POINT_SPACING) {
          const need = SEAWALL_POINT_SPACING - carry;
          traveled += need;
          const t = traveled / dist;
          sampled.push(new THREE.Vector2(
            THREE.MathUtils.lerp(prev.x, next.x, t),
            THREE.MathUtils.lerp(prev.y, next.y, t)
          ));
          carry = 0;
        }

        carry += dist - traveled;
        prev = next;
      }

      if (ordered.length > 1) {
        const last = toWorldPoint(ordered[ordered.length - 1]);
        const tail = sampled[sampled.length - 1];
        if (!tail || tail.distanceTo(last) > 0.5) sampled.push(last);
      }
      if (sampled.length > 1) paths.push(sampled);
    }
  }

  for (const i of redIndices) {
    if (!seen[i]) addComponent(i);
  }
  return paths;
}

export function createSeawallSystem({
  levelRoot,
  colliders,
  getMetrics,
  heightAtWorldRaw,
  seawallHeight,
  playerCapsuleH,
  playerRadius
}) {
  let seawallGroup = null;
  const resolvedSeawallHeight = seawallHeight ?? calculateSeawallHeight(playerCapsuleH, playerRadius);

  function clear() {
    if (!seawallGroup) return;
    levelRoot.remove(seawallGroup);
    seawallGroup.traverse(obj => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
    seawallGroup = null;
  }

  function buildFromBitmap(data) {
    clear();
    const metrics = getMetrics();
    const paths = collectSeawallPathsFromBitmap(data, metrics);
    if (!paths.length) return;

    let segmentCount = 0;
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.5) segmentCount++;
      }
    }
    if (!segmentCount) return;

    const group = new THREE.Group();
    group.name = 'seawall';
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x17131a,
      roughness: 0.96,
      metalness: 0.0,
      emissive: 0x08050b,
      emissiveIntensity: 0.25
    });
    const mesh = new THREE.InstancedMesh(geo, mat, segmentCount);
    mesh.name = 'seawall-segments';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    group.add(mesh);

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let segmentIndex = 0;

    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const dx = b.x - a.x;
        const dz = b.y - a.y;
        const len = Math.hypot(dx, dz);
        if (len < 0.5) continue;

        const mx = (a.x + b.x) * 0.5;
        const mz = (a.y + b.y) * 0.5;
        const baseYA = Math.max(metrics.seaLevel, heightAtWorldRaw(a.x, a.y));
        const baseYB = Math.max(metrics.seaLevel, heightAtWorldRaw(b.x, b.y));
        const topYA = baseYA + resolvedSeawallHeight;
        const topYB = baseYB + resolvedSeawallHeight;

        const wallHeight = resolvedSeawallHeight + SEAWALL_EMBED_DEPTH;

        p.set(
          mx,
          ((baseYA + baseYB) * 0.5) + (resolvedSeawallHeight * 0.5) - (SEAWALL_EMBED_DEPTH * 0.5),
          mz
        );
        const sideX = dz / len;
        const sideZ = -dx / len;
        const overlapScale = (len + SEAWALL_SEGMENT_OVERLAP) / len;
        m.set(
          sideX * SEAWALL_THICKNESS, 0, dx * overlapScale, p.x,
          0, wallHeight, (baseYB - baseYA) * overlapScale, p.y,
          sideZ * SEAWALL_THICKNESS, 0, dz * overlapScale, p.z,
          0, 0, 0, 1
        );
        mesh.setMatrixAt(segmentIndex++, m);

        colliders.push({
          type: 'wall-seg',
          a: new THREE.Vector3(a.x, baseYA, a.y),
          b: new THREE.Vector3(b.x, baseYB, b.y),
          halfWidth: SEAWALL_THICKNESS * 0.5,
          buffer: SEAWALL_COLLIDER_BUFFER,
          minY: Math.min(baseYA, baseYB) - SEAWALL_EMBED_DEPTH,
          maxY: Math.max(topYA, topYB),
          topYA,
          topYB,
          tag: 'seawall'
        });
      }
    }
    mesh.instanceMatrix.needsUpdate = true;

    seawallGroup = group;
    levelRoot.add(seawallGroup);
  }

  return { buildFromBitmap, clear };
}
