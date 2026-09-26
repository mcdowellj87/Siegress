import * as THREE from 'three';

const STORE_FOOTPRINT_SCALE = 0.62;
const FOUNDATION_MIN_DEPTH = 1.5;
const FOUNDATION_MAX_DEPTH = 5.0;
const DOOR_OPENING_ANGLE = Math.PI * 0.28;

function isMushroomStorePixel(r, g, b, a) {
  return a >= 16 && r === 0xff && g === 0x3a && b === 0x8a;
}

export function createMushroomStoreSystem({
  levelRoot,
  colliders,
  getMetrics,
  heightAtWorldRaw,
  storeHeight
}) {
  let storeGroup = null;
  let store = null;

  function clear() {
    if (storeGroup) {
      levelRoot.remove(storeGroup);
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      storeGroup.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) {
          if (!material) continue;
          materials.add(material);
          if (material.map) textures.add(material.map);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    }
    storeGroup = null;
    store = null;
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
        if (!isMushroomStorePixel(data[p], data[p + 1], data[p + 2], data[p + 3])) continue;
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
    const markerRadius = Math.max(cell * 2, Math.min(maxX - minX + 1, maxY - minY + 1) * cell * 0.5);
    const capRadius = markerRadius * STORE_FOOTPRINT_SCALE;
    const bodyRadius = capRadius * 0.56;
    const bodyHeight = storeHeight * 0.66;
    const capHeight = storeHeight - bodyHeight;
    const floorY = heightAtWorldRaw(centerX, centerZ);

    let nearbyLowY = floorY;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      nearbyLowY = Math.min(
        nearbyLowY,
        heightAtWorldRaw(
          centerX + Math.cos(angle) * bodyRadius,
          centerZ + Math.sin(angle) * bodyRadius
        )
      );
    }
    const foundationDepth = THREE.MathUtils.clamp(
      floorY - nearbyLowY + FOUNDATION_MIN_DEPTH,
      FOUNDATION_MIN_DEPTH,
      FOUNDATION_MAX_DEPTH
    );

    const group = new THREE.Group();
    group.name = 'mushroom-drug-store';

    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x3088a0,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    const doorwayHeight = bodyHeight * 0.58;
    const lowerStem = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bodyRadius * 0.95,
        bodyRadius,
        doorwayHeight + foundationDepth,
        40,
        1,
        false,
        DOOR_OPENING_ANGLE * 0.5,
        Math.PI * 2 - DOOR_OPENING_ANGLE
      ),
      stemMaterial
    );
    lowerStem.name = 'mushroom-stem-lower';
    lowerStem.position.set(
      centerX,
      floorY + doorwayHeight * 0.5 - foundationDepth * 0.5,
      centerZ
    );
    lowerStem.receiveShadow = true;
    group.add(lowerStem);

    const upperStemHeight = bodyHeight - doorwayHeight;
    const upperStem = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bodyRadius * 0.9,
        bodyRadius * 0.95,
        upperStemHeight,
        40
      ),
      stemMaterial
    );
    upperStem.name = 'mushroom-stem-upper';
    upperStem.position.set(
      centerX,
      floorY + doorwayHeight + upperStemHeight * 0.5,
      centerZ
    );
    upperStem.receiveShadow = true;
    group.add(upperStem);

    const doorwayWidth = bodyRadius * 0.82;
    const doorwayShape = new THREE.Shape();
    doorwayShape.moveTo(-doorwayWidth * 0.5, 0);
    doorwayShape.lineTo(-doorwayWidth * 0.5, doorwayHeight * 0.62);
    doorwayShape.quadraticCurveTo(-doorwayWidth * 0.5, doorwayHeight, 0, doorwayHeight);
    doorwayShape.quadraticCurveTo(doorwayWidth * 0.5, doorwayHeight, doorwayWidth * 0.5, doorwayHeight * 0.62);
    doorwayShape.lineTo(doorwayWidth * 0.5, 0);
    doorwayShape.closePath();

    const doorwayInterior = new THREE.Mesh(
      new THREE.ShapeGeometry(doorwayShape, 20),
      new THREE.MeshBasicMaterial({ color: 0x030405, side: THREE.DoubleSide })
    );
    doorwayInterior.name = 'mushroom-doorway-interior';
    doorwayInterior.position.set(centerX, floorY + 0.03, centerZ + bodyRadius * 0.12);
    group.add(doorwayInterior);

    const doorwayFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(doorwayWidth, bodyRadius * 0.92),
      new THREE.MeshBasicMaterial({ color: 0x050607, side: THREE.DoubleSide })
    );
    doorwayFloor.name = 'mushroom-doorway-floor';
    doorwayFloor.rotation.x = -Math.PI * 0.5;
    doorwayFloor.position.set(centerX, floorY + 0.04, centerZ + bodyRadius * 0.54);
    group.add(doorwayFloor);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x50a8c0,
        roughness: 0.78,
        metalness: 0.0,
        emissive: 0x0b2f3a,
        emissiveIntensity: 0.25
      })
    );
    cap.name = 'mushroom-store-cap';
    cap.position.set(centerX, floorY + bodyHeight, centerZ);
    cap.scale.set(capRadius, capHeight, capRadius);
    cap.receiveShadow = true;
    group.add(cap);

    const undersideHeight = Math.max(0.8, capHeight * 0.14);
    const underside = new THREE.Mesh(
      new THREE.CylinderGeometry(capRadius * 0.76, capRadius * 0.94, undersideHeight, 48),
      new THREE.MeshStandardMaterial({ color: 0x386f80, roughness: 0.95 })
    );
    underside.name = 'mushroom-store-cap-underside';
    underside.position.set(centerX, floorY + bodyHeight - undersideHeight * 0.5, centerZ);
    group.add(underside);

    colliders.push({
      type: 'mushroom-cap',
      center: new THREE.Vector3(centerX, floorY + bodyHeight, centerZ),
      radius: capRadius,
      height: capHeight,
      tag: 'mushroom-cap'
    });

    levelRoot.add(group);
    storeGroup = group;
    store = { centerX, centerZ, floorY, capRadius, bodyRadius, height: storeHeight, pixelCount };
  }

  return {
    buildFromBitmap,
    clear,
    get state() {
      return store ? { ...store } : null;
    }
  };
}
