'use strict';
function applyFacilitatorBrand(brands) {
  const selectedKey = document.body.dataset.brand || brands[0]?.key;
  const selected = brands.find(brand => brand.key === selectedKey);
  document.documentElement.style.setProperty('--brand-accent',selected?.color || brands[0]?.color || '#EB0A1E');
  document.getElementById('brand-controls-title').textContent = selected ? `${selected.name} CONTROLS` : 'Brand 2 is not enabled';
  for (const [index,id] of ['brand1-link','brand2-link'].entries()) {
    const brand = brands[index]; const link = document.getElementById(id); link.hidden = !brand;
    if (brand) {
      link.textContent = `${brand.name} Queue Board`;
      if (document.body.dataset.view === 'board' && brand.key === selectedKey) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
  }
  return selected;
}
(() => {
  const view = document.body.dataset.view || 'board';
  const titles = {board:'TDQSYS Facilitator Dashboard',master:'Master Table',prints:'Print Queue',sales:'Registered Sales Exec Master List',setup:'Event Setup and Registration QR Codes'};
  document.body.insertAdjacentHTML('afterbegin', `
    <header class="dashboard-header"><h1>${titles[view]}</h1><div class="header-links"><a href="index.html" class="link-button">Hub</a><a href="display_with_ads.html" target="_blank" class="link-button">Open Display Screen (New Window)</a><a href="settings.html" class="link-button">System Settings</a><button id="refresh" class="link-button">Refresh</button></div></header>
    <nav class="header-links" aria-label="Facilitator pages"><a id="brand1-link" href="dashboard.html">Queue Board</a><a id="brand2-link" href="dashboard-brand2.html" hidden>Brand 2 Queue Board</a><a href="master-table.html" ${view==='master'?'aria-current="page"':''}>Master Table</a><a href="print-queue.html" ${view==='prints'?'aria-current="page"':''}>Print Queue</a><a href="sales-executives.html" ${view==='sales'?'aria-current="page"':''}>Sales Executives</a><a href="event-setup.html" ${view==='setup'?'aria-current="page"':''}>Event Setup / QR Codes</a></nav>
    <p id="licence-locked" role="status" hidden><strong>Controls disabled.</strong> <span id="licence-locked-why"></span> The display and live values are still being served. Open System Settings to renew.</p>
    <p id="message" role="status"></p><p id="local-sync-status" role="status"></p><button id="retry-local-sync" hidden data-write>Retry saved queue actions</button><p id="sheets-status" role="status"></p><p id="run">Loading registrations...</p>
    <section id="event-setup" ${view!=='setup'?'hidden':''}><h2>Event setup and registration QR codes</h2>
      <p>Save vehicle shortnames, waiver, Terms and this location's Google Sheets URL in System Settings. Saved settings sync automatically while the desktop app is running.</p>
      <section id="mirror-link"><h3>Queue display mirror link / QR</h3>        <div class="field">
            <label>Your mirror link (share to watch this location)</label>
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <input type="text" id="cfg-mirrorlink" readonly style="flex:1; opacity:0.85;" onclick="this.select()">
                <button type="button" class="btn-ghost settings-btn" style="flex:0 0 auto; padding:0.4rem 1rem;" onclick="copyMirrorLink()">&#x1F4CB; Copy</button>
            </div>
            <div class="hint">Opens the read-only web viewer for THIS location on any phone. Paste it into the viewer's "Instance / mirror link" box, or open it directly.</div>

            <!-- Print/share QR. Regenerated from the field above, so it can never
                 disagree with the link. Canvas is rendered at integer module
                 scale: fractional cells look fine on screen but blur when
                 printed, and a blurred QR will not scan. -->
            <div style="display:flex; gap:1rem; align-items:center; margin-top:0.9rem; flex-wrap:wrap;">
                <canvas id="mirror-qr-canvas" width="512" height="512" role="img"
                        aria-label="QR code linking to this location's queue viewer"
                        style="width:150px; height:150px; background:#fff; border-radius:8px; padding:6px; box-sizing:content-box; flex:0 0 auto; image-rendering:pixelated;"></canvas>

                <div id="mirror-qr-actions" style="display:flex; flex-direction:column; gap:0.4rem; align-items:flex-start;">
                    <button type="button" class="btn-ghost settings-btn" onclick="downloadMirrorQr('png')">&#x2B07; Download PNG</button>
                    <button type="button" class="btn-ghost settings-btn" onclick="downloadMirrorQr('svg')">&#x2B07; Download SVG (print)</button>
                    <div class="hint" style="max-width:22rem;">Scan to open this location's viewer. PNG/SVG are sized for printing on a sign or handout.</div>
                </div>
            </div>
        </div><p id="mirror-link-notice" hidden>Set the Cloud Base URL in desktop Settings to generate this location's public mirror link.</p></section><button id="configure" data-write>Sync saved Settings now</button><button id="export-local-queue">Export local queue recovery</button><button id="archive-local-conflicts" hidden data-write>Archive earlier-run unsynced actions</button><div id="registration-links"></div>
      <button id="export">Download registrant backup (CSV)</button>
      <form id="reset-form"><label>Reset reason <input id="reset-reason" value="Testing" maxlength="240" required data-write></label>
      <label><input id="reset-confirm" type="checkbox" required data-write> Close this run and reset every model and the TV display to zero. Keep all client and SE history.</label><button type="submit" data-write>Reset to Zero / open run</button></form>
    </section>
    <main><section id="brand-controls" ${view!=='board'?'hidden':''}><h2 id="brand-controls-title">Controls</h2><section id="board" tabindex="0" aria-label="Vehicle queues; scroll or drag horizontally in a continuous loop"></section></section>
    <section id="master" ${view!=='master'?'hidden':''}><label>Search client name <input id="search" type="search"></label><label>Sort by <select id="master-sort"><option value="">Registration order</option><option value="name">Name</option><option value="agent">Agent</option><option value="model">Model</option><option value="status">Status</option></select></label><label>Order <select id="master-direction"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label>Label printer <select id="master-printer"><option value="">Select printer</option></select></label><label><input id="history" type="checkbox"> Earlier runs today</label><div class="table-scroll"><table><thead><tr><th>Queue</th><th>Name</th><th>Agent / 4-digit code</th><th>Model</th><th>Status</th><th>Actions</th></tr></thead><tbody id="master-rows"></tbody></table></div></section>
    <section id="prints" ${view!=='prints'?'hidden':''}><label>Search client name <input id="print-search" type="search"></label><label>Label printer <select id="printer"><option value="">Select printer</option></select></label><button id="load-printers">Refresh printer list</button><div class="table-scroll"><table><thead><tr><th>Queue / SE code</th><th>Name</th><th>Model / type</th><th>Print status</th><th>Action</th></tr></thead><tbody id="print-rows"></tbody></table></div></section>
    <section id="sales" ${view!=='sales'?'hidden':''}><label>Search name or dealership <input id="sales-search" type="search"></label><label>Sort by <select id="sales-sort"><option value="">Registration order</option><option value="name">Name</option><option value="dealership">Dealership</option><option value="code">Code</option><option value="status">Status</option></select></label><label>Order <select id="sales-direction"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label><input id="sales-history" type="checkbox"> Include previous days and reset registrations</label><p id="sales-count"></p><div class="table-scroll"><table><thead><tr><th>4-digit code</th><th>Name</th><th>Dealership</th><th>Registered for</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody id="sales-rows"></tbody></table></div>
    <details><summary>Reset today's Sales Executive registrations</summary><p>This deactivates today's SE codes and cancels their unprinted code slips. SEs can register again for fresh codes. Keep all history, client registrations, vehicle queues and TV numbers.</p>
      <form id="sales-reset-form"><label>Reset reason <input id="sales-reset-reason" maxlength="240" required data-write></label><label><input id="sales-reset-confirm" type="checkbox" required data-write> Deactivate today's codes. Previously printed code slips will stop working.</label><button type="submit" data-write>Reset Sales Executives</button></form>
    </details></section></main>`);
  const bootstrap = window.TDQSYS_FACILITATOR_BOOTSTRAP;
  if (bootstrap) {
    applyFacilitatorBrand(bootstrap.brands);
    document.getElementById('sheets-status').textContent = bootstrap.sheetsConfigured
      ? 'Google Sheets destination saved. Registrations sync automatically while TDQSYS is running.'
      : 'Google Sheets is not connected for this location. Paste its URL in System Settings and save. Already submitted registrations remain queued for delivery.';
  }
})();
