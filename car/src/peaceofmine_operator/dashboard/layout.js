// Bottom telemetry dock tabs. Presentation only: no telemetry or commands.
(() => {
  const tabs = [...document.querySelectorAll('[data-dock-tab]')];
  const panes = [...document.querySelectorAll('[data-dock-pane]')];
  function select(name, focus = false) {
    tabs.forEach(tab => {
      const on = tab.dataset.dockTab === name;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    panes.forEach(pane => { pane.hidden = pane.dataset.dockPane !== name; });
    try { localStorage.setItem('peaceofmine.operator.dock', name); } catch {}
    window.dispatchEvent(new Event('resize')); // charts size themselves on show
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab.dataset.dockTab));
    tab.addEventListener('keydown', event => {
      const step = {ArrowRight: 1, ArrowLeft: -1}[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length].dataset.dockTab, true);
    });
  });
  let saved = null;
  try { saved = localStorage.getItem('peaceofmine.operator.dock'); } catch {}
  select(tabs.some(t => t.dataset.dockTab === saved) ? saved : 'overview');
})();
