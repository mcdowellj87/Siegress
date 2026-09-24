(() => {
  const modal = document.getElementById('mfModal');
  if (modal) modal.style.display = 'grid';

  const layers = document.querySelectorAll('#mfModal .stack .layer:not(.noDrift)');
  layers.forEach((img) => {
    const dx = ((Math.random() * 3.2) - 1.6).toFixed(2);
    const dy = ((Math.random() * 3.2) - 1.6).toFixed(2);
    const dur = (1.5 + Math.random() * 1.0).toFixed(2);
    const delay = (-(Math.random() * parseFloat(dur))).toFixed(2);

    img.style.setProperty('--dx', `${dx}px`);
    img.style.setProperty('--dy', `${dy}px`);
    img.style.animationDuration = `${dur}s`;
    img.style.animationDelay = `${delay}s`;
  });

  const loaderEl = document.getElementById('loader');
  let dots = 1;
  const loaderInterval = loaderEl ? setInterval(() => {
    dots = (dots % 3) + 1;
    loaderEl.textContent = `loading${'.'.repeat(dots)}`;
  }, 420) : 0;

  function setModalReadyToStart() {
    if (loaderInterval) clearInterval(loaderInterval);

    if (loaderEl) {
      loaderEl.textContent = 'press any key to start';
      loaderEl.style.cursor = 'default';
      loaderEl.style.opacity = '1';
    }

    let started = false;
    const enableCutscene = false;

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      modal.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('contextmenu', blockCtxMenu, true);
    };

    const start = (e) => {
      if (started) return;
      started = true;

      if (e?.cancelable) e.preventDefault();
      e?.stopPropagation?.();

      cleanup();
      closeModal();

      const music = document.getElementById('mfMusic');
      if (music && music.paused) {
        music.volume = 0.6;
        music.loop = true;
        music.play().catch(() => { });
      }

      if (enableCutscene) {
        window.MF_Cutscene.play({ onStartGame: enterGame });
      } else {
        enterGame();
      }
    };

    const onKeyDown = (e) => {
      start(e);
    };

    const onPointerDown = (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      start(e);
    };

    window.addEventListener('keydown', onKeyDown, true);
    modal.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('contextmenu', blockCtxMenu, true);
  }

  async function enterGame() {
    await window.ensureFootstepsReady?.();

    if (window.__mfEnablePointerLock) window.__mfEnablePointerLock();
    const c = document.getElementById('c');
    if (c && !document.pointerLockElement) c.requestPointerLock();

    if (window.__mfClearKeys) window.__mfClearKeys();
  }

  window.addEventListener('mf:world-ready', () => {
    setModalReadyToStart();
  }, { once: true });
  if (window.__mfWorldReady) setModalReadyToStart();

  function blockCtxMenu(e) {
    if (!modal || !modal.isConnected) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function closeModal() {
    if (loaderInterval) clearInterval(loaderInterval);
    window.removeEventListener('contextmenu', blockCtxMenu, true);

    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }
})();
