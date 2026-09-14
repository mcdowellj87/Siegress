import * as THREE from 'three';

export function makeToonRamp5(stops) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const ctx = c.getContext('2d');
  const n = 5;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = stops[i];
    const x0 = Math.floor((i / n) * c.width);
    const x1 = Math.floor(((i + 1) / n) * c.width);
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function makeToonRampWeighted(stops, weights) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const ctx = c.getContext('2d');

  const n = 5;
  let sumW = 0;
  for (let i = 0; i < n; i++) sumW += weights[i] ?? (1 / n);
  let acc = 0;

  for (let i = 0; i < n; i++) {
    const w = (weights[i] ?? (1 / n)) / Math.max(1e-6, sumW);
    const x0 = Math.floor(acc * c.width);
    acc += w;
    const x1 = Math.floor(acc * c.width);
    ctx.fillStyle = stops[i];
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeCharacterToonRamp() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const ctx = c.getContext('2d');

  const stops = ['#14141c', '#2a2a38', '#4a4a60', '#7e7ea3', '#ffffff'];
  const w = c.width / stops.length;
  for (let i = 0; i < stops.length; i++) {
    ctx.fillStyle = stops[i];
    ctx.fillRect(i * w, 0, w, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const CHARACTER_TOON_RAMP = makeCharacterToonRamp();

export const characterSunUniforms = new Set();

export function makeCharacterToonPhongMaterial(baseColor) {
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(baseColor),
    gradientMap: CHARACTER_TOON_RAMP
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBaseColor = { value: new THREE.Color(baseColor) };
    shader.uniforms.uBaseBright = { value: 1.15 };
    shader.uniforms.uMidSpecPow = { value: 18.0 };
    shader.uniforms.uHiSpecPow = { value: 85.0 };
    shader.uniforms.uMidSpecAmt = { value: 0.55 };
    shader.uniforms.uHiSpecAmt = { value: 1.25 };
    shader.uniforms.uSpecBands = { value: 3.0 };
    shader.uniforms.uSunDir = { value: new THREE.Vector3(0.55, 0.35, 0.75) };
    characterSunUniforms.add(shader.uniforms.uSunDir);

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform vec3 uBaseColor;
       uniform float uBaseBright;
       uniform float uMidSpecPow;
       uniform float uHiSpecPow;
       uniform float uMidSpecAmt;
       uniform float uHiSpecAmt;
       uniform float uSpecBands;
       uniform vec3 uSunDir;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      'vec4 diffuseColor = vec4( uBaseColor, opacity );'
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `
      vec3 outColor = outgoingLight;
      outColor *= uBaseBright;

      vec3 N = normalize( normal );
      vec3 V = normalize( -vViewPosition );
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(L + V);
      float ndh = max(dot(N, H), 0.0);

      float midSpec = pow(ndh, uMidSpecPow) * uMidSpecAmt;
      float hiSpec  = pow(ndh, uHiSpecPow)  * uHiSpecAmt;
      float spec = (midSpec + hiSpec);

      spec = clamp(spec, 0.0, 1.0);
      float bands = max(uSpecBands, 1.0);
      spec = floor(spec * bands) / bands;

      float ndl = max(dot(N, L), 0.0);
      spec *= smoothstep(0.05, 0.4, ndl);

      outColor += vec3(spec);

      gl_FragColor = vec4( outColor, diffuseColor.a );

      #ifdef TONE_MAPPING
        gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
      #endif
      gl_FragColor = linearToOutputTexel( gl_FragColor );
      `
    );
  };

  return mat;
}

export const TOON_RAMP_TUNDRA = makeToonRamp5([
  '#01131d', // deep teal hillside shadow
  '#06313a',
  '#12615b',
  '#2f8d79',
  '#62b99c'  // visible muted mint-teal highlight
]);

export const TOON_RAMP_SKY_WATER = makeToonRampWeighted(
  ['#171326', '#242347', '#313262', '#4d568a', '#8796c8'],
  [0.12, 0.28, 0.28, 0.20, 0.12]
);
