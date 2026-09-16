const DEFAULT_THRESHOLD = 0.72;
const DEFAULT_FILL_SECONDS = 90;
const DEFAULT_REGULATION_SECONDS = 3.4;
const MIN_SPEED_MULTIPLIER = 0.28;

export function createPsionicSystem({
  rootEl,
  fillEl,
  valueEl,
  cameraSystem,
  monsterSystem,
  threshold = DEFAULT_THRESHOLD,
  fillSeconds = DEFAULT_FILL_SECONDS,
  regulationSeconds = DEFAULT_REGULATION_SECONDS
}) {
  let criticality = 0;
  let regulating = false;
  let regulationTimer = 0;
  let regulationStartCriticality = 0;

  function render() {
    const percent = Math.round(criticality * 100);
    rootEl.style.setProperty('--psionic-level', `${percent}%`);
    rootEl.style.setProperty('--psionic-threshold', `${threshold * 100}%`);
    rootEl.classList.toggle('is-critical', criticality >= threshold);
    rootEl.classList.toggle('is-regulating', regulating);
    fillEl.style.width = `${percent}%`;
    valueEl.textContent = `${percent}`;
    rootEl.setAttribute('aria-valuenow', String(percent));
  }

  function setCriticality(value) {
    criticality = Math.max(0, Math.min(1, Number(value) || 0));
    render();
  }

  function startRegulation() {
    if (regulating || criticality <= 0.005) return false;
    regulating = true;
    regulationTimer = regulationSeconds;
    regulationStartCriticality = criticality;
    monsterSystem.beginMushroomAmbush();
    cameraSystem.setViewMode('first');
    render();
    return true;
  }

  function toggleRegulation() {
    if (regulating) {
      cancelRegulation();
      return false;
    }
    return startRegulation();
  }

  function finishRegulation({ restoreView = true } = {}) {
    if (!regulating) return;
    regulating = false;
    regulationTimer = 0;
    criticality = 0;
    if (restoreView) cameraSystem.setViewMode('third');
    render();
  }

  function cancelRegulation() {
    if (!regulating) return;
    regulating = false;
    regulationTimer = 0;
    monsterSystem.setMushroomLureActive(false);
    cameraSystem.setViewMode('third');
    render();
  }

  function reset() {
    cancelRegulation();
    monsterSystem.setMushroomLureActive(false);
    criticality = 0;
    render();
  }

  function update(dt, active) {
    if (regulating) {
      cameraSystem.setViewMode('first');
      regulationTimer -= dt;
      const remaining = Math.max(0, regulationTimer / regulationSeconds);
      criticality = regulationStartCriticality * remaining;
      if (regulationTimer <= 0) finishRegulation();
      else render();
    } else if (active) {
      criticality = Math.min(1, criticality + dt / fillSeconds);
      render();
    }
  }

  function getSpeedMultiplier() {
    if (criticality <= threshold) return 1;
    const danger = (criticality - threshold) / (1 - threshold);
    return 1 - danger * (1 - MIN_SPEED_MULTIPLIER);
  }

  render();

  return {
    update,
    reset,
    cancelRegulation,
    startRegulation,
    toggleRegulation,
    setCriticality,
    get criticality() {
      return criticality;
    },
    get isRegulating() {
      return regulating;
    },
    get speedMultiplier() {
      return getSpeedMultiplier();
    }
  };
}
