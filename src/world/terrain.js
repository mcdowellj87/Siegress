import * as THREE from 'three';

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function rampGreenBetweenBands(data, W, H, passes = 12) {
  const size = W * H;
  const g = new Float32Array(size);
  for (let i = 0; i < size; i++) g[i] = data[i * 4 + 1];

  const out = new Float32Array(size);
  out.set(g);

  const idx = (x, y) => y * W + x;

  for (let p = 0; p < passes; p++) {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = idx(x, y);
        const v = out[i];
        let min = v, max = v;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = idx(x + dx, y + dy);
            const nv = out[j];
            if (nv < min) min = nv;
            if (nv > max) max = nv;
          }
        }
        if (min !== max) out[i] = (v + min + max * 7) / 9;
      }
    }
  }

  for (let i = 0; i < size; i++) {
    data[i * 4 + 1] = Math.max(0, Math.min(255, out[i]));
  }
}

function smoothHeightsLandOnly(src, wmask, mapW, mapH, passes = 2) {
  const idx = (x, y) => y * mapW + x;
  let a = src, b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = idx(x, y);
        if (wmask[i]) { b[i] = a[i]; continue; }

        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
            const ni = idx(nx, ny);
            if (wmask[ni]) continue;
            sum += a[ni];
            cnt++;
          }
        }
        b[i] = (cnt > 0) ? (sum / cnt) : a[i];
      }
    }
    const t = a; a = b; b = t;
  }
  return a;
}

function smoothHeightsLandOnlyLocked(src, wmask, lockMask, mapW, mapH, passes = 16) {
  const idx = (x, y) => y * mapW + x;
  let a = src, b = new Float32Array(src.length);

  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = idx(x, y);

        if (wmask[i]) { b[i] = a[i]; continue; }
        if (lockMask[i]) { b[i] = a[i]; continue; }

        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
            const ni = idx(nx, ny);
            if (wmask[ni]) continue;
            sum += a[ni];
            cnt++;
          }
        }

        const avg = (cnt > 0) ? (sum / cnt) : a[i];
        b[i] = a[i] * 0.35 + avg * 0.65;
      }
    }
    const t = a; a = b; b = t;
  }

  return a;
}

