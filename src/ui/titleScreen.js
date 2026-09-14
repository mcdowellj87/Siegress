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

  const titleCanvas = document.getElementById('mfTitleCanvas');
  let rafId = 0;

  if (titleCanvas) {
    const ctx = titleCanvas.getContext('2d');
    const W = 2048;
    const H = 512;
    titleCanvas.width = W;
    titleCanvas.height = H;

    const text = 'SIEGRESS';
    const fontFamily = 'Oxanium';
    const fontWeight = 400;
    const scaleX = 1.0;
    const scaleY = 0.5;
    const tracking = 22;
    const fontSize = 190;

    function drawTrackedText(mode = 'fill') {
      const chars = text.split('');
      let total = 0;
      for (const ch of chars) total += ctx.measureText(ch).width;
      total += tracking * (chars.length - 1);
      let x = -total * 0.5;
      for (const ch of chars) {
        if (mode === 'stroke') ctx.strokeText(ch, x, 0);
        else ctx.fillText(ch, x, 0);
        x += ctx.measureText(ch).width + tracking;
      }
    }

    function drawTitle(t) {
      const time = t * 0.001;
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.8);
      const blueStrength = Math.abs(pulse * 2.0 - 1.0);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.translate(W * 0.5, H * 0.5);
      ctx.scale(scaleX, scaleY);
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      ctx.save();
      ctx.fillStyle = `rgba(58, 215, 255, ${0.18 + 0.7 * blueStrength})`;
      ctx.shadowColor = 'rgba(58, 215, 255, 0.95)';
      ctx.shadowBlur = 55 + 80 * blueStrength;
      ctx.lineWidth = 16;
      ctx.strokeStyle = `rgba(58, 215, 255, ${0.65 + 0.25 * blueStrength})`;
      drawTrackedText('stroke');
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      drawTrackedText('fill');

      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + 0.18 * blueStrength})`;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
      ctx.shadowBlur = 10 + 20 * blueStrength;
      ctx.lineWidth = 6;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + 0.35 * blueStrength})`;
      drawTrackedText('stroke');

      ctx.restore();

      rafId = requestAnimationFrame(drawTitle);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { rafId = requestAnimationFrame(drawTitle); });
    } else {
      rafId = requestAnimationFrame(drawTitle);
    }
  }

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
    if (rafId) cancelAnimationFrame(rafId);
    if (loaderInterval) clearInterval(loaderInterval);
    window.removeEventListener('contextmenu', blockCtxMenu, true);

    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }
})();
