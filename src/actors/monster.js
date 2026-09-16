import * as THREE from 'three';

export function createMonsterSystem({
  scene,
  camera,
  loader,
  idleUrl,
  walkUrl,
  runUrl,
  bodyRadius,
  defaultCharacterRadius,
  safeLoad,
  applyCharacterShading,
  measuredCharacterRadius,
  makeCharacterToonPhongMaterial,
  getSpawnRegion,
  getPlayerPos,
  getPlayerCharacterRadius,
  getCameraYaw,
  getWorldBounds,
  getSeaLevel,
  heightAtWorld,
  isWaterAtWorld,
  getSightOccluders,
  colliderSystem
}) {
  const root = new THREE.Group();
  scene.add(root);

  let idle = null;
  let walk = null;
  let run = null;
  let idleMixer = null;
  let walkMixer = null;
  let idleAction = null;
  let walkAction = null;
  let runMixer = null;
  let runAction = null;
  let fallback = null;
  let loaded = false;
  let characterRadius = defaultCharacterRadius;
  let pickTimer = 0;
  let mushroomLureActive = false;
  let mushroomLureTimer = 0;
  let pendingMushroomAmbush = false;
  let pursuitLostTimer = 0;
  let wasTrackingPlayer = false;
  let randState = 0x51f15e;

  const PLAYER_DETECTION_RADIUS = 18;
  const PLAYER_LOST_RADIUS = 25;
  const WANDER_SPEED = 2.4;
  const PURSUIT_SPEED = 6.4;
  const PURSUIT_MEMORY_SECONDS = 2.5;

  const target = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const sightPoint = new THREE.Vector3();
  const projectedSightPoint = new THREE.Vector3();
  const sightDirection = new THREE.Vector3();
  const sightRaycaster = new THREE.Raycaster();

  function makeFallbackPrism() {
    const bodyH = 2.2;
    const bodyW = Math.max(0.45, defaultCharacterRadius * 1.35);
    const bodyD = Math.max(0.38, defaultCharacterRadius * 1.0);

    const geo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
    const mat = makeCharacterToonPhongMaterial(0x121212);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.position.y = bodyH * 0.5;

    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }

  function useFallbackModel() {
    if (fallback) return;
    fallback = makeFallbackPrism();
    idle = fallback;
    walk = fallback;
    root.add(fallback);
    characterRadius = measuredCharacterRadius(fallback, defaultCharacterRadius);
  }

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

  function setMovementState(state) {
    if (idle && idle === walk) {
      idle.visible = state !== 'run';
      if (run) run.visible = state === 'run';
      return;
    }
    if (idle) idle.visible = state === 'idle';
    if (walk) walk.visible = state === 'walk';
    if (run) run.visible = state === 'run';
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

    const gltfRun = await safeLoad('monster running GLB', runUrl, (u) => loader.loadAsync(u));
    if (gltfRun && gltfRun.scene) {
      run = gltfRun.scene;
      applyCharacterShading(run);
      run.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      run.visible = false;
      root.add(run);
      runMixer = new THREE.AnimationMixer(run);
      if (gltfRun.animations && gltfRun.animations.length) {
        runAction = runMixer.clipAction(gltfRun.animations[0]);
        runAction.play();
      }
    }

    if (!idle && !walk) {
      useFallbackModel();
    }

    root.visible = !!(idle || walk || run || fallback);
    characterRadius = measuredCharacterRadius(idle || walk || run, defaultCharacterRadius);
    if (pendingMushroomAmbush) beginMushroomAmbush();
    else {
      placeNextToPlayer();
      pickTarget();
    }
  }

  function setMushroomLureActive(active) {
    mushroomLureActive = !!active;
    mushroomLureTimer = mushroomLureActive ? Infinity : 0;
  }

  function triggerMushroomLure(durationSeconds = 20) {
    mushroomLureActive = true;
    mushroomLureTimer = Math.max(mushroomLureTimer, durationSeconds);
  }

  function isVisibleToPlayer() {
    if (!root.visible) return false;

    root.getWorldPosition(sightPoint);
    sightPoint.y += 1.2;
    camera.updateMatrixWorld(true);
    projectedSightPoint.copy(sightPoint).project(camera);
    if (
      projectedSightPoint.z < -1 || projectedSightPoint.z > 1 ||
      Math.abs(projectedSightPoint.x) > 1 || Math.abs(projectedSightPoint.y) > 1
    ) return false;

    sightDirection.subVectors(sightPoint, camera.position);
    const distance = sightDirection.length();
    if (distance <= 0.1) return true;

    sightDirection.multiplyScalar(1 / distance);
    sightRaycaster.set(camera.position, sightDirection);
    sightRaycaster.near = 0.1;
    sightRaycaster.far = Math.max(0.1, distance - Math.max(0.5, characterRadius));
    const occluders = getSightOccluders?.() || [];
    return sightRaycaster.intersectObjects(occluders, true).length === 0;
  }

  function beginMushroomAmbush() {
    pendingMushroomAmbush = true;
    if (!root.visible) return false;

    if (isVisibleToPlayer()) {
      pendingMushroomAmbush = false;
      const playerPos = getPlayerPos();
      target.set(playerPos.x, playerPos.y, playerPos.z);
      triggerMushroomLure(20);
      return false;
    }

    const playerPos = getPlayerPos();
    const { halfW, halfH } = getWorldBounds();
    const seaLevel = getSeaLevel();
    const yaw = getCameraYaw();
    const behindX = Math.sin(yaw);
    const behindZ = Math.cos(yaw);

    for (let attempt = 0; attempt < 24; attempt++) {
      const spread = attempt < 8
        ? THREE.MathUtils.lerp(-1.15, 1.15, rand())
        : THREE.MathUtils.lerp(-Math.PI, Math.PI, rand());
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const offsetX = behindX * cos - behindZ * sin;
      const offsetZ = behindX * sin + behindZ * cos;
      const radius = THREE.MathUtils.lerp(24, 32, rand());
      const x = THREE.MathUtils.clamp(playerPos.x + offsetX * radius, -halfW + 1, halfW - 1);
      const z = THREE.MathUtils.clamp(playerPos.z + offsetZ * radius, -halfH + 1, halfH - 1);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 22) continue;
      if (isWaterAtWorld(x, z)) continue;

      root.position.set(x, Math.max(heightAtWorld(x, z), seaLevel), z);
      pendingMushroomAmbush = false;
      target.set(playerPos.x, playerPos.y, playerPos.z);
      root.rotation.y = Math.atan2(playerPos.x - root.position.x, playerPos.z - root.position.z);
      triggerMushroomLure(20);
      return true;
    }

    pendingMushroomAmbush = false;
    placeNextToPlayer();
    triggerMushroomLure(20);
    return true;
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

    const playerPos = getPlayerPos();
    const playerDistance = Math.hypot(playerPos.x - root.position.x, playerPos.z - root.position.z);
    if (Number.isFinite(mushroomLureTimer)) {
      mushroomLureTimer = Math.max(0, mushroomLureTimer - dt);
      if (mushroomLureTimer <= 0) mushroomLureActive = false;
    }
    if (playerDistance <= PLAYER_DETECTION_RADIUS) {
      pursuitLostTimer = PURSUIT_MEMORY_SECONDS;
    } else if (playerDistance > PLAYER_LOST_RADIUS) {
      pursuitLostTimer = Math.max(0, pursuitLostTimer - dt);
    }
    const pursuing = pursuitLostTimer > 0;
    const trackingPlayer = mushroomLureActive || pursuing;

    if (wasTrackingPlayer && !trackingPlayer) pickTarget();
    wasTrackingPlayer = trackingPlayer;

    if (trackingPlayer) {
      target.set(playerPos.x, playerPos.y, playerPos.z);
    }

    const dx = target.x - root.position.x;
    const dz = target.z - root.position.z;
    const dist = Math.hypot(dx, dz);
    if (!trackingPlayer && (dist < 0.35 || pickTimer <= 0)) pickTarget();

    const tx = target.x - root.position.x;
    const tz = target.z - root.position.z;
    const d = Math.hypot(tx, tz);
    const moving = d > 0.45;
    setMovementState(moving ? (pursuing && run ? 'run' : 'walk') : 'idle');

    if (moving) {
      dir.set(tx / d, 0, tz / d);
      const speed = pursuing ? PURSUIT_SPEED : WANDER_SPEED;
      const step = Math.min(d, speed * dt);
      root.position.x += dir.x * step;
      root.position.z += dir.z * step;
      const hitTree = colliderSystem.resolveTreeCircleCollisions(root.position, bodyRadius);
      if (hitTree && !pursuing) pickTimer = Math.min(pickTimer, 0.35);
      if (resolvePlayerCollision(playerPos, getPlayerCharacterRadius())) {
        pickTimer = Math.min(pickTimer, 0.45);
      }
      root.position.x = THREE.MathUtils.clamp(root.position.x, -halfW + 1, halfW - 1);
      root.position.z = THREE.MathUtils.clamp(root.position.z, -halfH + 1, halfH - 1);
      root.position.y = Math.max(heightAtWorld(root.position.x, root.position.z), seaLevel);
      root.rotation.y = Math.atan2(dir.x, dir.z);
    }

    if (idleMixer && idle && idle.visible) idleMixer.update(dt);
    if (walkMixer && walk && walk.visible) walkMixer.update(dt);
    if (runMixer && run && run.visible) runMixer.update(dt);
  }

  return {
    root,
    loadModel,
    placeNextToPlayer,
    pickTarget,
    beginMushroomAmbush,
    isVisibleToPlayer,
    setMushroomLureActive,
    triggerMushroomLure,
    resolvePlayerCollision,
    update,
    get characterRadius() {
      return characterRadius;
    }
  };
}
