import * as THREE from 'three';

export function createColliderSystem({
  getPlayerCapsuleConfig,
  getTreeTrunkColliderBuffer,
  getWorldBounds,
  getSeaLevel,
  heightAtWorld
}) {
  const colliders = [];

  /* =========================
     COLLIDERS + SPATIAL HASH
  ========================= */
  const COLL_CELL = 28.0;
  const grid = new Map();

  function key3(ix, iy, iz) { return `${ix},${iy},${iz}`; }

  function aabbForCapsule(a, b, r) {
    return {
      min: new THREE.Vector3(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r),
      max: new THREE.Vector3(Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r)
    };
  }
  function gridInsert(id, min, max) {
    const x0 = Math.floor(min.x / COLL_CELL), x1 = Math.floor(max.x / COLL_CELL);
    const y0 = Math.floor(min.y / COLL_CELL), xY = Math.floor(max.y / COLL_CELL);
    const z0 = Math.floor(min.z / COLL_CELL), z1 = Math.floor(max.z / COLL_CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= xY; y++) {
        for (let z = z0; z <= z1; z++) {
          const k = key3(x, y, z);
          let arr = grid.get(k);
          if (!arr) { arr = []; grid.set(k, arr); }
          arr.push(id);
        }
      }
    }
  }
  function rebuildColliderGrid() {
    grid.clear();
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.type === 'cap') {
        const { min, max } = aabbForCapsule(c.a, c.b, c.r);
        gridInsert(i, min, max);
      } else if (c.type === 'wall-seg') {
        gridInsert(
          i,
          new THREE.Vector3(
            Math.min(c.a.x, c.b.x) - c.halfWidth,
            c.minY,
            Math.min(c.a.z, c.b.z) - c.halfWidth
          ),
          new THREE.Vector3(
            Math.max(c.a.x, c.b.x) + c.halfWidth,
            c.maxY,
            Math.max(c.a.z, c.b.z) + c.halfWidth
          )
        );
      } else if (c.type === 'mushroom-cap') {
        gridInsert(
          i,
          new THREE.Vector3(c.center.x - c.radius, c.center.y, c.center.z - c.radius),
          new THREE.Vector3(c.center.x + c.radius, c.center.y + c.height, c.center.z + c.radius)
        );
      } else {
        gridInsert(i, c.min, c.max);
      }
    }
  }
  function queryNearby(min, max) {
    const out = new Set();
    const x0 = Math.floor(min.x / COLL_CELL), x1 = Math.floor(max.x / COLL_CELL);
    const y0 = Math.floor(min.y / COLL_CELL), y1 = Math.floor(max.y / COLL_CELL);
    const z0 = Math.floor(min.z / COLL_CELL), z1 = Math.floor(max.z / COLL_CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const arr = grid.get(key3(x, y, z));
          if (!arr) continue;
          for (const id of arr) out.add(id);
        }
      }
    }
    return out;
  }

  /* Player capsule */
  const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
  function getPlayerCapsule(pos) {
    const { playerEyeHeight, playerRadius, playerCapsuleH } = getPlayerCapsuleConfig();
    const footY = pos.y - playerEyeHeight;
    _pa.set(pos.x, footY + playerRadius, pos.z);
    _pb.set(pos.x, footY + playerRadius + playerCapsuleH, pos.z);
    return { a: _pa, b: _pb, r: playerRadius };
  }

  /* Hot-loop scratch */
  const _tmp1 = new THREE.Vector3();
  const _tmp2 = new THREE.Vector3();
  const _tmp3 = new THREE.Vector3();
  const _cpA = new THREE.Vector3();
  const _cpB = new THREE.Vector3();
  const _nrm = new THREE.Vector3();

  function closestPtsSegSeg(a0, a1, b0, b1, outA, outB) {
    const d1 = _tmp1.subVectors(a1, a0);
    const d2 = _tmp2.subVectors(b1, b0);
    const r = _tmp3.subVectors(a0, b0);
    const a = d1.dot(d1);
    const e = d2.dot(d2);
    const f = d2.dot(r);

    let s, t;
    if (a <= 1e-8 && e <= 1e-8) { outA.copy(a0); outB.copy(b0); return; }
    if (a <= 1e-8) {
      s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1);
    } else {
      const c = d1.dot(r);
      if (e <= 1e-8) {
        t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else {
        const b = d1.dot(d2);
        const denom = a * e - b * b;
        s = (denom !== 0) ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
      }
    }
    outA.copy(a0).addScaledVector(d1, s);
    outB.copy(b0).addScaledVector(d2, t);
  }

  let lastSupportTag = '';

  function resolvePlayerCollisions(
    pos,
    previousPlayerY = pos.y,
    previousPlayerX = pos.x,
    previousPlayerZ = pos.z
  ) {
    const { playerEyeHeight, playerRadius } = getPlayerCapsuleConfig();
    const treeTrunkColliderBuffer = getTreeTrunkColliderBuffer();
    lastSupportTag = '';   // reset each call
    const cap = getPlayerCapsule(pos);
    const { min, max } = aabbForCapsule(cap.a, cap.b, cap.r);
    const ids = queryNearby(min, max);

    let supported = false;
    let risingFromWallTop = false;

    if (pos.y > previousPlayerY + 1e-4) {
      const previousFootY = previousPlayerY - playerEyeHeight;
      for (const id of ids) {
        const c = colliders[id];
        if (c.type !== 'wall-seg') continue;

        const vx = c.b.x - c.a.x;
        const vz = c.b.z - c.a.z;
        const len2 = vx * vx + vz * vz;
        const t = len2 > 1e-8
          ? THREE.MathUtils.clamp(((previousPlayerX - c.a.x) * vx + (previousPlayerZ - c.a.z) * vz) / len2, 0, 1)
          : 0;
        const cx = c.a.x + vx * t;
        const cz = c.a.z + vz * t;
        const dx = previousPlayerX - cx;
        const dz = previousPlayerZ - cz;
        const topY = THREE.MathUtils.lerp(c.topYA ?? c.maxY, c.topYB ?? c.maxY, t);
        if (dx * dx + dz * dz <= c.halfWidth * c.halfWidth && Math.abs(previousFootY - topY) <= 2.0) {
          risingFromWallTop = true;
          break;
        }
      }
    }

    for (const id of ids) {
      const c = colliders[id];

      if (c.type === 'cap') {
        closestPtsSegSeg(cap.a, cap.b, c.a, c.b, _cpA, _cpB);
        _nrm.subVectors(_cpA, _cpB);
        const d2 = _nrm.lengthSq();
        const rr = c.r + (c.tag === 'tree-trunk' ? treeTrunkColliderBuffer : cap.r);
        if (d2 >= rr * rr || d2 < 1e-10) continue;

        const d = Math.sqrt(d2);
        _nrm.multiplyScalar(1.0 / d);
        const pen = rr - d;

        pos.addScaledVector(_nrm, pen);
        if (_nrm.y > 0.55) {
          supported = true;
          lastSupportTag = c.tag || '';
        }

      } else if (c.type === 'mushroom-cap') {
        if (pos.y > previousPlayerY + 1e-4) continue;

        const dx = pos.x - c.center.x;
        const dz = pos.z - c.center.z;
        const radialSq = (dx * dx + dz * dz) / (c.radius * c.radius);
        if (radialSq > 1) continue;

        const surfaceY = c.center.y + c.height * Math.sqrt(Math.max(0, 1 - radialSq));
        const footY = cap.a.y - cap.r;
        const previousFootY = previousPlayerY - playerEyeHeight;
        const landingTolerance = Math.max(0.5, playerRadius * 0.5);
        if (
          footY <= surfaceY + 0.05 &&
          previousFootY >= surfaceY - landingTolerance &&
          previousFootY >= c.center.y - 0.05
        ) {
          pos.y = surfaceY + playerEyeHeight;
          supported = true;
          lastSupportTag = c.tag || '';
        }

      } else if (c.type === 'wall-seg') {
        if (risingFromWallTop) continue;
        const vx = c.b.x - c.a.x;
        const vz = c.b.z - c.a.z;
        const wx = pos.x - c.a.x;
        const wz = pos.z - c.a.z;
        const len2 = vx * vx + vz * vz;
        const t = len2 > 1e-8 ? THREE.MathUtils.clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
        const cx = c.a.x + vx * t;
        const cz = c.a.z + vz * t;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const footY = cap.a.y - cap.r;
        const previousFootY = previousPlayerY - playerEyeHeight;
        const topY = THREE.MathUtils.lerp(c.topYA ?? c.maxY, c.topYB ?? c.maxY, t);
        const topRadius = c.halfWidth;
        const rr = c.halfWidth + c.buffer;
        const d2 = dx * dx + dz * dz;

        const previousWx = previousPlayerX - c.a.x;
        const previousWz = previousPlayerZ - c.a.z;
        const previousT = len2 > 1e-8
          ? THREE.MathUtils.clamp((previousWx * vx + previousWz * vz) / len2, 0, 1)
          : 0;
        const previousCx = c.a.x + vx * previousT;
        const previousCz = c.a.z + vz * previousT;
        const previousDx = previousPlayerX - previousCx;
        const previousDz = previousPlayerZ - previousCz;
        const previousTopY = THREE.MathUtils.lerp(c.topYA ?? c.maxY, c.topYB ?? c.maxY, previousT);
        const wasOnTop =
          previousDx * previousDx + previousDz * previousDz <= topRadius * topRadius &&
          Math.abs(previousFootY - previousTopY) <= 2.0;

        const crossedTopFromAbove = previousFootY > topY + 1e-4 && footY <= topY;
        const restingOnTop = Math.abs(footY - topY) <= 2.0;
        const onTop = d2 <= topRadius * topRadius;
        const withinLandingCatch = d2 <= rr * rr;
        const canLandOnTop =
          (crossedTopFromAbove && withinLandingCatch) ||
          (wasOnTop && onTop) ||
          (restingOnTop && onTop);
        if (canLandOnTop) {
          if (!onTop && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const settledRadius = Math.max(0, topRadius - 0.05);
            pos.x = cx + (dx / d) * settledRadius;
            pos.z = cz + (dz / d) * settledRadius;
          }
          pos.y = topY + playerEyeHeight;
          supported = true;
          lastSupportTag = c.tag || '';
          continue;
        }

        // At the lip, let the player step or fall off naturally. Applying the
        // vertical-face push here abruptly throws them away from the wall.
        if (wasOnTop || (previousFootY >= topY - 0.05 && footY >= topY - 2.0)) continue;

        if (d2 >= rr * rr) continue;

        let nx = 1;
        let nz = 0;
        let d = 0;
        if (d2 > 1e-8) {
          d = Math.sqrt(d2);
          nx = dx / d;
          nz = dz / d;
        }

        const pen = rr - d;
        pos.x += nx * pen;
        pos.z += nz * pen;

      } else {
        if (c.type === 'platform') {
          const footY = cap.a.y - cap.r;
          const previousFootY = previousPlayerY - playerEyeHeight;
          const topY = c.max.y;
          const onTop =
            pos.x >= c.min.x - 1e-4 && pos.x <= c.max.x + 1e-4 &&
            pos.z >= c.min.z - 1e-4 && pos.z <= c.max.z + 1e-4;
          const landingTolerance = Math.max(0.5, playerRadius);
          const canSettleOnTop =
            onTop &&
            pos.y <= previousPlayerY + 1e-4 &&
            footY <= topY + 0.05 &&
            previousFootY >= topY - landingTolerance;
          if (canSettleOnTop) {
            pos.y = topY + playerEyeHeight;
            supported = true;
            lastSupportTag = c.tag || '';
            continue;
          }
        }

        const pts = [cap.a, _tmp1.copy(cap.a).lerp(cap.b, 0.5), cap.b];
        let bestPen = 0;
        _nrm.set(0, 0, 0);

        for (const p of pts) {
          const cx = THREE.MathUtils.clamp(p.x, c.min.x, c.max.x);
          const cy = THREE.MathUtils.clamp(p.y, c.min.y, c.max.y);
          const cz = THREE.MathUtils.clamp(p.z, c.min.z, c.max.z);
          _tmp2.set(cx, cy, cz);
          _tmp3.subVectors(p, _tmp2);
          const d2 = _tmp3.lengthSq();
          if (d2 >= cap.r * cap.r || d2 < 1e-10) continue;
          const d = Math.sqrt(d2);
          const pen = cap.r - d;
          if (pen > bestPen) {
            bestPen = pen;
            _nrm.copy(_tmp3).multiplyScalar(1.0 / d);
          }
        }

        if (bestPen > 0) {
          pos.addScaledVector(_nrm, bestPen);
          if (_nrm.y > 0.55) {
            supported = true;
            lastSupportTag = c.tag || '';
          }
        }
      }
    }

    return supported;
  }

  const _treeCircleMin = new THREE.Vector3();
  const _treeCircleMax = new THREE.Vector3();
  function resolveTreeCircleCollisions(pos, radius) {
    const treeTrunkColliderBuffer = getTreeTrunkColliderBuffer();
    _treeCircleMin.set(pos.x - radius, pos.y - 2.0, pos.z - radius);
    _treeCircleMax.set(pos.x + radius, pos.y + 4.0, pos.z + radius);
    const ids = queryNearby(_treeCircleMin, _treeCircleMax);
    let blocked = false;

    for (const id of ids) {
      const c = colliders[id];
      if (!c || (c.tag !== 'tree-trunk' && c.tag !== 'spire')) continue;

      const cx = c.a.x;
      const cz = c.a.z;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const rr = c.r + Math.min(radius, treeTrunkColliderBuffer);
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;

      let nx = 1;
      let nz = 0;
      let d = 0;
      if (d2 > 1e-8) {
        d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
      }

      const push = rr - d;
      pos.x += nx * push;
      pos.z += nz * push;
      blocked = true;
    }

    return blocked;
  }

  function resolveCharacterCircleCollision(posA, radiusA, posB, radiusB) {
    if (!posA || !posB) return false;

    const dx = posA.x - posB.x;
    const dz = posA.z - posB.z;
    const rr = radiusA + radiusB;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) return false;

    let nx = 1;
    let nz = 0;
    let d = 0;
    if (d2 > 1e-8) {
      d = Math.sqrt(d2);
      nx = dx / d;
      nz = dz / d;
    }

    const push = (rr - d) * 0.5;
    posA.x += nx * push;
    posA.z += nz * push;
    posB.x -= nx * push;
    posB.z -= nz * push;
    return true;
  }

  function resolvePlayerMonsterCollision({ monsterRoot, playerPos, playerCharacterRadius, monsterCharacterRadius }) {
    if (!monsterRoot.visible) return false;
    const { halfW, halfH } = getWorldBounds();
    const { playerEyeHeight } = getPlayerCapsuleConfig();
    const seaLevel = getSeaLevel();
    const separated = resolveCharacterCircleCollision(
      playerPos,
      playerCharacterRadius,
      monsterRoot.position,
      monsterCharacterRadius
    );
    if (!separated) return false;

    playerPos.x = THREE.MathUtils.clamp(playerPos.x, -halfW + 1, halfW - 1);
    playerPos.z = THREE.MathUtils.clamp(playerPos.z, -halfH + 1, halfH - 1);
    monsterRoot.position.x = THREE.MathUtils.clamp(monsterRoot.position.x, -halfW + 1, halfW - 1);
    monsterRoot.position.z = THREE.MathUtils.clamp(monsterRoot.position.z, -halfH + 1, halfH - 1);
    playerPos.y = Math.max(playerPos.y, heightAtWorld(playerPos.x, playerPos.z) + playerEyeHeight);
    monsterRoot.position.y = Math.max(heightAtWorld(monsterRoot.position.x, monsterRoot.position.z), seaLevel);
    return true;
  }


  function clear() {
    colliders.length = 0;
    grid.clear();
    lastSupportTag = '';
  }

  return {
    colliders,
    clear,
    rebuildGrid: rebuildColliderGrid,
    resolvePlayerCollisions,
    resolveTreeCircleCollisions,
    resolveCharacterCircleCollision,
    resolvePlayerMonsterCollision,
    get lastSupportTag() {
      return lastSupportTag;
    }
  };
}
