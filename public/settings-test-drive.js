'use strict';
(() => {
  const email = document.getElementById('sheets-share-email');
  const status = document.getElementById('sheets-connection-status');
  const test = document.getElementById('sheets-test');
  const url = document.getElementById('cfg-sheets-url');
  async function call(body) {
    if (!window.afDesktop?.testDrive) throw new Error('Open System Settings inside the TDQSYS desktop app.');
    const result = await window.afDesktop.testDrive(body);
    if (!result.ok || result.error) throw new Error(result.error || 'Google Sheets is unavailable.');
    return result;
  }
  (async () => {
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
    if (!url.value.trim() || !url.reportValidity()) { status.textContent = 'Paste this location’s Google Sheets URL first.'; return; }
    const checkedUrl = url.value.trim();
    test.disabled = true; status.textContent = 'Connecting your spreadsheet and preparing today’s tab…';
    try {
      const result = await call({ action: 'test-sheets', sheetsUrl: checkedUrl });
      if (url.value.trim() !== checkedUrl) return;
      status.textContent = `Connected: ${result.spreadsheetTitle} / ${result.tabTitle}. Save Settings to enable automatic background sync. Keep the account shared as Editor for registration writes.`;
    } catch (error) { status.textContent = error.message; }
    finally { test.disabled = false; }
  };
})();
