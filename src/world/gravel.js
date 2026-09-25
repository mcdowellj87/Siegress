import * as THREE from 'three';

export const GRAVEL_COLOR_HEX = 0x3f424b;

const GRAVEL_RGB = [0x3f, 0x42, 0x4b];
const SAVE_URL = '/__siegress/save-map';
const SAVE_DELAY_MS = 180;
const OVERLAY_LIFT = 0.08;
const UNDO_LIMIT = 4096;

function isGravelPixel(r, g, b, a) {
  return a >= 16 &&
    Math.abs(r - GRAVEL_RGB[0]) <= 2 &&
    Math.abs(g - GRAVEL_RGB[1]) <= 2 &&
    Math.abs(b - GRAVEL_RGB[2]) <= 2;
}

function isPaintableTerrainPixel(r, g, b, a) {
  if (a < 16) return false;
  return isGravelPixel(r, g, b, a) || (g > r + 20 && g > b + 20);
}

function scatterHash(x, y, seed) {
  let value = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y - seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function createGravelSystem({ levelRoot, getMetrics, isWaterAtWorld }) {
  let mapCanvas = null;
  let mapContext = null;
  let maskCanvas = null;
  let maskContext = null;
  let maskTexture = null;
  let overlayMesh = null;
  let lastStampX = null;
  let lastStampZ = null;
  let saveTimer = 0;
  let saveVersion = 0;
  let savedVersion = 0;
  let saveInFlight = false;
  let stampSeed = 0;
  const undoStack = [];

  function disposeOverlay() {
    if (overlayMesh) {
      overlayMesh.parent?.remove(overlayMesh);
      overlayMesh.geometry.dispose();
      overlayMesh.material.dispose();
      overlayMesh = null;
    }
    if (maskTexture) {
      maskTexture.dispose();
      maskTexture = null;
    }
  }

  function buildMask(sourcePixels, width, height) {
    maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });

    const mask = maskContext.createImageData(width, height);
    for (let i = 0; i < sourcePixels.length; i += 4) {
      if (!isGravelPixel(sourcePixels[i], sourcePixels[i + 1], sourcePixels[i + 2], sourcePixels[i + 3])) continue;
      mask.data[i] = GRAVEL_RGB[0];
      mask.data[i + 1] = GRAVEL_RGB[1];
      mask.data[i + 2] = GRAVEL_RGB[2];
      mask.data[i + 3] = 255;
    }
    maskContext.putImageData(mask, 0, 0);
  }

  function initialize({ sourceCanvas, sourceContext, sourcePixels, terrainMesh }) {
    disposeOverlay();
    mapCanvas = sourceCanvas;
    mapContext = sourceContext;
    lastStampX = null;
    lastStampZ = null;
    stampSeed = 0;
    undoStack.length = 0;

    const { mapW, mapH } = getMetrics();
    buildMask(sourcePixels, mapW, mapH);

    maskTexture = new THREE.CanvasTexture(maskCanvas);
    maskTexture.colorSpace = THREE.SRGBColorSpace;
    maskTexture.minFilter = THREE.NearestFilter;
    maskTexture.magFilter = THREE.NearestFilter;
    maskTexture.generateMipmaps = false;

    const geometry = terrainMesh.geometry.clone();
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, positions.getY(i) + OVERLAY_LIFT);
    }
    positions.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: maskTexture,
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      fog: true
    });

    overlayMesh = new THREE.Mesh(geometry, material);
    overlayMesh.name = 'gravel-overlay';
    overlayMesh.renderOrder = 2;
    levelRoot.add(overlayMesh);
  }

  function canvasToPngBlob() {
    return new Promise((resolve, reject) => {
      mapCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode map canvas as PNG.'));
      }, 'image/png');
    });
  }

  async function persistMap() {
    if (!mapCanvas || saveInFlight || savedVersion >= saveVersion) return;
    saveInFlight = true;
    const versionBeingSaved = saveVersion;

    try {
      const png = await canvasToPngBlob();
      const response = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: png
      });
      if (!response.ok) throw new Error(`Map save failed (${response.status}).`);
      savedVersion = versionBeingSaved;
    } catch (error) {
      console.error('[gravel] map save failed:', error);
    } finally {
      saveInFlight = false;
      if (savedVersion < saveVersion && savedVersion === versionBeingSaved) scheduleSave();
    }
  }

  function scheduleSave(delay = SAVE_DELAY_MS) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      persistMap();
    }, delay);
  }

  function markMapDirty() {
    saveVersion++;
    scheduleSave();
  }

  function stampAtWorld(worldX, worldZ, stampSizeM) {
    if (!mapContext || !maskContext || isWaterAtWorld(worldX, worldZ)) return false;

    const { mapW, mapH, cell, halfW, halfH } = getMetrics();
    const centerX = (worldX + halfW) / cell;
    const centerY = (worldZ + halfH) / cell;
    const sizePixels = Math.max(3, Math.ceil(stampSizeM / cell));
    const x = Math.max(0, Math.floor(centerX - sizePixels * 0.5));
    const y = Math.max(0, Math.floor(centerY - sizePixels * 0.5));
    const width = Math.min(sizePixels, mapW - x);
    const height = Math.min(sizePixels, mapH - y);
    if (width <= 0 || height <= 0) return false;

    const mapPatch = mapContext.getImageData(x, y, width, height);
    const maskPatch = maskContext.getImageData(x, y, width, height);
    const pixelsBeforeStamp = new Uint8ClampedArray(mapPatch.data);
    const seed = ++stampSeed;
    let changed = false;

    for (let pixelY = 0; pixelY < height; pixelY++) {
      for (let pixelX = 0; pixelX < width; pixelX++) {
        const half = sizePixels * 0.5;
        const nx = Math.abs((pixelX + 0.5 - half) / half);
        const ny = Math.abs((pixelY + 0.5 - half) / half);
        const edgeDistance = Math.max(nx, ny);
        const edgeChance = THREE.MathUtils.clamp(1.0 - ((edgeDistance - 0.5) / 0.5) * 0.72, 0.28, 1.0);
        const isCore = edgeDistance <= 0.5;
        if (!isCore && scatterHash(x + pixelX, y + pixelY, seed) > edgeChance) continue;

        const i = (pixelY * width + pixelX) * 4;
        const r = mapPatch.data[i];
        const g = mapPatch.data[i + 1];
        const b = mapPatch.data[i + 2];
        const a = mapPatch.data[i + 3];
        if (!isPaintableTerrainPixel(r, g, b, a)) continue;

        if (!isGravelPixel(r, g, b, a)) changed = true;
        mapPatch.data[i] = GRAVEL_RGB[0];
        mapPatch.data[i + 1] = GRAVEL_RGB[1];
        mapPatch.data[i + 2] = GRAVEL_RGB[2];
        mapPatch.data[i + 3] = 255;
        maskPatch.data[i] = GRAVEL_RGB[0];
        maskPatch.data[i + 1] = GRAVEL_RGB[1];
        maskPatch.data[i + 2] = GRAVEL_RGB[2];
        maskPatch.data[i + 3] = 255;
      }
    }

    if (!changed) return false;
    mapContext.putImageData(mapPatch, x, y);
    maskContext.putImageData(maskPatch, x, y);
    maskTexture.needsUpdate = true;
    undoStack.push({ x, y, width, height, pixels: pixelsBeforeStamp });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    return true;
  }

  function undoLastStamp() {
    if (!mapContext || !maskContext || !undoStack.length) return false;

    const stamp = undoStack.pop();
    const restoredMap = mapContext.createImageData(stamp.width, stamp.height);
    restoredMap.data.set(stamp.pixels);
    const restoredMask = maskContext.createImageData(stamp.width, stamp.height);

    for (let i = 0; i < stamp.pixels.length; i += 4) {
      if (!isGravelPixel(stamp.pixels[i], stamp.pixels[i + 1], stamp.pixels[i + 2], stamp.pixels[i + 3])) continue;
      restoredMask.data[i] = GRAVEL_RGB[0];
      restoredMask.data[i + 1] = GRAVEL_RGB[1];
      restoredMask.data[i + 2] = GRAVEL_RGB[2];
      restoredMask.data[i + 3] = 255;
    }

    mapContext.putImageData(restoredMap, stamp.x, stamp.y);
    maskContext.putImageData(restoredMask, stamp.x, stamp.y);
    maskTexture.needsUpdate = true;
    markMapDirty();
    return true;
  }

  function updateStroke(worldX, worldZ, stampSizeM) {
    const spacing = Math.max(0.5, stampSizeM * 0.45);
    let changed = false;

    if (lastStampX === null || lastStampZ === null) {
      lastStampX = worldX;
      lastStampZ = worldZ;
      changed = stampAtWorld(worldX, worldZ, stampSizeM);
    } else {
      let dx = worldX - lastStampX;
      let dz = worldZ - lastStampZ;
      let distance = Math.hypot(dx, dz);

      while (distance >= spacing) {
        lastStampX += (dx / distance) * spacing;
        lastStampZ += (dz / distance) * spacing;
        changed = stampAtWorld(lastStampX, lastStampZ, stampSizeM) || changed;
        dx = worldX - lastStampX;
        dz = worldZ - lastStampZ;
        distance = Math.hypot(dx, dz);
      }
    }

    if (changed) markMapDirty();
  }

  function endStroke() {
    lastStampX = null;
    lastStampZ = null;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      persistMap();
    }
  }

  function setVisible(visible) {
    if (overlayMesh) overlayMesh.visible = visible;
  }

  return { initialize, updateStroke, endStroke, undoLastStamp, setVisible };
}
