// Presentation only: dock tabs, phase-aware camera focus and the header
// battery chip. Reads app.js globals (`state`); never sends commands.
(() => {
  const $ = id => document.getElementById(id);
  const tabs = [...document.querySelectorAll('[data-dock-tab]')];
  const panes = [...document.querySelectorAll('[data-dock-pane]')];

  /* ---------------------------------------------------------- Dock tabs --- */
  function selectTab(name, focus = false) {
    tabs.forEach(tab => {
      const on = tab.dataset.dockTab === name;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    panes.forEach(pane => { pane.hidden = pane.dataset.dockPane !== name; });
    window.dispatchEvent(new Event('resize')); // charts size themselves on show
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.dockTab));
    tab.addEventListener('keydown', event => {
      const step = {ArrowRight: 1, ArrowLeft: -1}[event.key];
      if (!step) return;
      event.preventDefault();
      selectTab(tabs[(i + step + tabs.length) % tabs.length].dataset.dockTab, true);
    });
  });
  selectTab('overview');

  /* ------------------------------------------------------- Mission stage ---
   * Drive & search: forward camera large, probe camera small, detector chart.
   * Probe (confirmed target, scan, or a probe cycle): probe camera large and
   * probe load in the dock. Changes only on stage transitions, so a manual
   * swap or tab choice stays until the mission moves on.
   */
  const stageEl = $('camera-stage');
  let stage = null;
  let swapped = false;
  function missionStage() {
    const phase = state.inspection?.phase || 'IDLE';
    if (state.probe?.cycle_active || ['CONFIRMED', 'PROBING', 'COMPLETE'].includes(phase)) return 'probe';
    if (phase === 'CONFIRMING') return 'confirm';
    return 'drive';
  }
  function applyFocus() {
    const probeLarge = (stage === 'probe') !== swapped;
    stageEl.dataset.focus = probeLarge ? 'probe' : 'forward';
    $('camera-swap-label').textContent = probeLarge ? 'Enlarge front camera' : 'Enlarge probe camera';
    document.body.dataset.stage = stage;
    window.dispatchEvent(new Event('resize'));
  }
  $('camera-swap').addEventListener('click', () => { swapped = !swapped; applyFocus(); });

  /* ------------------------------------------------------- Probe camera --- */
  function probeCameraShown() {
    return !$('aux-video').classList.contains('hidden') || !$('aux-network-camera').classList.contains('hidden');
  }

  /* ------------------------------------------------------ Battery chip --- */
  const chip = $('power-chip');
  chip.addEventListener('click', () => selectTab('drive'));
  function renderChip() {
    const battery = state.power?.battery || {};
    const live = state.connected && battery.available && !battery.stale && battery.present;
    const pct = battery.remaining_pct, watts = battery.power_w;
    $('power-chip-pct').textContent = live && Number.isFinite(pct) ? `${Math.round(pct)}%` : '—';
    $('power-chip-w').textContent = live && Number.isFinite(watts) ? `${watts.toFixed(0)} W` : 'No battery data';
    chip.dataset.level = !live || !Number.isFinite(pct) ? 'none' : pct < 20 ? 'low' : pct < 40 ? 'mid' : 'ok';
  }

  const fullTextIds = ['controller', 'controller-mapping', 'drive-block', 'drive-help', 'detector-detail', 'position', 'connection'];
  function tick() {
    const next = missionStage();
    if (next !== stage) {
      const entering = stage !== null;
      stage = next;
      swapped = false;
      applyFocus();
      if (entering) selectTab(stage === 'probe' ? 'probe' : stage === 'confirm' ? 'detector' : 'overview');
    }
    $('probe-camera-empty').hidden = probeCameraShown();
    renderChip();
    // one-line status texts are cut with an ellipsis; keep the full text on hover
    for (const id of fullTextIds) { const el = $(id); if (el && el.title !== el.textContent) el.title = el.textContent; }
  }
  tick();
  setInterval(tick, 250);
})();
