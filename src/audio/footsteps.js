const WALK_STEP_1_URL = './audio/step_8.mp3';
const WALK_STEP_2_URL = './audio/step_9.mp3';
const WALK_STEP_3_URL = './audio/step_4.mp3';

export const WALK_STEP_SOUNDS = [WALK_STEP_1_URL, WALK_STEP_2_URL, WALK_STEP_3_URL];
export const FOOTSTEP_INTERVAL_S = 0.42;

const FOOTSTEP_GAIN = 0.22;
const RARE_STEP_CHANCE = 0.35;

let audioCtx = null;
let footGain = null;
let footBufA = null;
let footBufB = null;
let footBufC = null;
let footNext = 0;
let footReady = false;
let footLoading = false;

async function decodeFromMemOrFetch(url) {
  const blob = window.__mfMemAssets?.getBlob(url);
  const ab = blob ? await blob.arrayBuffer() : await (await fetch(url)).arrayBuffer();
  return await audioCtx.decodeAudioData(ab);
}

export function isFootstepsReady() {
  return footReady;
}

export async function ensureFootstepsReady() {
  if (footReady || footLoading) return footReady;
  footLoading = true;

  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch { }
  }

  footGain = footGain || audioCtx.createGain();
  footGain.gain.value = FOOTSTEP_GAIN;
  footGain.connect(audioCtx.destination);

  try {
    [footBufA, footBufB, footBufC] = await Promise.all([
      decodeFromMemOrFetch(WALK_STEP_1_URL),
      decodeFromMemOrFetch(WALK_STEP_2_URL),
      decodeFromMemOrFetch(WALK_STEP_3_URL),
    ]);

    footReady = true;
    footLoading = false;
    return true;
  } catch (err) {
    console.warn('[audio] footstep decode failed:', err);
    footReady = false;
    footLoading = false;
    return false;
  }
}

export function playFootstep() {
  if (!footReady || !audioCtx || !footGain) return;

  const buf = (footBufC && Math.random() < RARE_STEP_CHANCE)
    ? footBufC
    : ((footNext++ % 2 === 0) ? footBufA : footBufB);

  if (!buf) return;

  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.96 + Math.random() * 0.08;
  src.connect(footGain);
  src.start();
}
