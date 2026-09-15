import * as THREE from 'three';
import { mergeGeometries } from '../../utils/BufferGeometryUtils.js';

export const FIR_TRUNK_COLLIDER_BUFFER = 0.08;

export function createTreeSystem({
  levelRoot,
  colliders,
  getMetrics,
  isTreePixel,
  heightAtWorldRaw,
  heightAtWorld,
  isWaterAtWorld,
  isInsideReserve,
  maxTrees,
  isFirefox
}) {
  /* =========================
     TREES (PROCEDURAL DOUGLAS FIR)
  ========================= */
  const FIR_HEIGHT = 42.0;
  const FIR_TRUNK_RADIUS_BASE = 0.6;
  const FIR_TRUNK_RADIUS_TOP = 0.06;
  const FIR_TRUNK_COLLIDER_RADIUS_MUL = 1.0;
  const FIR_TRUNK_COLLIDER_HEIGHT_MUL = 0.82;
  const FIR_TRUNK_RADIAL_SEGMENTS = 5;
  const FIR_TRUNK_HEIGHT_SEGMENTS = 8;
  const FIR_BRANCH_START = 0.35;
  const FIR_WHORLS = 18;
  const FIR_BRANCH_SEGMENTS = 6;
  const FIR_HIDE_BRANCHES = false;
  const FIR_BRANCH_LENGTH_SCALE = 2 / 3;
  const FIR_BRANCH_LENGTH_RANDOM_TRUNK_PCT = 0.10;
  const FIR_TOP_SHORT_START = 0.93;
  const FIR_TOP_SHORT_END_SCALE = 0.0875;
  const FIR_TOPMOST_BRANCH_START = 0.90;
  const FIR_TOPMOST_BRANCH_DOWN_DEG = 15;
  const FIR_TOPMOST_BRANCH_DOWN_RAD = THREE.MathUtils.degToRad(FIR_TOPMOST_BRANCH_DOWN_DEG);
  const FIR_TOPMOST_BRANCH_LENGTH_SCALE = 2 / 3;
  const FIR_TOP_UP_DEG = 40;
  const FIR_TOP_UP_RAD = THREE.MathUtils.degToRad(FIR_TOP_UP_DEG);
  const FIR_LOWER_BRANCH_FRACTION = 1 / 3;
  const FIR_LOWER_BRANCH_DOWN_DEG = 40;
  const FIR_LOWER_BRANCH_DOWN_RAD = THREE.MathUtils.degToRad(FIR_LOWER_BRANCH_DOWN_DEG);
  const FIR_MID_BRANCH_FRACTION = 2 / 3;
  const FIR_MID_BRANCH_DOWN_DEG = 25;
  const FIR_MID_BRANCH_DOWN_RAD = THREE.MathUtils.degToRad(FIR_MID_BRANCH_DOWN_DEG);
  const FIR_TOP_BRANCH_DOWN_DEG = 15;
  const FIR_TOP_BRANCH_DOWN_RAD = THREE.MathUtils.degToRad(FIR_TOP_BRANCH_DOWN_DEG);
  const FIR_TEMPLATE_SCALE = 1.2;
  const FIR_BRANCH_SPRIG_START_T = 0.03;
  const FIR_BRANCH_SPRIG_STEP_T = 0.03;
  const FIR_BRANCH_SPRIG_OVERLAP = 0.20;
  const FIR_BRANCH_SPRIG_DENSITY_MULT = 0.75;
  const FIR_BRANCH_SPRIG_FIRST_SCALE = 3.0;
  const FIR_BRANCH_SPRIG_SCALE_STEP = 0.95;
  const FIR_BRANCH_SPRIG_ROLL_STEP_DEG = 0.8;
  const FIR_BRANCH_SPRIG_WIDTH_RATIO_BASE = 0.28;
  const FIR_BRANCH_SPRIG_WIDTH_RATIO_TIP = 0.16;
  const FIR_BRANCH_SPRIG_POSITION_JITTER_T = 0.018;
  const FIR_BRANCH_SPRIG_TOP_INTERSECT_PORTION = 0.05;
  const FIR_BRANCH_SPRIG_SPACING_JITTER = 0.18;
  const FIR_BRANCH_SPRIG_OUT_ANGLE_BASE_DEG = 4;
  const FIR_BRANCH_SPRIG_OUT_ANGLE_TIP_DEG = 60;
  const FIR_BRANCH_SPRIG_OUT_ANGLE_ACCEL = 1.45;
  const FIR_BRANCH_SPRIG_ANGLE_VARIATION_FORWARD_PCT = 0.20;
  const FIR_BRANCH_SPRIG_ANGLE_VARIATION_BACKWARD_PCT = 0.07;
  const FIR_TWIG_RADIAL_SEGMENTS = 3;
  const FIR_TWIG_START_T = 0.18;
  const FIR_TWIG_LENGTH = 3.4;
  const FIR_TWIG_RADIUS_BASE = 0.055;
  const FIR_TWIG_RADIUS_TIP = 0.012;

  let treeInstancesMesh = null;
  let treeTemplateGeometry = null;
  let treeTemplateMaterial = null;
  let treeBranchSprigInstancesMesh = null;
  let treeBranchSprigTemplateGeometry = null;
  let treeBranchSprigTemplateMaterial = null;
  let treeBranchSprigTexture = null;
  let treeBranchSprigLocalMatrices = null;

  function getBranchPoint(start, dir, gravity, length, sag, t) {
    const point = start.clone().addScaledVector(dir, length * t);
    point.addScaledVector(gravity, sag * length * t * (1 - t) * 1.4);
    return point;
  }

  function makeSeededRng(seed) {
    let t = seed >>> 0;
    return function rand() {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setFirBranchDirection(out, angle, t) {
    if (t >= FIR_TOPMOST_BRANCH_START) {
      const horizontal = Math.cos(FIR_TOPMOST_BRANCH_DOWN_RAD);
      out.set(
        Math.cos(angle) * horizontal,
        -Math.sin(FIR_TOPMOST_BRANCH_DOWN_RAD),
        Math.sin(angle) * horizontal
      );
    } else if (t >= FIR_TOP_SHORT_START) {
      const horizontal = Math.cos(FIR_TOP_UP_RAD);
      out.set(
        Math.cos(angle) * horizontal,
        Math.sin(FIR_TOP_UP_RAD),
        Math.sin(angle) * horizontal
      );
    } else if (t < FIR_LOWER_BRANCH_FRACTION) {
      const horizontal = Math.cos(FIR_LOWER_BRANCH_DOWN_RAD);
      out.set(
        Math.cos(angle) * horizontal,
        -Math.sin(FIR_LOWER_BRANCH_DOWN_RAD),
        Math.sin(angle) * horizontal
      );
    } else if (t < FIR_MID_BRANCH_FRACTION) {
      const horizontal = Math.cos(FIR_MID_BRANCH_DOWN_RAD);
      out.set(
        Math.cos(angle) * horizontal,
        -Math.sin(FIR_MID_BRANCH_DOWN_RAD),
        Math.sin(angle) * horizontal
      );
    } else {
      const horizontal = Math.cos(FIR_TOP_BRANCH_DOWN_RAD);
      out.set(
        Math.cos(angle) * horizontal,
        -Math.sin(FIR_TOP_BRANCH_DOWN_RAD),
        Math.sin(angle) * horizontal
      );
    }
    return out.normalize();
  }

  function getFirBranchLengthAt(t) {
    let length = 16.0 * (1 - t * 0.6) * FIR_BRANCH_LENGTH_SCALE;
    if (t >= FIR_TOPMOST_BRANCH_START) {
      length *= FIR_TOPMOST_BRANCH_LENGTH_SCALE;
    }
    if (t >= FIR_TOP_SHORT_START) {
      const u = THREE.MathUtils.clamp((t - FIR_TOP_SHORT_START) / (1.0 - FIR_TOP_SHORT_START), 0, 1);
      length *= THREE.MathUtils.lerp(1.0, FIR_TOP_SHORT_END_SCALE, u);
    }
    return length;
  }

  function getFirBranchCount(rand) {
    // Original branch count was 2-3; this keeps random distribution but doubles average to 4-6.
    return 4 + Math.floor(rand() * 3);
  }

  function getFirBranchLengthMul(rand) {
    // Randomly shorten each branch by up to ~10% toward the trunk.
    return THREE.MathUtils.lerp(1.0 - FIR_BRANCH_LENGTH_RANDOM_TRUNK_PCT, 1.0, rand());
  }

  function addTubeBetween(parts, a, b, radiusBase, radiusTip, up, q, mid) {
    const segLen = a.distanceTo(b);
    if (segLen <= 1e-4) return;

    const tube = new THREE.CylinderGeometry(radiusTip, radiusBase, segLen, FIR_TWIG_RADIAL_SEGMENTS, 1, false);
    mid.copy(a).add(b).multiplyScalar(0.5);
    q.setFromUnitVectors(up, b.clone().sub(a).normalize());
    tube.applyQuaternion(q);
    tube.translate(mid.x, mid.y, mid.z);
    parts.push(tube);
  }

  function addFlatOffshoot(parts, a, dir, side, gravity, length, width) {
    if (length <= 1e-4 || width <= 1e-4) return;

    const root = a.clone();
    const tip = a.clone().addScaledVector(dir, length);
    const droopTip = tip.clone().addScaledVector(gravity, length * 0.18);
    const sideWidth = Math.max(width, length * 0.035);

    const baseLeft = root.clone().addScaledVector(side, sideWidth * 0.45);
    const baseRight = root.clone().addScaledVector(side, -sideWidth * 0.45);
    const mid = root.clone().lerp(droopTip, 0.58);
    const midLeft = mid.clone().addScaledVector(side, sideWidth);
    const midRight = mid.clone().addScaledVector(side, -sideWidth * 0.72);
    const vertices = [baseLeft, baseRight, midLeft, midRight, droopTip];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flatMap(v => [v.x, v.y, v.z]), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([
      0.0, 0.0,
      1.0, 0.0,
      0.0, 0.58,
      1.0, 0.58,
      0.5, 1.0
    ], 2));
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    geo.computeVertexNormals();
    parts.push(geo);
  }

  function buildDouglasFirTemplateGeometry() {
    if (treeTemplateGeometry) return treeTemplateGeometry;

    const parts = [];

    const trunk = new THREE.CylinderGeometry(1, 1, FIR_HEIGHT, FIR_TRUNK_RADIAL_SEGMENTS, FIR_TRUNK_HEIGHT_SEGMENTS, false);
    const trunkPos = trunk.attributes.position;
    for (let i = 0; i < trunkPos.count; i++) {
      const x = trunkPos.getX(i);
      const y = trunkPos.getY(i);
      const z = trunkPos.getZ(i);
      const zf = THREE.MathUtils.clamp((y + FIR_HEIGHT * 0.5) / FIR_HEIGHT, 0, 1);
      const r = FIR_TRUNK_RADIUS_TOP + (FIR_TRUNK_RADIUS_BASE - FIR_TRUNK_RADIUS_TOP) * Math.pow(1 - zf, 2.0);
      trunkPos.setXYZ(i, x * r, y, z * r);
    }
    trunkPos.needsUpdate = true;
    trunk.computeVertexNormals();
    parts.push(trunk);

    const rng = makeSeededRng(44);
    const gravity = new THREE.Vector3(0, -1, 0);
    const dir = new THREE.Vector3();
    const start = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3();
    const twigDir = new THREE.Vector3();
    const twigStart = new THREE.Vector3();
    const twigEnd = new THREE.Vector3();
    const q = new THREE.Quaternion();

    for (let i = 0; i < FIR_WHORLS; i++) {
      const t = i / FIR_WHORLS;
      const yBase = FIR_HEIGHT * (FIR_BRANCH_START + (1 - FIR_BRANCH_START) * t) - (FIR_HEIGHT * 0.5);

      const lengthBase = getFirBranchLengthAt(t);

      const sag = 0.20 * Math.pow(1 - t, 0.9);
      const thickness = 0.12 * Math.pow(1 - t, 0.8);
      const count = getFirBranchCount(rng);
      const phase = rng() * Math.PI * 2.0;

      for (let j = 0; j < count; j++) {
        const length = lengthBase * getFirBranchLengthMul(rng);
        const angle = phase + (j / count) * Math.PI * 2.0 + THREE.MathUtils.lerp(-0.1, 0.1, rng());
        setFirBranchDirection(dir, angle, t);

        const trunkR = FIR_TRUNK_RADIUS_TOP + (FIR_TRUNK_RADIUS_BASE - FIR_TRUNK_RADIUS_TOP) * Math.pow(1 - t, 2.0);
        start.set(dir.x * trunkR * 1.05, yBase, dir.z * trunkR * 1.05);

        const points = [];
        for (let k = 0; k <= FIR_BRANCH_SEGMENTS; k++) {
          const tt = k / FIR_BRANCH_SEGMENTS;
          const p = start.clone().addScaledVector(dir, length * tt);
          p.addScaledVector(gravity, sag * length * tt * (1 - tt) * 1.4);
          points.push(p);
        }

        if (!FIR_HIDE_BRANCHES) {
          for (let k = 0; k < FIR_BRANCH_SEGMENTS; k++) {
            a.copy(points[k]);
            b.copy(points[k + 1]);
            const radiusBase = thickness * Math.pow(1 - (k / FIR_BRANCH_SEGMENTS), 0.85);
            const radiusTip = thickness * Math.pow(1 - ((k + 1) / FIR_BRANCH_SEGMENTS), 0.85);
            addTubeBetween(parts, a, b, radiusBase, radiusTip, up, q, mid);

            const branchU = (k + 0.5) / FIR_BRANCH_SEGMENTS;
            if (branchU < FIR_TWIG_START_T) continue;

            side.crossVectors(up, dir);
            if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
            side.normalize();

            const twigLen = FIR_TWIG_LENGTH * Math.pow(1 - branchU, 0.82) * THREE.MathUtils.lerp(1.2, 0.45, t);
            const twigRadius = FIR_TWIG_RADIUS_BASE * Math.pow(1 - branchU, 0.65) * THREE.MathUtils.lerp(1.2, 0.55, t);
            const sideSign = ((k + j) % 2 === 0) ? 1 : -1;

            twigStart.copy(a).lerp(b, 0.54);
            twigDir.copy(dir)
              .multiplyScalar(0.28)
              .addScaledVector(side, sideSign * 0.52)
              .addScaledVector(gravity, 0.72)
              .normalize();
            twigEnd.copy(twigStart).addScaledVector(twigDir, twigLen);
            addFlatOffshoot(parts, twigStart, twigDir, side, gravity, twigLen, twigRadius * 3.2);

            if (branchU < 0.78 && t < 0.92) {
              twigStart.copy(a).lerp(b, 0.82);
              twigDir.copy(dir)
                .multiplyScalar(0.18)
                .addScaledVector(side, -sideSign * 0.42)
                .addScaledVector(gravity, 0.82)
                .normalize();
              addFlatOffshoot(parts, twigStart, twigDir, side, gravity, twigLen * 0.72, twigRadius * 2.6);
            }
          }
        }
      }
    }

    treeTemplateGeometry = mergeGeometries(parts, false);
    treeTemplateGeometry.computeVertexNormals();
    for (const g of parts) g.dispose();
    return treeTemplateGeometry;
  }

  function buildDouglasFirBranchSprigLocalMatrices() {
    if (treeBranchSprigLocalMatrices) return treeBranchSprigLocalMatrices;

    const rngBranch = makeSeededRng(44);
    const rngSprig = makeSeededRng(44044);
    const gravity = new THREE.Vector3(0, -1, 0);
    const dir = new THREE.Vector3();
    const start = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);
    const outward = new THREE.Vector3();
    const hingeAxis = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const hangQuat = new THREE.Quaternion().setFromUnitVectors(up, down);
    const yawQuat = new THREE.Quaternion();
    const hingeQuat = new THREE.Quaternion();
    const flipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const localMatrices = [];

    for (let i = 0; i < FIR_WHORLS; i++) {
      const t = i / FIR_WHORLS;
      const yBase = FIR_HEIGHT * (FIR_BRANCH_START + (1 - FIR_BRANCH_START) * t) - (FIR_HEIGHT * 0.5);

      const lengthBase = getFirBranchLengthAt(t);

      const sag = 0.20 * Math.pow(1 - t, 0.9);
      const count = getFirBranchCount(rngBranch);
      const phase = rngBranch() * Math.PI * 2.0;

      for (let j = 0; j < count; j++) {
        const length = lengthBase * getFirBranchLengthMul(rngBranch);
        const angle = phase + (j / count) * Math.PI * 2.0 + THREE.MathUtils.lerp(-0.1, 0.1, rngBranch());
        setFirBranchDirection(dir, angle, t);

        const trunkR = FIR_TRUNK_RADIUS_TOP + (FIR_TRUNK_RADIUS_BASE - FIR_TRUNK_RADIUS_TOP) * Math.pow(1 - t, 2.0);
        start.set(dir.x * trunkR * 1.05, yBase, dir.z * trunkR * 1.05);
        const firstBaseHeight = THREE.MathUtils.clamp(length * (0.23 - 0.11 * FIR_BRANCH_SPRIG_START_T), 0.7, 5.0);
        const topU = THREE.MathUtils.clamp((t - FIR_TOP_SHORT_START) / (1.0 - FIR_TOP_SHORT_START), 0, 1);
        const topSprigStartScale = THREE.MathUtils.lerp(FIR_BRANCH_SPRIG_FIRST_SCALE, 1.15, topU);
        const branchSpanT = 0.98 - FIR_BRANCH_SPRIG_START_T;
        const avgWidthRatio = (FIR_BRANCH_SPRIG_WIDTH_RATIO_BASE + FIR_BRANCH_SPRIG_WIDTH_RATIO_TIP) * 0.5;
        const firstSprigWidth = Math.max(0.01, firstBaseHeight * topSprigStartScale * avgWidthRatio);
        const alongBranchStep = firstSprigWidth * (1.0 - FIR_BRANCH_SPRIG_OVERLAP);
        const denseStep = (alongBranchStep / Math.max(length, 1e-4)) / FIR_BRANCH_SPRIG_DENSITY_MULT;
        const baseStepT = THREE.MathUtils.clamp(denseStep, 0.0025, FIR_BRANCH_SPRIG_STEP_T);
        const estimatedSprigCount = Math.max(1, Math.floor((branchSpanT / Math.max(baseStepT, 1e-4)) * 1.1));
        const gapCount = estimatedSprigCount + 1;
        const gaps = new Array(gapCount);
        let totalGapWeight = 0;
        const gapWeightMin = Math.max(0.2, 1.0 - FIR_BRANCH_SPRIG_SPACING_JITTER * 3.0);
        const gapWeightMax = 1.0 + FIR_BRANCH_SPRIG_SPACING_JITTER * 3.0;
        for (let g = 0; g < gapCount; g++) {
          const gapWeight = THREE.MathUtils.lerp(gapWeightMin, gapWeightMax, rngSprig());
          gaps[g] = gapWeight;
          totalGapWeight += gapWeight;
        }

        let cumulativeGapWeight = gaps[0];
        let sprigScaleMul = topSprigStartScale;
        let sprigRoll = 0;

        for (let s = 0; s < estimatedSprigCount; s++) {
          const tt = FIR_BRANCH_SPRIG_START_T + (cumulativeGapWeight / totalGapWeight) * branchSpanT;
          const ttJitter = THREE.MathUtils.lerp(-FIR_BRANCH_SPRIG_POSITION_JITTER_T, FIR_BRANCH_SPRIG_POSITION_JITTER_T, rngSprig());
          const ttSample = THREE.MathUtils.clamp(tt + ttJitter, FIR_BRANCH_SPRIG_START_T, 0.98);
          const p = getBranchPoint(start, dir, gravity, length, sag, ttSample);
          const branchU = THREE.MathUtils.clamp((ttSample - FIR_BRANCH_SPRIG_START_T) / (0.98 - FIR_BRANCH_SPRIG_START_T), 0, 1);

          quat.copy(hangQuat);
          yawQuat.setFromAxisAngle(down, angle + sprigRoll);
          quat.premultiply(yawQuat);

          outward.set(dir.x, 0, dir.z);
          if (outward.lengthSq() < 1e-8) outward.copy(dir);
          outward.normalize();
          hingeAxis.crossVectors(down, outward).normalize();
          const acceleratedU = Math.pow(branchU, FIR_BRANCH_SPRIG_OUT_ANGLE_ACCEL);
          const outwardTiltBase = THREE.MathUtils.degToRad(
            THREE.MathUtils.lerp(FIR_BRANCH_SPRIG_OUT_ANGLE_BASE_DEG, FIR_BRANCH_SPRIG_OUT_ANGLE_TIP_DEG, acceleratedU)
          );
          const outwardTiltVariationMul = THREE.MathUtils.lerp(
            1.0 - FIR_BRANCH_SPRIG_ANGLE_VARIATION_BACKWARD_PCT,
            1.0 + FIR_BRANCH_SPRIG_ANGLE_VARIATION_FORWARD_PCT,
            rngSprig()
          );
          const outwardTilt = outwardTiltBase * outwardTiltVariationMul;
          hingeQuat.setFromAxisAngle(hingeAxis, outwardTilt);
          quat.premultiply(hingeQuat);
          quat.multiply(flipQuat);

          const trunkZoneScale = branchU < 0.6 ? 0.6 : 1.0;
          const sprigHeight = Math.max(0.7, firstBaseHeight * sprigScaleMul * trunkZoneScale);
          const widthRatio = THREE.MathUtils.lerp(FIR_BRANCH_SPRIG_WIDTH_RATIO_BASE, FIR_BRANCH_SPRIG_WIDTH_RATIO_TIP, branchU);
          const sprigWidth = sprigHeight * widthRatio;
          scale.set(sprigWidth, sprigHeight, 1);

          localMatrices.push(new THREE.Matrix4().compose(p, quat, scale));

          sprigRoll += THREE.MathUtils.degToRad(FIR_BRANCH_SPRIG_ROLL_STEP_DEG);
          sprigScaleMul *= FIR_BRANCH_SPRIG_SCALE_STEP;
          cumulativeGapWeight += gaps[s + 1];
        }
      }
    }

    treeBranchSprigLocalMatrices = localMatrices;
    return treeBranchSprigLocalMatrices;
  }

  function clearTrees() {
    if (treeInstancesMesh) {
      levelRoot.remove(treeInstancesMesh);
      treeInstancesMesh = null;
    }
    if (treeBranchSprigInstancesMesh) {
      levelRoot.remove(treeBranchSprigInstancesMesh);
      treeBranchSprigInstancesMesh = null;
    }
  }

  function getTreeBranchSprigTexture() {
    if (treeBranchSprigTexture) return treeBranchSprigTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(64, 18, 64, 238);
    gradient.addColorStop(0, 'rgba(168, 214, 156, 0.95)');
    gradient.addColorStop(0.48, 'rgba(62, 126, 83, 0.90)');
    gradient.addColorStop(1, 'rgba(22, 64, 48, 0.0)');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(64, 8);
    ctx.bezierCurveTo(34, 58, 18, 128, 52, 244);
    ctx.bezierCurveTo(72, 216, 112, 125, 64, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 68, 43, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(64, 28);
    ctx.bezierCurveTo(61, 86, 61, 170, 54, 238);
    ctx.stroke();
    treeBranchSprigTexture = new THREE.CanvasTexture(canvas);
    treeBranchSprigTexture.colorSpace = THREE.SRGBColorSpace;
    return treeBranchSprigTexture;
  }

  function collectTreeBlobsFromBitmap(data) {
    const { mapW, mapH } = getMetrics();
    function idx(x, y) { return y * mapW + x; }
    const visited = new Uint8Array(mapW * mapH);
    const blobs = [];

    function inb(x, y) { return x >= 0 && y >= 0 && x < mapW && y < mapH; }

    const qx = new Int32Array(mapW * mapH);
    const qy = new Int32Array(mapW * mapH);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = idx(x, y);
        if (visited[i]) continue;

        const p = i * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
        if (!isTreePixel(r, g, b, a)) { visited[i] = 1; continue; }

        let head = 0, tail = 0;
        visited[i] = 1;
        qx[tail] = x; qy[tail] = y; tail++;

        let sumX = 0, sumY = 0, count = 0;
        let minX = x, maxX = x, minY = y, maxY = y;

        while (head < tail) {
          const cx = qx[head];
          const cy = qy[head];
          head++;

          sumX += cx; sumY += cy; count++;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx, ny = cy + dy;
              if (!inb(nx, ny)) continue;
              const ni = idx(nx, ny);
              if (visited[ni]) continue;

              const pp = ni * 4;
              const rr = data[pp], gg = data[pp + 1], bb = data[pp + 2], aa = data[pp + 3];
              if (isTreePixel(rr, gg, bb, aa)) {
                visited[ni] = 1;
                qx[tail] = nx; qy[tail] = ny; tail++;
              } else {
                visited[ni] = 1;
              }
            }
          }
        }

        if (count > 0) {
          const cx = sumX / count;
          const cy = sumY / count;

          const dxp = (maxX - minX + 1);
          const dyp = (maxY - minY + 1);
          const diamPx = Math.max(1, Math.hypot(dxp, dyp));

          blobs.push({ cx, cy, diamPx, count });
          if (blobs.length > 12000) return blobs;
        }
      }
    }

    return blobs;
  }

  function buildTreeInstancesFromBlobs(blobs) {
    const { cell, halfW, halfH, seaLevel } = getMetrics();
    clearTrees();
    if (!blobs.length) return;
    if (blobs.length > maxTrees) {
      blobs = blobs.slice(0, maxTrees);
    }

    blobs = blobs.filter(blob => {
      const wx = blob.cx * cell - halfW + cell * 0.5;
      const wz = blob.cy * cell - halfH + cell * 0.5;
      return heightAtWorldRaw(wx, wz) > seaLevel && !isWaterAtWorld(wx, wz) && !isInsideReserve(wx, wz);
    });
    if (!blobs.length) return;

    const geo = buildDouglasFirTemplateGeometry();
    if (!treeTemplateMaterial) {
      treeTemplateMaterial = new THREE.MeshStandardMaterial({
        color: 0x101010,
        roughness: 0.92,
        metalness: 0.0,
        emissive: 0x050505,
        emissiveIntensity: 0.18,
        flatShading: true
      });
    }

    treeInstancesMesh = new THREE.InstancedMesh(geo, treeTemplateMaterial, blobs.length);
    treeInstancesMesh.castShadow = false;
    treeInstancesMesh.receiveShadow = false;
    treeInstancesMesh.frustumCulled = !isFirefox;

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');

    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      const wx = blob.cx * cell - halfW + cell * 0.5;
      const wz = blob.cy * cell - halfH + cell * 0.5;
      const baseY = Math.max(heightAtWorld(wx, wz), seaLevel);
      const sizeMul = THREE.MathUtils.clamp(0.70 + blob.diamPx * 0.03, 0.70, 2.20);
      const scale = FIR_TEMPLATE_SCALE * sizeMul;
      const hNoise = (Math.sin((i + 1) * 12.9898 + blob.cx * 78.233 + blob.cy * 37.719) * 43758.5453) % 1;
      const hRand = hNoise < 0 ? hNoise + 1 : hNoise;
      const heightMul = THREE.MathUtils.lerp(0.25, 2.0, hRand);
      const widthMul = Math.pow(heightMul, 0.7);

      p.set(wx, baseY + (FIR_HEIGHT * 0.5 * scale * heightMul), wz);
      e.y = ((i * 73) % 360) * (Math.PI / 180);
      q.setFromEuler(e);
      s.set(scale * widthMul, scale * heightMul, scale * widthMul);
      m.compose(p, q, s);
      treeInstancesMesh.setMatrixAt(i, m);

      const trunkRadius = FIR_TRUNK_RADIUS_BASE * scale * widthMul * FIR_TRUNK_COLLIDER_RADIUS_MUL;
      const trunkHeight = FIR_HEIGHT * scale * heightMul * FIR_TRUNK_COLLIDER_HEIGHT_MUL;
      colliders.push({
        type: 'cap',
        a: new THREE.Vector3(wx, baseY + trunkRadius, wz),
        b: new THREE.Vector3(wx, baseY + trunkHeight, wz),
        r: trunkRadius,
        tag: 'tree-trunk'
      });
    }

    treeInstancesMesh.instanceMatrix.needsUpdate = true;
    levelRoot.add(treeInstancesMesh);
  }


  return {
    clear: clearTrees,
    collectBlobsFromBitmap: collectTreeBlobsFromBitmap,
    buildInstancesFromBlobs: buildTreeInstancesFromBlobs
  };
}
