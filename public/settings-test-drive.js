'use strict';
(() => {
  const email = document.getElementById('sheets-share-email');
  const status = document.getElementById('sheets-connection-status');
  const test = document.getElementById('sheets-test');
  const url = document.getElementById('cfg-sheets-url');
  const save = document.getElementById('sheets-save');
  let loaded = false;
  let working = false;
  async function call(body) {
    if (!window.afDesktop?.testDrive) throw new Error('Open Event Setup / QR Codes inside the TDQSYS desktop app.');
    const result = await window.afDesktop.testDrive(body);
    if (!result.ok || result.error) throw new Error(result.error || 'Google Sheets is unavailable.');
    return result;
  }
  (async () => {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) throw Error('Could not load the saved Google Sheets URL. Reload this page before saving.');
      const config = await response.json();
      url.value = config.testDrive?.sheetsUrl || '';
      loaded = true;
    } catch (error) { status.textContent = error.message; return; }
    try {
      const result = await call({ action: 'integration-info' });
      email.value = result.serviceAccountEmail || '';
      if (!result.configured) status.textContent = 'Google Sheets service requires initial administrator setup.';
    } catch (error) { status.textContent = error.message; email.placeholder = 'Account information unavailable'; }
  })();
  document.getElementById('sheets-copy-email').onclick = async () => {
    if (!email.value) return;
    try { await navigator.clipboard.writeText(email.value); status.textContent = 'Account email copied. Share your Sheet with this account as Editor.'; }
    catch { email.select(); status.textContent = 'Select and copy the account email above.'; }
  };
  url.addEventListener('input', () => { status.textContent = ''; });
  test.onclick = async () => {
    if (!loaded || working) return;
    if (!url.value.trim() || !url.reportValidity()) { status.textContent = 'Paste this location’s Google Sheets URL first.'; return; }
    const checkedUrl = url.value.trim();
    working = true; test.disabled = true; status.textContent = 'Connecting your spreadsheet and preparing today’s tab…';
    try {
      const result = await call({ action: 'test-sheets', sheetsUrl: checkedUrl });
      if (url.value.trim() !== checkedUrl) return;
      status.textContent = `Connected: ${result.spreadsheetTitle} / ${result.tabTitle}. Click Save Google Sheets URL to enable automatic background sync. Keep the account shared as Editor for registration writes.`;
    } catch (error) { status.textContent = error.message; }
    finally { working = false; test.disabled = false; }
  };
  save.onclick = async () => {
    if (!loaded || working) return;
    const sheetsUrl = url.value.trim();
    if (sheetsUrl && !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+(?:\/|$)/.test(sheetsUrl)) {
      status.textContent = 'Paste a valid Google Sheets URL.'; return;
    }
    working = true; save.disabled = true;
    status.textContent = 'Saving Google Sheets URL…';
    try {
      if (!window.afDesktop?.testDrive) throw Error('Open Event Setup / QR Codes inside the TDQSYS desktop app.');
      const response = await fetch('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheetsUrl})});
      if (!response.ok) throw Error('Google Sheets URL was not saved. Check the licence and try again.');
      status.textContent = sheetsUrl
        ? 'Google Sheets URL saved. Automatic background sync will use this destination; no separate Settings save is needed.'
        : 'Google Sheets URL cleared. Existing registrations remain queued until a destination is saved.';
      document.getElementById('sheets-status').textContent = sheetsUrl
        ? 'Google Sheets destination saved. Registrations sync automatically while TDQSYS is running.'
        : 'Google Sheets is not connected. Already submitted registrations remain queued for delivery.';
    } catch (error) { status.textContent = error.message; }
    finally { working = false; save.disabled = false; }
  };
})();
