import * as THREE from 'three';

const CHERENKOV_BLUE = 0x3de8ff;
const EVENT_INTERVAL_S = 20.0;
const EVENT_DURATION_S = 5.6;

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const c = size * 0.5;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.12, 'rgba(176, 250, 255, 1.0)');
  g.addColorStop(0.42, 'rgba(61, 232, 255, 0.42)');
  g.addColorStop(1.0, 'rgba(61, 232, 255, 0.0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createSkyAnomalySystem({ scene, skyRadius }) {
  const texture = makeGlowTexture();
  const light = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: CHERENKOV_BLUE,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  }));
  light.scale.set(360, 360, 1);
  light.renderOrder = 1;
  scene.add(light);

  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: CHERENKOV_BLUE,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  }));
  flare.scale.set(1200, 1200, 1);
  flare.renderOrder = 1;
  scene.add(flare);

  const start = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const end = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  let nextEventT = EVENT_INTERVAL_S;
  let eventT = EVENT_DURATION_S;
  let active = false;
  let seed = 0;

  function setOpacity(opacity) {
    light.material.opacity = opacity;
    flare.material.opacity = opacity * 0.38;
  }

  function buildPath() {
    seed++;
    const horizonRadius = skyRadius * 0.82;
    const horizonY = skyRadius * 0.035;
    const climb = THREE.MathUtils.lerp(skyRadius * 0.18, skyRadius * 0.28, ((seed * 37) % 100) / 100);
    const run = skyRadius * 0.42;
    const angle = (seed * 2.399963229728653) % (Math.PI * 2);
    const turnSign = seed % 2 === 0 ? 1 : -1;

    const radial = tmp.set(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x).multiplyScalar(turnSign);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(turnSign);

    start.set(radial.x * horizonRadius, horizonY, radial.z * horizonRadius);
    corner.copy(start).addScaledVector(tangent, run).addScaledVector(tmp.set(0, 1, 0), climb);

    const tangentCarry = (climb * climb) / run;
    end.copy(corner)
      .addScaledVector(side, run)
      .addScaledVector(tangent, tangentCarry)
      .addScaledVector(tmp.set(0, 1, 0), -climb);
  }

  function spawn() {
    buildPath();
    eventT = 0;
    active = true;
  }

  function update(dt) {
    if (!active) {
      nextEventT -= dt;
      if (nextEventT <= 0) spawn();
      return;
    }

    eventT += dt;
    const t = eventT / EVENT_DURATION_S;
    if (t >= 1) {
      active = false;
      nextEventT = Math.max(0, EVENT_INTERVAL_S - eventT);
      setOpacity(0);
      return;
    }

    const firstLegT = 0.52;
    if (t < firstLegT) {
      tmp.copy(start).lerp(corner, t / firstLegT);
    } else {
      tmp.copy(corner).lerp(end, (t - firstLegT) / (1 - firstLegT));
    }

    const edgeFade = Math.min(1, t / 0.08, (1 - t) / 0.12);
    const pulse = 0.84 + Math.sin(eventT * 38.0) * 0.16;
    setOpacity(edgeFade * pulse);
    light.position.copy(tmp);
    flare.position.copy(tmp);
  }

  return { update, spawn };
}
