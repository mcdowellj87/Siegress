(() => {
  // Public API: window.MF_Cutscene.play({ onStartGame })
  // - onStartGame: async function called AFTER cutscene finishes and user presses "start"

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function mountTemplate() {
    const tpl = document.getElementById('mfCutsceneTpl');
    const frag = tpl.content.cloneNode(true);
    document.body.appendChild(frag);
    return document.getElementById('mfCutsceneModal');
  }

  function removeModal(modal) {
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  async function mountImage(cardEl, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = window.__mfMemAssets?.getObjectUrl(url) || url;
      img.onload = () => { cardEl.innerHTML = ""; cardEl.appendChild(img); resolve(true); };
      img.onerror = () => resolve(false);
    });
  }

  function setBgFrame(el, url) {
    if (!el) return;
    const u = window.__mfMemAssets?.getObjectUrl(url) || url;
    el.style.backgroundImage = `url("${u}")`;
  }

  function preloadImages(urls) {
    return Promise.all(urls.map(url => new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = window.__mfMemAssets?.getObjectUrl(url) || url;
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    })));
  }

  window.MF_Cutscene = {
    async play({ onStartGame } = {}) {
      const BG_FADE_ON_TEXT = "It is a time when the sun burns weak and red.";
      const ACTORS_FADE_ON_EXACT = "These \"men,\" as they once fashioned themselves.";

      const BG2_ON_TEXT = "You are of the two remaining immortals.";
      const BG3_ON_TEXT = "A clone.";
      const BG4_ON_TEXT = "An experiment.";
      const BG5_ON_TEXT = "A prisoner.";

      const PRISONER_WAIT_BEFORE_CLEANUP_MS = 4000;
      const PRISONER_EXTRA_WAIT_BEFORE_ACTORS_MS = 2000;
      const BG_FADE_OUT_MS = 900;

      const MOVE_MS = 24000;
      const SOLO_SLIDE_MS = 8000;

      const ZOOM_FROM = 1.00;
      const ZOOM_TO = 1.22;
      const ZOOM_EASE = "linear";

      const BG_SCALE_FROM = 1.00;
      const BG_SCALE_TO = 0.88;

      const MOVE_EASE = "cubic-bezier(0.10, 0.00, 0.90, 1.00)";
      const SOLO_EASE = "cubic-bezier(0.10, 0.00, 0.90, 1.00)";

      const DELETE_BLUE_ON_TEXT = "In their infighting, only one remained.";
      const EXTRA_HOLD_BEFORE_DELETE_MS = 5000;
      const DELAY_BEFORE_RED_RECENTER_MS = 2000;

      const storyCues = [
        { text: "It is a time when the sun burns weak and red.", ms: 4000 },
        { text: "The days are long and the seasons are cold.", ms: 5000 },
        { text: "This is Siegress", ms: 3000 },
        { text: "", ms: 900 },

        { text: "You are of the two remaining immortals.", ms: 4000 },
        { text: "A clone.", ms: 2400 },
        { text: "An experiment.", ms: 2400 },
        { text: "A prisoner.", ms: 2400 },
        { text: "", ms: 900 },

        { text: "These \"men,\" as they once fashioned themselves.", ms: 4000 },
        { text: "Poisoned the Earth.", ms: 3000 },
        { text: "Hardened their bodies.", ms: 3000 },
        { text: "And created a cabal of everlasting corruption.", ms: 4000 },
        { text: "In their infighting, only one remained.", ms: 4000 },
        { text: "", ms: 2000 },

        { text: "A single authority with absolute control over Earth’s biosphere.", ms: 3400 },
        { text: "Over life.", ms: 2300 },
        { text: "Over death.", ms: 2300 },
        { text: "", ms: 1800 },

        { text: "Over you.", ms: 3400 },
        { text: "", ms: 900 },

        { text: "Your goal is to escape this madness.", ms: 3400 },
        { text: "but...", ms: 3000 },
        { text: "is it even possible?", ms: 3400 }
      ];

      // ---- mount DOM ----
      const modal = mountTemplate();

      const stage = modal.querySelector("#cs-stage");
      const captionText = modal.querySelector("#cs-captionText");
      const promptEl = modal.querySelector("#csPrompt");

      const bgStack = modal.querySelector("#cs-bgStack");
      const bg1 = modal.querySelector("#cs-bg1");
      let bg2 = modal.querySelector("#cs-bg2");
      let bg3 = modal.querySelector("#cs-bg3");
      let bg4 = modal.querySelector("#cs-bg4");
      let bg5 = modal.querySelector("#cs-bg5");

      const charLayer = modal.querySelector("#cs-charLayer");
      const amadeusCard = modal.querySelector("#cs-amadeusCard");
      let aristocratCard = modal.querySelector("#cs-aristocratCard");

      // ---- helpers ----
      function setCaptionText(str) {
        captionText.style.opacity = "0";
        const safe = (str === "") ? " " : str;
        setTimeout(() => {
          captionText.textContent = safe;
          captionText.style.opacity = "1";
        }, 170);
      }

      let bgScale = BG_SCALE_FROM;
      function setBgScale(s) {
        bgScale = s;
        bgStack.style.transform = `scale(${bgScale})`;
      }

      let amadeusX = 0;
      let amadeusScale = ZOOM_FROM;
      function applyAmadeusTransform() {
        amadeusCard.style.transform = `translate3d(${amadeusX}px, 0px, 0px) scale(${amadeusScale})`;
      }
      function setAmadeusX(x) { amadeusX = x; applyAmadeusTransform(); }
      function setAmadeusScale(s) { amadeusScale = s; applyAmadeusTransform(); }
      function setCardX(cardEl, x) { cardEl.style.transform = `translate3d(${x}px, 0px, 0px)`; }

      function computePositions() {
        const rect = stage.getBoundingClientRect();
        const aRect = amadeusCard.getBoundingClientRect();
        const cardW = aRect.width;
        const padX = Math.max(18, rect.width * 0.035);
        const leftStartX = padX;
        const rightStartX = rect.width - padX - cardW;
        const leftEndX = rightStartX;
        const rightEndX = leftStartX;
        const centerX = (rect.width - cardW) / 2;
        return { leftStartX, rightStartX, leftEndX, rightEndX, centerX };
      }

      function snapToDefaultPositions() {
        const pos = computePositions();
        amadeusCard.style.transition = "none";
        if (aristocratCard && aristocratCard.isConnected) aristocratCard.style.transition = "none";

        setAmadeusScale(ZOOM_FROM);
        setAmadeusX(pos.leftStartX);

        if (aristocratCard && aristocratCard.isConnected) setCardX(aristocratCard, pos.rightStartX);

        bgStack.style.transition = "none";
        setBgScale(BG_SCALE_FROM);

        void amadeusCard.offsetHeight;
      }

      function animateSwapOnce() {
        const pos = computePositions();
        amadeusCard.style.transition = `transform ${MOVE_MS}ms ${MOVE_EASE}`;
        if (aristocratCard && aristocratCard.isConnected) {
          aristocratCard.style.transition = `transform ${MOVE_MS}ms ${MOVE_EASE}`;
        }
        requestAnimationFrame(() => {
          setAmadeusX(pos.leftEndX);
          if (aristocratCard && aristocratCard.isConnected) setCardX(aristocratCard, pos.rightEndX);
        });
      }

      function animateRedToCenter() {
        const pos = computePositions();
        amadeusCard.style.transition = `transform ${SOLO_SLIDE_MS}ms ${SOLO_EASE}`;
        requestAnimationFrame(() => setAmadeusX(pos.centerX));
      }

      function isDeleteCueText(text) {
        if (!text) return false;
        return text === DELETE_BLUE_ON_TEXT || text.includes(DELETE_BLUE_ON_TEXT);
      }

      function calcZoomDurationAfterDelete() {
        const idx = storyCues.findIndex(c => isDeleteCueText(c.text));
        if (idx === -1) return 0;
        let sum = 0;
        for (let i = idx + 1; i < storyCues.length; i++) sum += (storyCues[i]?.ms || 0);
        return Math.max(0, sum);
      }

      function startAmadeusZoomAndBgShrinkUntilStoryEnds() {
        const zoomDuration = calcZoomDurationAfterDelete() / 2; // 2x faster
        if (zoomDuration <= 0) {
          setAmadeusScale(ZOOM_TO);
          setBgScale(BG_SCALE_TO);
          return;
        }
        amadeusCard.style.transition = `transform ${zoomDuration}ms ${ZOOM_EASE}`;
        bgStack.style.transition = `transform ${zoomDuration}ms ${ZOOM_EASE}`;
        requestAnimationFrame(() => {
          setAmadeusScale(ZOOM_TO);
          setBgScale(BG_SCALE_TO);
        });
      }

      let blueDeleted = false;
      let zoomStarted = false;
      function deleteBlueNow() {
        if (blueDeleted) return;
        blueDeleted = true;

        if (aristocratCard && aristocratCard.isConnected) aristocratCard.remove();
        aristocratCard = null;

        setTimeout(() => {
          animateRedToCenter();
          if (!zoomStarted) {
            zoomStarted = true;
            setTimeout(() => startAmadeusZoomAndBgShrinkUntilStoryEnds(), SOLO_SLIDE_MS);
          }
        }, DELAY_BEFORE_RED_RECENTER_MS);
      }

      // ---- staged start ----
      let bgShown = false;
      let actorsShown = false;
      let motionStarted = false;

      let bg2On = false, bg3On = false, bg4On = false, bg5On = false;

      let cleanupStarted = false;
      let cleanupDoneAt = 0;

      function showBackgroundIfNeeded(text) {
        if (!text || bgShown) return;
        if (text === BG_FADE_ON_TEXT || text.includes(BG_FADE_ON_TEXT)) bgShown = true;
      }

      function startPrisonerCleanupTimeline() {
        if (cleanupStarted) return;
        cleanupStarted = true;

        const now = performance.now();
        cleanupDoneAt = now + PRISONER_WAIT_BEFORE_CLEANUP_MS + BG_FADE_OUT_MS + PRISONER_EXTRA_WAIT_BEFORE_ACTORS_MS;

        (async () => {
          await wait(PRISONER_WAIT_BEFORE_CLEANUP_MS);

          [bg2, bg3, bg4, bg5].forEach(el => el?.classList.add("fadeOut"));
          await wait(BG_FADE_OUT_MS);

          [bg2, bg3, bg4, bg5].forEach(el => el?.remove());
          bg2 = bg3 = bg4 = bg5 = null;
        })();
      }

      function progressBackgroundFramesIfNeeded(text) {
        if (!text) return;
      }

      function revealActorsAndStartMotion() {
        if (actorsShown) return;
        actorsShown = true;
      }

      // ---- skip + end gates ----
      let aborted = false;
      let inPlayback = true;
      let autoStartFromSkip = false; // ✅ if true, skip->start is the same keypress

      function onAnyKeyDuringPlayback(e) {
        if (e?.cancelable) e.preventDefault();
        e?.stopPropagation?.();

        if (!inPlayback) return;
        aborted = true;                 // stop the story loop ASAP
        autoStartFromSkip = true;       // ✅ same keypress also counts as "start"
      }

      function setPrompt(text) {
        promptEl.textContent = text || "";
      }

      async function playStory() {
        for (let i = 0; i < storyCues.length; i++) {
          if (aborted) break;

          const cue = storyCues[i];

          showBackgroundIfNeeded(cue.text);
          progressBackgroundFramesIfNeeded(cue.text);

          const isTheseMen = cue.text && (cue.text === ACTORS_FADE_ON_EXACT || cue.text.includes(ACTORS_FADE_ON_EXACT));

          if (isTheseMen && cleanupStarted && !actorsShown) {
            const delay = Math.max(0, cleanupDoneAt - performance.now());
            if (delay > 0) await wait(delay);

            setCaptionText(cue.text);
            revealActorsAndStartMotion();
            await wait(cue.ms);
            continue;
          }

          setCaptionText(cue.text);

          if (isTheseMen && !cleanupStarted) {
            revealActorsAndStartMotion();
          }

          if (isDeleteCueText(cue.text)) {
            await wait(cue.ms + EXTRA_HOLD_BEFORE_DELETE_MS);
            deleteBlueNow();
            continue;
          }

          await wait(cue.ms);
        }
      }

      async function toEndGate() {
        inPlayback = false;

        setCaptionText(" ");
        setPrompt("Press any key to start");

        // If the user already skipped (key OR click), don't require a second press
        if (autoStartFromSkip) return;

        await new Promise((resolve) => {
          const done = (e) => {
            if (e?.cancelable) e.preventDefault();
            e?.stopPropagation?.();

            window.removeEventListener('keydown', onKey, true);
            modal.removeEventListener('pointerdown', onPointer, true);
            resolve();
          };

          const onKey = (e) => {
            if (e.code === 'Tab') return;
            if (e.code === 'Escape') return;
            done(e);
          };

          const onPointer = (e) => {
            // optional: ignore right click
            // if (e.button === 2) return;
            done(e);
          };

          window.addEventListener('keydown', onKey, true);
          modal.addEventListener('pointerdown', onPointer, true);
        });
      }

      // ---- init visuals ----
      bgStack.classList.remove("isVisible");
      charLayer.classList.remove("isVisible");
      snapToDefaultPositions();
      setCaptionText(storyCues[0]?.text ?? " ");
      showBackgroundIfNeeded(storyCues[0]?.text ?? "");

      // During playback: any key OR click = SKIP (but not Tab/Escape)
      setPrompt("Press any key to skip");

      const onKeySkip = (e) => {
        if (e.code === 'Tab') return;
        if (e.code === 'Escape') return;
        onAnyKeyDuringPlayback(e);
      };

      // ✅ click/tap skips too (left/middle/right all count)
      const onPointerSkip = (e) => {
        // ignore right click if you want (optional):
        // if (e.button === 2) return;

        onAnyKeyDuringPlayback(e);
      };

      window.addEventListener('keydown', onKeySkip, true);
      modal.addEventListener('pointerdown', onPointerSkip, true);

      // Resize safety
      const onResize = () => { if (!motionStarted) snapToDefaultPositions(); };
      window.addEventListener('resize', onResize, { passive: true });

      // Run story
      await playStory();

      // Cleanup playback listeners
      window.removeEventListener('keydown', onKeySkip, true);
      modal.removeEventListener('pointerdown', onPointerSkip, true);

      // End gate (press any key to start)
      await toEndGate();

      // Remove cutscene overlay
      window.removeEventListener('resize', onResize);
      removeModal(modal);

      // Now hand back to the game (pointer lock + world reload)
      if (typeof onStartGame === 'function') await onStartGame();
    }
  };
})();
