import * as THREE from 'three';

export function createMonsterSystem({
  scene,
  loader,
  idleUrl,
  walkUrl,
  bodyRadius,
  defaultCharacterRadius,
  safeLoad,
  applyCharacterShading,
  measuredCharacterRadius,
  getSpawnRegion,
  getPlayerPos,
  getPlayerCharacterRadius,
  getCameraYaw,
  getWorldBounds,
  getSeaLevel,
  heightAtWorld,
  isWaterAtWorld,
  colliderSystem
}) {
  const root = new THREE.Group();
  scene.add(root);

  let idle = null;
  let walk = null;
  let idleMixer = null;
  let walkMixer = null;
  let idleAction = null;
  let walkAction = null;
  let loaded = false;
  let characterRadius = defaultCharacterRadius;
  let pickTimer = 0;
  let randState = 0x51f15e;

  const target = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function rand() {
    randState += 0x6D2B79F5;
    let x = Math.imul(randState ^ (randState >>> 15), 1 | randState);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function placeNextToPlayer() {
    const playerPos = getPlayerPos();
    const spawnRegion = getSpawnRegion();
    const { halfW, halfH } = getWorldBounds();
    const seaLevel = getSeaLevel();
    const spawn = spawnRegion?.monster || { x: playerPos.x + 5.5, z: playerPos.z + 4.0 };
    const x = THREE.MathUtils.clamp(spawn.x, -halfW + 1, halfW - 1);
    const z = THREE.MathUtils.clamp(spawn.z, -halfH + 1, halfH - 1);
    const y = Math.max(heightAtWorld(x, z), seaLevel);
    root.position.set(x, y, z);
    root.rotation.set(0, getCameraYaw() + Math.PI * 0.25, 0);
    target.copy(root.position);
    pickTimer = 0.25;
  }

  function pickTarget() {
    const playerPos = getPlayerPos();
    const { halfW, halfH } = getWorldBounds();
    const seaLevel = getSeaLevel();

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = rand() * Math.PI * 2;
      const radius = THREE.MathUtils.lerp(7.0, 26.0, rand());
      const x = THREE.MathUtils.clamp(playerPos.x + Math.cos(angle) * radius, -halfW + 1, halfW - 1);
      const z = THREE.MathUtils.clamp(playerPos.z + Math.sin(angle) * radius, -halfH + 1, halfH - 1);
      if (!isWaterAtWorld(x, z)) {
        target.set(x, Math.max(heightAtWorld(x, z), seaLevel), z);
        pickTimer = THREE.MathUtils.lerp(3.0, 7.0, rand());
        return;
      }
    }
    target.copy(root.position);
    pickTimer = 2.0;
  }

  function setWalking(walking) {
    if (idle) idle.visible = !walking;
    if (walk) walk.visible = walking;
  }

  async function loadModel() {
    if (loaded) return;
    loaded = true;

    const gltfIdle = await safeLoad('monster idle GLB', idleUrl, (u) => loader.loadAsync(u));
    if (gltfIdle && gltfIdle.scene) {
      idle = gltfIdle.scene;
      applyCharacterShading(idle);
      idle.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      idle.visible = false;
      root.add(idle);
      idleMixer = new THREE.AnimationMixer(idle);
      if (gltfIdle.animations && gltfIdle.animations.length) {
        idleAction = idleMixer.clipAction(gltfIdle.animations[0]);
        idleAction.play();
      }
    }

    const gltfWalk = await safeLoad('monster walking GLB', walkUrl, (u) => loader.loadAsync(u));
    if (gltfWalk && gltfWalk.scene) {
      walk = gltfWalk.scene;
      applyCharacterShading(walk);
      walk.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      walk.visible = true;
      root.add(walk);
      walkMixer = new THREE.AnimationMixer(walk);
      if (gltfWalk.animations && gltfWalk.animations.length) {
        walkAction = walkMixer.clipAction(gltfWalk.animations[0]);
        walkAction.play();
      }
    }

    root.visible = !!(idle || walk);
    characterRadius = measuredCharacterRadius(idle || walk, defaultCharacterRadius);
    placeNextToPlayer();
    pickTarget();
  }

  function resolvePlayerCollision(playerPos, playerCharacterRadius) {
    return colliderSystem.resolvePlayerMonsterCollision({
      monsterRoot: root,
      playerPos,
      playerCharacterRadius,
      monsterCharacterRadius: characterRadius
    });
  }

  function update(dt) {
    if (!root.visible) return;

    const { halfW, halfH } = getWorldBounds();
    const seaLevel = getSeaLevel();
    pickTimer -= dt;

    const dx = target.x - root.position.x;
    const dz = target.z - root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35 || pickTimer <= 0) pickTarget();

    const tx = target.x - root.position.x;
    const tz = target.z - root.position.z;
    const d = Math.hypot(tx, tz);
    const walking = d > 0.45;
    setWalking(walking);

    if (walking) {
      dir.set(tx / d, 0, tz / d);
      const step = Math.min(d, 2.4 * dt);
      root.position.x += dir.x * step;
      root.position.z += dir.z * step;
      if (colliderSystem.resolveTreeCircleCollisions(root.position, bodyRadius)) {
        pickTimer = Math.min(pickTimer, 0.35);
      }
      if (resolvePlayerCollision(getPlayerPos(), getPlayerCharacterRadius())) {
        pickTimer = Math.min(pickTimer, 0.45);
      }
      root.position.x = THREE.MathUtils.clamp(root.position.x, -halfW + 1, halfW - 1);
      root.position.z = THREE.MathUtils.clamp(root.position.z, -halfH + 1, halfH - 1);
      root.position.y = Math.max(heightAtWorld(root.position.x, root.position.z), seaLevel);
      root.rotation.y = Math.atan2(dir.x, dir.z);
    }

    if (idleMixer && idle && idle.visible) idleMixer.update(dt);
    if (walkMixer && walk && walk.visible) walkMixer.update(dt);
  }

  return {
    root,
    loadModel,
    placeNextToPlayer,
    pickTarget,
    resolvePlayerCollision,
    update,
    get characterRadius() {
      return characterRadius;
    }
  };
}
