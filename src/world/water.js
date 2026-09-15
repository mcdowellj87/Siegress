import * as THREE from 'three';

const SHORELINE_WAVE_DRAW_DISTANCE = 560;
const SHORELINE_WAVE_BUILD_MARGIN = 180;
const SHORELINE_WAVE_REBUILD_DISTANCE = 120;

function seededWaterNoise(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWaterSystem({
  levelRoot,
  isFirefox,
  waterPlaneSize,
  getState,
  isSubmergedGrid
}) {
  let worldSeaPlane = null;
  let shorelineMistMesh = null;
  let shorelineMistUniforms = null;
  let shorelineWavePaths = null;
  let shorelineWaveLastBuildX = Infinity;
  let shorelineWaveLastBuildZ = Infinity;

  function buildWorldSeaPlane() {
    const { seaLevel } = getState();
    if (worldSeaPlane) {
      levelRoot.remove(worldSeaPlane);
      worldSeaPlane.geometry.dispose();
      worldSeaPlane.material.dispose();
      worldSeaPlane = null;
    }

    const geo = new THREE.PlaneGeometry(waterPlaneSize, waterPlaneSize, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x343a78,
      fog: true,
      transparent: false,
      depthWrite: true,
      depthTest: true
    });

    worldSeaPlane = new THREE.Mesh(geo, mat);
    worldSeaPlane.position.set(0, seaLevel, 0);
    worldSeaPlane.renderOrder = 2;
    levelRoot.add(worldSeaPlane);
  }

  function clearShorelineMist() {
    if (!shorelineMistMesh) return;
    levelRoot.remove(shorelineMistMesh);
    shorelineMistMesh.geometry.dispose();
    shorelineMistMesh.material.dispose();
    shorelineMistMesh = null;
    shorelineMistUniforms = null;
  }

  function resetShorelineCache() {
    clearShorelineMist();
    shorelineWavePaths = null;
    shorelineWaveLastBuildX = Infinity;
    shorelineWaveLastBuildZ = Infinity;
  }

  function collectShorelineWavePaths() {
    const { mapW, mapH, cell, halfW, halfH, heights, waterMask } = getState();
    if (!heights || !waterMask) return;

    const rand = seededWaterNoise(424242);
    const sampleStep = isFirefox ? 5 : 3;
    const maxEdges = isFirefox ? 3600 : 14000;
    const edgeSegments = [];
    const paths = [];
    const edgeDirs = [
      { ox: 1, oy: 0, nx: 1, nz: 0, tx: 0, tz: 1 },
      { ox: -1, oy: 0, nx: -1, nz: 0, tx: 0, tz: 1 },
      { ox: 0, oy: 1, nx: 0, nz: 1, tx: 1, tz: 0 },
      { ox: 0, oy: -1, nx: 0, nz: -1, tx: 1, tz: 0 }
    ];
    const pointKey = (p) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`;

    for (let y = sampleStep; y < mapH - sampleStep && edgeSegments.length < maxEdges; y += sampleStep) {
      for (let x = sampleStep; x < mapW - sampleStep && edgeSegments.length < maxEdges; x += sampleStep) {
        if (!isSubmergedGrid(x, y)) continue;

        for (const edge of edgeDirs) {
          if (edgeSegments.length >= maxEdges || isSubmergedGrid(x + edge.ox * sampleStep, y + edge.oy * sampleStep)) continue;
          const edgeCenter = {
            x: x + edge.ox * sampleStep * 0.5,
            y: y + edge.oy * sampleStep * 0.5
          };
          const a = {
            x: edgeCenter.x - edge.tx * sampleStep * 0.5,
            y: edgeCenter.y - edge.tz * sampleStep * 0.5
          };
          const b = {
            x: edgeCenter.x + edge.tx * sampleStep * 0.5,
            y: edgeCenter.y + edge.tz * sampleStep * 0.5
          };
          edgeSegments.push({
            a,
            b,
            ak: pointKey(a),
            bk: pointKey(b),
            nx: -edge.nx,
            nz: -edge.nz
          });
        }
      }
    }

    const adjacency = new Map();
    for (let i = 0; i < edgeSegments.length; i++) {
      const e = edgeSegments[i];
      if (!adjacency.has(e.ak)) adjacency.set(e.ak, []);
      if (!adjacency.has(e.bk)) adjacency.set(e.bk, []);
      adjacency.get(e.ak).push(i);
      adjacency.get(e.bk).push(i);
    }

    const used = new Uint8Array(edgeSegments.length);
    const gridToWorldX = (gx) => gx * cell - halfW + cell * 0.5;
    const gridToWorldZ = (gy) => gy * cell - halfH + cell * 0.5;

    function traceShoreline(startIndex) {
      const first = edgeSegments[startIndex];
      let startKey = first.ak;
      for (const key of [first.ak, first.bk]) {
        const degree = adjacency.get(key)?.length || 0;
        if (degree === 1) { startKey = key; break; }
      }

      const points = [];
      let currentKey = startKey;
      let currentIndex = startIndex;

      while (currentIndex !== -1 && !used[currentIndex] && points.length < 4096) {
        const edge = edgeSegments[currentIndex];
        used[currentIndex] = 1;
        const fromA = edge.ak === currentKey;
        const p = fromA ? edge.a : edge.b;
        const next = fromA ? edge.b : edge.a;
        const nextKey = fromA ? edge.bk : edge.ak;
        points.push({ x: p.x, y: p.y, nx: edge.nx, nz: edge.nz });

        const options = adjacency.get(nextKey) || [];
        let nextIndex = -1;
        for (const id of options) {
          if (!used[id]) { nextIndex = id; break; }
        }
        currentKey = nextKey;
        currentIndex = nextIndex;

        if (currentKey === startKey) {
          points.push({ x: next.x, y: next.y, nx: edge.nx, nz: edge.nz });
          break;
        }
      }

      return points;
    }

    function smoothShorelinePath(path) {
      if (path.length < 3) return path;
      const out = [path[0]];
      for (let i = 1; i < path.length - 1; i++) {
        const prev = path[i - 1];
        const cur = path[i];
        const next = path[i + 1];
        const nx = prev.nx + cur.nx + next.nx;
        const nz = prev.nz + cur.nz + next.nz;
        const nLen = Math.hypot(nx, nz) || 1;
        out.push({
          x: cur.x * 0.5 + prev.x * 0.25 + next.x * 0.25,
          y: cur.y * 0.5 + prev.y * 0.25 + next.y * 0.25,
          nx: nx / nLen,
          nz: nz / nLen
        });
      }
      out.push(path[path.length - 1]);
      return out;
    }

    function resampleShorelinePath(path, spacing) {
      if (path.length < 2) return path;
      const out = [path[0]];
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(len / spacing));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const nx = THREE.MathUtils.lerp(a.nx, b.nx, t);
          const nz = THREE.MathUtils.lerp(a.nz, b.nz, t);
          const nLen = Math.hypot(nx, nz) || 1;
          out.push({
            x: THREE.MathUtils.lerp(a.x, b.x, t),
            y: THREE.MathUtils.lerp(a.y, b.y, t),
            nx: nx / nLen,
            nz: nz / nLen
          });
        }
      }
      return out;
    }

    for (let i = 0; i < edgeSegments.length; i++) {
      if (used[i]) continue;
      const path = resampleShorelinePath(smoothShorelinePath(traceShoreline(i)), sampleStep * 0.38);
      if (path.length < 2) continue;

      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const point of path) {
        point.wx = gridToWorldX(point.x);
        point.wz = gridToWorldZ(point.y);
        minX = Math.min(minX, point.wx);
        maxX = Math.max(maxX, point.wx);
        minZ = Math.min(minZ, point.wz);
        maxZ = Math.max(maxZ, point.wz);
      }

      paths.push({
        path,
        minX,
        maxX,
        minZ,
        maxZ,
        pathPhase: rand() * Math.PI * 2,
        waterSetback: THREE.MathUtils.lerp(0.04, 0.12, rand()),
        waveDepth: THREE.MathUtils.lerp(0.9, 1.75, rand())
      });
    }

    return paths;
  }

  function buildShorelineMist(centerX, centerZ) {
    const { heights, waterMask, seaLevel } = getState();
    clearShorelineMist();
    if (!heights || !waterMask) return;
    if (!shorelineWavePaths) shorelineWavePaths = collectShorelineWavePaths();
    if (!shorelineWavePaths || shorelineWavePaths.length === 0) return;

    const positions = [];
    const waveAcrosses = [];
    const waveAlongs = [];
    const phases = [];
    const indices = [];
    const crossSegments = 12;
    let vi = 0;
    const drawDist = SHORELINE_WAVE_DRAW_DISTANCE + SHORELINE_WAVE_BUILD_MARGIN;
    const drawDistSq = drawDist * drawDist;

    function pathNearPlayer(path) {
      const dx = centerX < path.minX ? path.minX - centerX : centerX > path.maxX ? centerX - path.maxX : 0;
      const dz = centerZ < path.minZ ? path.minZ - centerZ : centerZ > path.maxZ ? centerZ - path.maxZ : 0;
      return dx * dx + dz * dz <= drawDistSq;
    }

    function emitWaveRibbon(pathData) {
      const { path, pathPhase, waterSetback, waveDepth } = pathData;
      if (path.length < 2) return;
      const pathStart = vi;
      const rowPositions = [];

      for (let p = 0; p < path.length; p++) {
        const point = path[p];
        let nx = point.nx;
        let nz = point.nz;
        if (p > 0 && p < path.length - 1) {
          nx = (path[p - 1].nx + point.nx + path[p + 1].nx) / 3;
          nz = (path[p - 1].nz + point.nz + path[p + 1].nz) / 3;
          const nLen = Math.hypot(nx, nz) || 1;
          nx /= nLen;
          nz /= nLen;
        }
        const wx = point.wx;
        const wz = point.wz;
        const along = p / Math.max(1, path.length - 1);
        let cornerScale = 1.0;
        if (p > 0 && p < path.length - 1) {
          const ax = point.x - path[p - 1].x;
          const ay = point.y - path[p - 1].y;
          const bx = path[p + 1].x - point.x;
          const by = path[p + 1].y - point.y;
          const al = Math.hypot(ax, ay) || 1;
          const bl = Math.hypot(bx, by) || 1;
          const turn = Math.abs((ax / al) * (by / bl) - (ay / al) * (bx / bl));
          cornerScale = THREE.MathUtils.lerp(1.0, 0.42, THREE.MathUtils.clamp(turn, 0, 1));
        }

        for (let c = 0; c <= crossSegments; c++) {
          const v = c / crossSegments;
          const offset = waterSetback + v * waveDepth * cornerScale;
          rowPositions.push({
            x: wx + nx * offset,
            y: seaLevel + 0.16 + v * 0.015,
            z: wz + nz * offset
          });
          waveAcrosses.push(v);
          waveAlongs.push(along);
          phases.push(pathPhase + along * 0.65);
          vi++;
        }
      }

      const row = crossSegments + 1;
      const connectorWindows = [];
      for (let p = 2; p < path.length - 2; p++) {
        const ax = path[p].x - path[p - 1].x;
        const ay = path[p].y - path[p - 1].y;
        const bx = path[p + 1].x - path[p].x;
        const by = path[p + 1].y - path[p].y;
        const al = Math.hypot(ax, ay) || 1;
        const bl = Math.hypot(bx, by) || 1;
        const dot = (ax / al) * (bx / bl) + (ay / al) * (by / bl);
        const turn = Math.abs((ax / al) * (by / bl) - (ay / al) * (bx / bl));
        if (dot > 0.88 && turn < 0.24) continue;

        const start = Math.max(0, p - 5);
        const end = Math.min(path.length - 1, p + 5);
        const last = connectorWindows[connectorWindows.length - 1];
        if (last && start <= last.end) {
          last.end = Math.max(last.end, end);
        } else {
          connectorWindows.push({ start, end });
        }
      }

      for (const connector of connectorWindows) {
        const span = Math.max(1, connector.end - connector.start);
        for (let p = connector.start + 1; p < connector.end; p++) {
          const t = (p - connector.start) / span;
          for (let c = 0; c <= crossSegments; c++) {
            const a = rowPositions[connector.start * row + c];
            const b = rowPositions[connector.end * row + c];
            const target = rowPositions[p * row + c];
            target.x = THREE.MathUtils.lerp(a.x, b.x, t);
            target.y = THREE.MathUtils.lerp(a.y, b.y, t);
            target.z = THREE.MathUtils.lerp(a.z, b.z, t);
          }
        }
      }

      for (const p of rowPositions) {
        positions.push(p.x, p.y, p.z);
      }

      for (let p = 0; p < path.length - 1; p++) {
        for (let c = 0; c < crossSegments; c++) {
          const a = pathStart + p * row + c;
          const b = a + 1;
          const d = pathStart + (p + 1) * row + c;
          const e = d + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
    }

    for (const pathData of shorelineWavePaths) {
      if (pathNearPlayer(pathData)) emitWaveRibbon(pathData);
    }

    if (positions.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('waveAcross', new THREE.Float32BufferAttribute(waveAcrosses, 1));
    geo.setAttribute('waveAlong', new THREE.Float32BufferAttribute(waveAlongs, 1));
    geo.setAttribute('mistPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    shorelineMistUniforms = { uTime: { value: 0 } };
    shorelineMistMesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: shorelineMistUniforms,
        vertexShader: `
          attribute float waveAcross;
          attribute float waveAlong;
          attribute float mistPhase;
          varying float vWaveAcross;
          varying float vWaveAlong;
          varying float vMistPhase;
          void main() {
            vWaveAcross = waveAcross;
            vWaveAlong = waveAlong;
            vMistPhase = mistPhase;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying float vWaveAcross;
          varying float vWaveAlong;
          varying float vMistPhase;
          void main() {
            float cycle = abs(fract(uTime * 0.28 + vMistPhase * 0.15915494) * 2.0 - 1.0);
            float crestCenter = mix(0.94, 0.01, cycle);
            float crest = 1.0 - smoothstep(0.0, 0.075, abs(vWaveAcross - crestCenter));
            float shoreFade = smoothstep(0.015, 0.08, vWaveAcross);
            float farFade = 1.0 - smoothstep(0.72, 1.0, vWaveAcross);
            float piece = fract(vWaveAlong * 18.0 + vMistPhase * 0.618);
            float broken = smoothstep(0.06, 0.14, piece) * (1.0 - smoothstep(0.66, 0.82, piece));
            float alpha = crest * max(shoreFade, 0.28) * farFade * broken;
            gl_FragColor = vec4(0.92, 0.97, 1.0, alpha);
          }
        `,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false
      })
    );
    shorelineMistMesh.renderOrder = 2;
    levelRoot.add(shorelineMistMesh);
    shorelineWaveLastBuildX = centerX;
    shorelineWaveLastBuildZ = centerZ;
  }

  function updateShorelineMist(dt, centerX, centerZ) {
    const dx = centerX - shorelineWaveLastBuildX;
    const dz = centerZ - shorelineWaveLastBuildZ;
    if (!shorelineMistMesh || dx * dx + dz * dz > SHORELINE_WAVE_REBUILD_DISTANCE * SHORELINE_WAVE_REBUILD_DISTANCE) {
      buildShorelineMist(centerX, centerZ);
    }
    if (shorelineMistUniforms) shorelineMistUniforms.uTime.value += dt;
  }

  return {
    buildWorldSeaPlane,
    clearShorelineMist,
    resetShorelineCache,
    buildShorelineMist,
    updateShorelineMist
  };
}
