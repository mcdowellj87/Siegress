import * as THREE from 'three';

export function createFollowCameraSystem({
  canvas,
  camera,
  playerScale,
  playerEyeHeight,
  heightAtWorld
}) {
  let viewMode = 'third';
  let canLock = false;
  let isLocked = false;
  let yaw = -THREE.MathUtils.degToRad(30);
  let pitch = 0;

  const mouseSens = 0.0022;
  const pitchMin = THREE.MathUtils.degToRad(-80);
  const pitchMax = THREE.MathUtils.degToRad(80);

  const thirdCamZoomFactor = 0.025;
  let thirdCamBack = 9.0 * playerScale * thirdCamZoomFactor;
  const thirdCamUp = 5.0 * playerScale * thirdCamZoomFactor;
  const thirdLookUp = 1.8 * playerScale * thirdCamZoomFactor;

  const camTarget = new THREE.Vector3();
  const desiredCam = new THREE.Vector3();
  const boomStart = new THREE.Vector3();
  const boomEnd = new THREE.Vector3();

  function applyRotation(rotationYaw = yaw) {
    camera.rotation.set(pitch, rotationYaw, 0, 'YXZ');
  }

  function enablePointerLock() {
    canLock = true;
  }

  function lockPointer() {
    if (!canLock) return;
    if (!document.pointerLockElement) canvas.requestPointerLock();
  }

  function relockPointer() {
    if (!canLock || document.pointerLockElement) return;
    try { canvas.requestPointerLock(); } catch { }
  }

  canvas.addEventListener('click', lockPointer);

  document.addEventListener('pointerlockchange', () => {
    isLocked = (document.pointerLockElement === canvas);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    yaw -= e.movementX * mouseSens;
    const pitchDirection = viewMode === 'first' ? -1 : 1;
    pitch += e.movementY * mouseSens * pitchDirection;
    pitch = THREE.MathUtils.clamp(pitch, pitchMin, pitchMax);
  });

  function toggleViewMode() {
    viewMode = (viewMode === 'third') ? 'first' : 'third';
    return viewMode;
  }

  function setViewMode(mode) {
    if (mode !== 'first' && mode !== 'third') return viewMode;
    viewMode = mode;
    return viewMode;
  }

  function updateFollowCamera({
    dt,
    playerPos,
    firstPersonEyeY,
    noclipEnabled
  }) {
    if (viewMode === 'first') {
      applyRotation(yaw + Math.PI);
      camera.position.set(playerPos.x, firstPersonEyeY, playerPos.z);
      return;
    }

    applyRotation();
    const playerFootY = playerPos.y - playerEyeHeight;

    camTarget.set(
      playerPos.x,
      playerFootY + thirdLookUp,
      playerPos.z
    );

    const pitchLift = Math.sin(pitch) * 0.4 * playerScale;
    const up = thirdCamUp + pitchLift;

    boomStart.set(playerPos.x, camTarget.y, playerPos.z);
    boomEnd.set(
      playerPos.x - Math.sin(yaw) * thirdCamBack,
      playerFootY + up,
      playerPos.z - Math.cos(yaw) * thirdCamBack
    );
    desiredCam.copy(boomEnd);

    if (!noclipEnabled) {
      const camGroundPadding = 0.65;
      const endGround = heightAtWorld(desiredCam.x, desiredCam.z) + camGroundPadding;
      if (desiredCam.y < endGround) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 8; i++) {
          const t = (lo + hi) * 0.5;
          desiredCam.lerpVectors(boomStart, boomEnd, t);
          const groundY = heightAtWorld(desiredCam.x, desiredCam.z) + camGroundPadding;
          if (desiredCam.y < groundY) hi = t;
          else lo = t;
        }
        desiredCam.lerpVectors(boomStart, boomEnd, lo);
      }
    }

    camera.position.lerp(desiredCam, 1.0 - Math.pow(0.000001, dt));
    camera.lookAt(camTarget);
  }

  return {
    enablePointerLock,
    relockPointer,
    toggleViewMode,
    setViewMode,
    updateFollowCamera,
    get isLocked() {
      return isLocked;
    },
    get viewMode() {
      return viewMode;
    },
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    }
  };
}