export function deriveTerrainData(data, options) {
  const {
    mapW,
    mapH,
    isBorder,
    isSpecial,
    isGreenish,
    baseMaxHeight,
    heightMultiplier,
    heightCurvePow,
    heightLightTaper,
    topFlatGnThreshold,
    topFlattenStrength,
    smoothPasses,
    slopePasses,
    waterLevelClearance
  } = options;
  const idx = (x, y) => y * mapW + x;

  rampGreenBetweenBands(data, mapW, mapH, 6);
  const h = new Float32Array(mapW * mapH);
  const wmask = new Uint8Array(mapW * mapH);
  const topMask = new Uint8Array(mapW * mapH);
  const darkestGreenMask = new Uint8Array(mapW * mapH);

  let minLandG = 255;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const p = (y * mapW + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      if (a < 16) continue;
      if (isBorder(r, g, b)) continue;
      if (isSpecial(r, g, b)) continue;
      if (isGreenish(r, g, b)) minLandG = Math.min(minLandG, g);
    }
  }
  if (minLandG === 255) minLandG = 0;

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const p = (y * mapW + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      const i = idx(x, y);

      if (a < 16) {
        h[i] = 0;
        wmask[i] = 0;
        continue;
      }

      if (isBorder(r, g, b)) {
        h[i] = 0;
        wmask[i] = 1;
        continue;
      }

      if (isSpecial(r, g, b)) {
        h[i] = NaN;
        wmask[i] = 0;
        continue;
      }

      if (isGreenish(r, g, b)) {
        const gn = (g - minLandG) / Math.max(1, (255 - minLandG));
        const tRaw = Math.pow(clamp01(gn), heightCurvePow);
        const t = tRaw * (1.0 - heightLightTaper * tRaw);
        h[i] = t * baseMaxHeight * heightMultiplier;

        if (g <= minLandG + 1) darkestGreenMask[i] = 1;
        if (gn >= topFlatGnThreshold) topMask[i] = 1;
      } else {
        h[i] = NaN;
      }
    }
  }

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let pass = 0; pass < mapW + mapH; pass++) {
    let changed = false;
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = idx(x, y);
        if (!Number.isNaN(h[i])) continue;

        let sum = 0, cnt = 0;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
          const ni = idx(nx, ny);
          if (wmask[ni]) continue;
          const v = h[ni];
          if (!Number.isNaN(v)) { sum += v; cnt++; }
        }
        if (cnt > 0) { h[i] = sum / cnt; changed = true; }
      }
    }
    if (!changed) break;
  }
  for (let i = 0; i < h.length; i++) if (Number.isNaN(h[i])) h[i] = 0;

  let sm = smoothHeightsLandOnly(h, wmask, mapW, mapH, smoothPasses);

  let topH = -Infinity;
  for (let i = 0; i < sm.length; i++) {
    if (wmask[i]) continue;
    if (topMask[i]) topH = Math.max(topH, sm[i]);
  }
  if (topH > -Infinity && topFlattenStrength > 0) {
    for (let i = 0; i < sm.length; i++) {
      if (wmask[i]) continue;
      if (topMask[i]) sm[i] = sm[i] * (1 - topFlattenStrength) + topH * topFlattenStrength;
    }
  }

  const slopeLockMask = (topFlattenStrength > 0) ? topMask : new Uint8Array(topMask.length);
  sm = smoothHeightsLandOnlyLocked(sm, wmask, slopeLockMask, mapW, mapH, slopePasses);

  let maxLandHeight = 0;
  let darkestGreenHeight = 0;
  let darkestGreenCount = 0;
  for (let i = 0; i < sm.length; i++) {
    if (wmask[i]) continue;
    maxLandHeight = Math.max(maxLandHeight, sm[i]);
    if (darkestGreenMask[i]) {
      darkestGreenHeight = Math.max(darkestGreenHeight, sm[i]);
      darkestGreenCount++;
    }
  }
  const seaLevel = (darkestGreenCount > 0 ? darkestGreenHeight : 0) + waterLevelClearance;

  return { heights: sm, waterMask: wmask, seaLevel, maxLandHeight };
}

export function disposeTerrainMesh(mesh, levelRoot) {
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.material.dispose();
  levelRoot.remove(mesh);
}

export function buildTerrainMesh(options) {
  const {
    mapW,
    mapH,
    cell,
    sampleStep,
    heightForRender,
    gradientMap,
    glassfloorEnabled,
    levelRoot
  } = options;

  const sizeX = mapW * cell;
  const sizeZ = mapH * cell;
  const halfW = sizeX / 2;
  const halfH = sizeZ / 2;

  const segX = Math.max(1, Math.floor((mapW - 1) / sampleStep));
  const segZ = Math.max(1, Math.floor((mapH - 1) / sampleStep));

  const geo = new THREE.PlaneGeometry(sizeX, sizeZ, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i);
    const wz = pos.getZ(i);
    pos.setY(i, heightForRender(wx, wz));
  }

  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({
    color: 0x257766,
    emissive: 0x031720,
    emissiveIntensity: 0.34,
    gradientMap,
    fog: true
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTerrainDitherBlue = { value: new THREE.Color(0x021526) };
    shader.uniforms.uTerrainDitherStrength = { value: 0.32 };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform vec3 uTerrainDitherBlue;
       uniform float uTerrainDitherStrength;

       float terrainDither(vec2 p) {
         vec2 grid = floor(p / 3.0);
         return fract(sin(dot(grid, vec2(127.1, 311.7))) * 43758.5453123);
       }
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `
      float dither = terrainDither(gl_FragCoord.xy);
      float blueMix = uTerrainDitherStrength * smoothstep(0.38, 0.92, dither);
      outgoingLight = mix(outgoingLight, uTerrainDitherBlue, blueMix);

      #include <output_fragment>
      `
    );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.visible = !glassfloorEnabled;
  levelRoot.add(mesh);
  return { mesh, halfW, halfH };
}
