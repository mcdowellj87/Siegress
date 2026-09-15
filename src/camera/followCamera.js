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

  function applyRotation() {
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
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
    pitch += e.movementY * mouseSens;
    pitch = THREE.MathUtils.clamp(pitch, pitchMin, pitchMax);
  });

  function toggleViewMode() {
    viewMode = (viewMode === 'third') ? 'first' : 'third';
    return viewMode;
  }

  function updateFollowCamera({
    dt,
    playerPos,
    noclipEnabled
  }) {
    applyRotation();

    if (viewMode === 'first') {
      camera.position.set(playerPos.x, playerPos.y, playerPos.z);
      return;
    }

    camTarget.set(
      playerPos.x,
      noclipEnabled ? playerPos.y - playerEyeHeight + thirdLookUp : heightAtWorld(playerPos.x, playerPos.z) + thirdLookUp,
      playerPos.z
    );

    const pitchLift = Math.sin(pitch) * 0.4 * playerScale;
    const up = thirdCamUp + pitchLift;

    boomStart.set(playerPos.x, camTarget.y, playerPos.z);
    boomEnd.set(
      playerPos.x - Math.sin(yaw) * thirdCamBack,
      noclipEnabled ? playerPos.y - playerEyeHeight + up : heightAtWorld(playerPos.x, playerPos.z) + up,
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
