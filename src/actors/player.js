import * as THREE from 'three';

export function createPlayerAvatarSystem({
  scene,
  loader,
  idleUrl,
  walkUrl,
  runUrl,
  defaultCharacterRadius,
  playerCapsuleH,
  playerRadius,
  safeLoad,
  applyCharacterShading,
  measuredCharacterRadius,
  makeCharacterToonPhongMaterial,
  getObscurePlayerModel
}) {
  const root = new THREE.Group();
  scene.add(root);

  const fallbackScale = 0.03;

  let walk = null;
  let run = null;
  let idle = null;
  let walkMixer = null;
  let runMixer = null;
  let idleMixer = null;
  let walkAction = null;
  let runAction = null;
  let idleAction = null;
  let fallbackBuilt = false;
  let characterRadius = defaultCharacterRadius;

  function removeObjectTree(objRoot) {
    if (!objRoot) return;
    objRoot.parent?.remove(objRoot);
    objRoot.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) mat.dispose();
      }
    });
  }

  function clearModel() {
    removeObjectTree(idle);
    removeObjectTree(walk);
    removeObjectTree(run);

    idle = null;
    walk = null;
    run = null;
    idleMixer = null;
    walkMixer = null;
    runMixer = null;
    idleAction = null;
    walkAction = null;
    runAction = null;
    fallbackBuilt = false;
  }

  function makeFallbackPrism() {
    const bodyH = (playerCapsuleH + (playerRadius * 2.0));
    const bodyW = (playerRadius * 2.0) * 1.05;
    const bodyD = (playerRadius * 2.0) * 0.85;

    const geo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
    const mat = makeCharacterToonPhongMaterial(0x000000);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.position.y = bodyH * 0.5;

    const group = new THREE.Group();
    group.add(mesh);
    group.scale.setScalar(fallbackScale);
    return group;
  }

  function ensureReady() {
    if (walk || run || idle || fallbackBuilt) return;

    idle = makeFallbackPrism();
    walk = makeFallbackPrism();
    run = makeFallbackPrism();

    idle.visible = true;
    walk.visible = false;
    run.visible = false;

    root.add(idle);
    root.add(walk);
    root.add(run);

    idleMixer = null;
    walkMixer = null;
    runMixer = null;
    idleAction = null;
    walkAction = null;
    runAction = null;

    fallbackBuilt = true;
  }

  function useFallbackModel() {
    clearModel();
    ensureReady();
    characterRadius = measuredCharacterRadius(idle || walk || run, defaultCharacterRadius);
  }

  async function loadModel() {
    if (getObscurePlayerModel()) {
      useFallbackModel();
      return;
    }

    let nextIdle = null;
    let nextWalk = null;
    let nextRun = null;
    let nextIdleMixer = null;
    let nextWalkMixer = null;
    let nextRunMixer = null;
    let nextIdleAction = null;
    let nextWalkAction = null;
    let nextRunAction = null;

    const [gltfIdle, gltfWalk, gltfRun] = await Promise.all([
      safeLoad('player idle GLB', idleUrl, (u) => loader.loadAsync(u)),
      safeLoad('player walk GLB', walkUrl, (u) => loader.loadAsync(u)),
      safeLoad('player run GLB', runUrl, (u) => loader.loadAsync(u)),
    ]);

    if (gltfIdle && gltfIdle.scene) {
      nextIdle = gltfIdle.scene;
      applyCharacterShading(nextIdle);
      nextIdle.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      nextIdle.visible = true;

      nextIdleMixer = new THREE.AnimationMixer(nextIdle);
      if (gltfIdle.animations && gltfIdle.animations.length) {
        nextIdleAction = nextIdleMixer.clipAction(gltfIdle.animations[0]);
        nextIdleAction.play();
      }
    }

    if (gltfWalk && gltfWalk.scene) {
      nextWalk = gltfWalk.scene;
      applyCharacterShading(nextWalk);
      nextWalk.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      nextWalk.visible = !nextIdle;

      nextWalkMixer = new THREE.AnimationMixer(nextWalk);
      if (gltfWalk.animations && gltfWalk.animations.length) {
        nextWalkAction = nextWalkMixer.clipAction(gltfWalk.animations[0]);
        nextWalkAction.play();
      }
    }

    if (gltfRun && gltfRun.scene) {
      nextRun = gltfRun.scene;
      applyCharacterShading(nextRun);
      nextRun.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      nextRun.visible = false;

      nextRunMixer = new THREE.AnimationMixer(nextRun);
      if (gltfRun.animations && gltfRun.animations.length) {
        nextRunAction = nextRunMixer.clipAction(gltfRun.animations[0]);
        nextRunAction.play();
      }
    }

    if (getObscurePlayerModel()) {
      removeObjectTree(nextIdle);
      removeObjectTree(nextWalk);
      removeObjectTree(nextRun);
      return;
    }

    if (!nextIdle && !nextWalk && !nextRun) {
      useFallbackModel();
      return;
    }

    clearModel();

    idle = nextIdle;
    walk = nextWalk;
    run = nextRun;
    idleMixer = nextIdleMixer;
    walkMixer = nextWalkMixer;
    runMixer = nextRunMixer;
    idleAction = nextIdleAction;
    walkAction = nextWalkAction;
    runAction = nextRunAction;

    if (idle) root.add(idle);
    if (walk) root.add(walk);
    if (run) root.add(run);

    characterRadius = measuredCharacterRadius(idle || walk || run, defaultCharacterRadius);
  }

  function setMode(isRunning, moving) {
    ensureReady();
    if (!walk || !run) return;

    const hasIdle = !!idle;

    if (!moving) {
      if (hasIdle) {
        idle.visible = true;
        walk.visible = false;
        run.visible = false;
      } else {
        walk.visible = true;
        run.visible = false;
      }
      return;
    }

    if (hasIdle) idle.visible = false;
    walk.visible = !isRunning;
    run.visible = isRunning;
  }

  function setVisible(vis) {
    root.visible = vis;
  }

  function updateMixers(dt) {
    if (idleMixer && idle && idle.visible) idleMixer.update(dt);
    if (walkMixer && walk && walk.visible) walkMixer.update(dt);
    if (runMixer && run && run.visible) runMixer.update(dt);
  }

  return {
    root,
    ensureReady,
    loadModel,
    setMode,
    setVisible,
    updateMixers,
    get characterRadius() {
      return characterRadius;
    }
  };
}
