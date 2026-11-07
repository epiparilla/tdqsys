'use strict';
// Desktop only: no registration or TV page loads this helper.
function prepareDesktopLayout() {
  if (document.body.classList.contains('settings')) {
    const top = document.createElement('div');
    top.className = 'desktop-top';
    const header = document.querySelector('.settings-header');
    header.before(top);
    for (const element of [header, document.getElementById('lock-banner'), document.getElementById('unlock-bar')]) {
      if (element) top.append(element);
    }
  }
  const view = document.body.dataset.view;
  if (['master', 'prints', 'sales', 'giveaways'].includes(view)) {
    const panel = document.getElementById(view === 'giveaways' ? 'giveaways' : view);
    const table = panel.querySelector('.table-scroll');
    const toolbar = document.createElement('div');
    toolbar.className = 'desktop-table-tools';
    while (panel.firstChild !== table) toolbar.append(panel.firstChild);
    panel.prepend(toolbar);
    panel.classList.add('desktop-table-panel');
    document.body.classList.add('desktop-table-page');
    // Giveaways owns a separate main; shell's inactive main must not take space.
    for (const main of document.querySelectorAll('body > main')) {
      if (!main.contains(panel) && main !== panel) main.hidden = true;
    }
  }
  const top = document.querySelector('.desktop-top');
  if (top) {
    const measure = () => document.documentElement.style.setProperty('--desktop-top-height', `${top.offsetHeight}px`);
    new ResizeObserver(measure).observe(top);
    measure();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepareDesktopLayout, {once:true});
else prepareDesktopLayout();
