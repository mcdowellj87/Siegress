import * as THREE from 'three';
import {
  FIR_HEIGHT,
  FIR_TRUNK_COLLIDER_HEIGHT_MUL,
  FIR_TRUNK_COLLIDER_RADIUS_MUL,
  FIR_TRUNK_RADIUS_BASE,
  createFirTrunkGeometry,
  getFirScaleForDiameter
} from './trees.js';

const SPIRE_HEIGHT_MUL = (2.0 * 4.0) * (2 / 3);
const SPIRE_WIDTH_MUL = Math.pow(2.0, 0.7) * 10.0;
const BEACON_PERIOD_SECONDS = 2.0;

export function createSpireSystem({ levelRoot, colliders, getMetrics, heightAtWorld }) {
  let spireGroup = null;
  let beaconCore = null;
  let beaconHalo = null;
  let beaconLights = [];
  let pulseTime = 0;

  function clear() {
    if (!spireGroup) return;
    levelRoot.remove(spireGroup);
    spireGroup.traverse((obj) => {
      obj.geometry?.dispose();
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) material.dispose();
      }
    });
    spireGroup = null;
    beaconCore = null;
    beaconHalo = null;
    beaconLights = [];
  }

  function build(marker) {
    clear();
    if (!marker) return;

    const { cell, halfW, halfH, seaLevel } = getMetrics();
    const wx = marker.cx * cell - halfW + cell * 0.5;
    const wz = marker.cy * cell - halfH + cell * 0.5;
    const baseY = Math.max(heightAtWorld(wx, wz), seaLevel);

    const scale = getFirScaleForDiameter(marker.diamPx);
    const spireHeight = FIR_HEIGHT * scale * SPIRE_HEIGHT_MUL;
    const spireWidthScale = scale * SPIRE_WIDTH_MUL;
    const spireRadius = FIR_TRUNK_RADIUS_BASE * spireWidthScale;

    spireGroup = new THREE.Group();
    spireGroup.name = 'cyan-spire';

    const spire = new THREE.Mesh(
      createFirTrunkGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0x12090b,
        roughness: 0.88,
        metalness: 0.18,
        emissive: 0x160002,
        emissiveIntensity: 0.22,
        flatShading: true
      })
    );
    spire.name = 'cyan-spire-mast';
    spire.position.set(wx, baseY + spireHeight * 0.5, wz);
    spire.scale.set(spireWidthScale, scale * SPIRE_HEIGHT_MUL, spireWidthScale);
    spireGroup.add(spire);

    const beaconY = baseY + spireHeight + Math.max(0.9, spireRadius * 0.45);
    const coreRadius = Math.max(0.9, spireRadius * 0.52);
    beaconCore = new THREE.Mesh(
      new THREE.SphereGeometry(coreRadius, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0x3a0000,
        emissive: 0xff0900,
        emissiveIntensity: 0,
        roughness: 0.32,
        metalness: 0.08
      })
    );
    beaconCore.name = 'demonic-red-beacon';
    beaconCore.position.set(wx, beaconY, wz);
    beaconCore.scale.set(0.5, 1, 0.5);
    spireGroup.add(beaconCore);

    const beaconBand = new THREE.Mesh(
      new THREE.CylinderGeometry(coreRadius * 0.58, coreRadius * 0.58, coreRadius * 0.42, 16, 1, false),
      new THREE.MeshStandardMaterial({
        color: 0x010000,
        emissive: 0x000000,
        roughness: 0.96,
        metalness: 0.05
      })
    );
    beaconBand.name = 'demonic-red-beacon-equator-band';
    beaconBand.position.copy(beaconCore.position);
    spireGroup.add(beaconBand);

    beaconHalo = new THREE.Mesh(
      new THREE.SphereGeometry(coreRadius * 1.7, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff1308,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    beaconHalo.name = 'demonic-red-beacon-halo';
    beaconHalo.position.copy(beaconCore.position);
    beaconHalo.scale.set(0.5, 1, 0.5);
    spireGroup.add(beaconHalo);

    const addBeaconBeam = (name, direction) => {
      const light = new THREE.SpotLight(0xc90000, 0, 520, Math.PI * 0.28, 0.7, 1.55);
      light.name = name;
      light.position.copy(beaconCore.position);
      light.target.position.copy(beaconCore.position).addScaledVector(direction, 12);
      spireGroup.add(light, light.target);
      beaconLights.push(light);
    };
    addBeaconBeam('demonic-red-beacon-light-up', new THREE.Vector3(0, 1, 0));
    addBeaconBeam('demonic-red-beacon-light-down', new THREE.Vector3(0, -1, 0));

    levelRoot.add(spireGroup);
    colliders.push({
      type: 'cap',
      a: new THREE.Vector3(wx, baseY + spireRadius, wz),
      b: new THREE.Vector3(wx, baseY + spireHeight * FIR_TRUNK_COLLIDER_HEIGHT_MUL, wz),
      r: spireRadius * FIR_TRUNK_COLLIDER_RADIUS_MUL,
      tag: 'spire'
    });
    pulseTime = 0;
    update(0);
  }

  function update(dt) {
    if (!beaconCore || !beaconHalo || !beaconLights.length) return;
    pulseTime = (pulseTime + dt) % BEACON_PERIOD_SECONDS;
    const phase = pulseTime / BEACON_PERIOD_SECONDS;
    const pulse = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    beaconCore.material.emissiveIntensity = 0.1 + pulse * 5.4;
    beaconHalo.material.opacity = pulse * 0.42;
    const haloPulse = 0.9 + pulse * 0.34;
    beaconHalo.scale.set(haloPulse * 0.5, haloPulse, haloPulse * 0.5);
    for (const light of beaconLights) light.intensity = pulse * 360;
  }

  return { build, clear, update };
}
