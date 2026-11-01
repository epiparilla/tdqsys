'use strict';
(() => {
  const view = document.body.dataset.view || 'board';
  const titles = {board:'TDQSYS Facilitator Dashboard',master:'Master Table',prints:'Print Queue'};
  document.body.insertAdjacentHTML('afterbegin', `
    <header><h1>${titles[view]}</h1><a href="index.html">Hub</a><a href="display_with_ads.html" target="_blank">TV Display</a><a href="settings.html">System Settings</a><button id="refresh">Refresh</button></header>
    <nav aria-label="Facilitator pages"><a href="dashboard.html" ${view==='board'?'aria-current="page"':''}>Queue Board</a><a href="master-table.html" ${view==='master'?'aria-current="page"':''}>Master Table</a><a href="print-queue.html" ${view==='prints'?'aria-current="page"':''}>Print Queue</a></nav>
    <p id="licence-locked" role="status" hidden><strong>Controls disabled.</strong> <span id="licence-locked-why"></span> The display and live values are still being served. Open System Settings to renew.</p>
    <p id="message" role="status"></p><p id="sheets-status" role="status"></p><p id="run"></p>
    <details id="event-setup" ${view!=='board'?'hidden':''}><summary>Event setup and registration QR codes</summary>
      <p>Save vehicle shortnames, waiver, Terms and this location's Google Sheets URL in System Settings. Saved settings sync automatically while the desktop app is running.</p>
      <button id="configure" data-write>Sync saved Settings now</button><div id="registration-links"></div>
      <button id="export">Download registrant backup (CSV)</button>
      <form id="reset-form"><label>Reset reason <input id="reset-reason" value="Testing" maxlength="240" required data-write></label>
      <label><input id="reset-confirm" type="checkbox" required data-write> Close this run and start a new queue from zero. Keep all client history.</label><button type="submit" data-write>Reset to Zero / open run</button></form>
    </details>
    <main><section id="board" aria-label="Vehicle queues" ${view!=='board'?'hidden':''}></section>
    <section id="master" ${view!=='master'?'hidden':''}><label>Search client name <input id="search" type="search"></label><label><input id="history" type="checkbox"> Earlier runs today</label><div class="table-scroll"><table><thead><tr><th>Queue</th><th>Name</th><th>Model</th><th>Status</th><th>Actions</th></tr></thead><tbody id="master-rows"></tbody></table></div></section>
    <section id="prints" ${view!=='prints'?'hidden':''}><label>Label printer <select id="printer"><option value="">Select printer</option></select></label><button id="load-printers">Refresh printer list</button><div class="table-scroll"><table><thead><tr><th>Queue</th><th>Name</th><th>Model / type</th><th>Print status</th><th>Action</th></tr></thead><tbody id="print-rows"></tbody></table></div></section></main>`);
})();
