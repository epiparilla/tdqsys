'use strict';
// Renderer logic for TDQSYS Licence Authority GUI


let currentCode = '';
let currentPayload = null;

// Utility
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setText(el, text) { el.textContent = text; }
function setHTML(el, html) { el.innerHTML = html; }

// Key Management
async function loadKeyStatus() {
  const res = await licenseAPI.listKeys();
  const statusEl = document.getElementById('key-status');
  if (res.ok) {
    statusEl.innerHTML = `<span class="status-ok">✓ Private key loaded</span> <code>${res.keyPath}</code>`;
    show(document.getElementById('btn-show-public'));
    show(document.getElementById('btn-copy-public'));
  } else {
    statusEl.innerHTML = `<span class="status-error">✗ No private key found</span> — run <strong>Generate Keypair</strong> to create one.`;
    hide(document.getElementById('btn-show-public'));
    hide(document.getElementById('btn-copy-public'));
    hide(document.getElementById('public-key-display'));
  }
}

document.getElementById('btn-keygen').addEventListener('click', async () => {
  const btn = document.getElementById('btn-keygen');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const res = await licenseAPI.keygen();
    if (res.ok) {
      alert('Keypair generated!\n\nPrivate key saved to:\n' + res.privateKeyPath +
        '\n\nBACK IT UP NOW — two physical locations + printed copy.\n\nPublic key ready to paste into license.js.');
      await loadKeyStatus();
    } else {
      alert('Keygen failed: ' + res.error);
    }
  } catch (e) {
    alert('Keygen error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Keypair';
  }
});

document.getElementById('btn-show-public').addEventListener('click', async () => {
  const res = await licenseAPI.getPublicKey();
  if (res.ok) {
    const ta = document.getElementById('public-key-text');
    ta.value = res.publicKey;
    show(document.getElementById('public-key-display'));
  } else {
    alert('Error: ' + res.error);
  }
});

document.getElementById('btn-copy-public').addEventListener('click', async () => {
  const res = await licenseAPI.getPublicKey();
  if (res.ok) {
    await navigator.clipboard.writeText(res.publicKey);
    alert('Public key copied to clipboard!');
  } else {
    alert('Error: ' + res.error);
  }
});

// Issue Licence
const issueForm = document.getElementById('issue-form');

async function performIssueLicence() {
  const statusEl = document.getElementById('issue-status');
  const instanceId = (document.getElementById('issue-instance').value || '').trim();
  const customer = (document.getElementById('issue-customer').value || '').trim();
  const site = (document.getElementById('issue-site').value || '').trim();
  const from = (document.getElementById('issue-from').value || '').trim();
  const until = (document.getElementById('issue-until').value || '').trim();
  const keyId = (document.getElementById('issue-keyid').value || '').trim() || 'k1';

  if (!instanceId) {
    statusEl.innerHTML = '<span class="status-error">Instance ID is required.</span>';
    document.getElementById('issue-instance').focus();
    return;
  }
  if (!/^[0-9a-fA-F-]{1,64}$/.test(instanceId)) {
    statusEl.innerHTML = '<span class="status-error">Invalid Instance ID format.</span>';
    document.getElementById('issue-instance').focus();
    return;
  }
  if (!from) {
    statusEl.innerHTML = '<span class="status-error">"Valid From" date is required.</span>';
    document.getElementById('issue-from').focus();
    return;
  }
  if (!until) {
    statusEl.innerHTML = '<span class="status-error">"Valid Until" date is required.</span>';
    document.getElementById('issue-until').focus();
    return;
  }
  if (until < from) {
    statusEl.innerHTML = '<span class="status-error">"Valid Until" must be on or after "Valid From".</span>';
    return;
  }

  const btn = document.getElementById('btn-issue');
  if (btn) { btn.disabled = true; btn.textContent = 'Issuing…'; }
  statusEl.textContent = 'Generating licence code…';

  try {
    const res = await licenseAPI.issueLicence({ instanceId, customer, site, from, until, keyId });
    if (res && res.ok) {
      currentCode = res.code;
      currentPayload = res.payload;
      const ta = document.getElementById('issued-code');
      ta.value = res.code;
      show(document.getElementById('issue-result'));
      statusEl.innerHTML = '<span class="status-ok">✓ Licence code generated successfully!</span>';
      document.getElementById('issue-result').scrollIntoView({ behavior: 'smooth' });
    } else {
      statusEl.innerHTML = '<span class="status-error">Failed: ' + (res?.error || 'Unknown error') + '</span>';
    }
  } catch (e) {
    statusEl.innerHTML = '<span class="status-error">Error: ' + e.message + '</span>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Issue Licence'; }
  }
}

const btnIssue = document.getElementById('btn-issue');
if (btnIssue) btnIssue.addEventListener('click', performIssueLicence);
if (issueForm) issueForm.addEventListener('submit', (e) => {
  e.preventDefault();
  performIssueLicence();
});

document.getElementById('btn-clear-issue').addEventListener('click', () => {
  issueForm.reset();
  document.getElementById('issue-keyid').value = 'k1';
  document.getElementById('issue-status').textContent = '';
  hide(document.getElementById('issue-result'));
  currentCode = '';
  currentPayload = null;
});

document.getElementById('btn-copy-code').addEventListener('click', async () => {
  const code = (currentCode || document.getElementById('issued-code').value || '').trim();
  if (!code) return;
  await navigator.clipboard.writeText(code);
  alert('Licence code copied to clipboard!');
});

document.getElementById('btn-save-code').addEventListener('click', async () => {
  const code = (currentCode || document.getElementById('issued-code').value || '').trim();
  if (!code) {
    alert('No licence code available to save. Please issue a licence first.');
    return;
  }
  const res = await licenseAPI.showSaveDialog({
    title: 'Save Licence File',
    defaultPath: 'licence.license',
    filters: [
      { name: 'Licence File (*.license)', extensions: ['license'] },
      { name: 'Text File (*.txt)', extensions: ['txt'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });
  if (!res.canceled && res.filePath) {
    const saveRes = await licenseAPI.saveFile(res.filePath, code);
    if (saveRes && saveRes.ok) {
      alert('Licence saved to:\n' + res.filePath);
    } else {
      alert('Failed to save licence file: ' + (saveRes?.error || 'Unknown error'));
    }
  }
});

// Verify Licence
document.getElementById('btn-verify-paste').addEventListener('click', () => {
  const input = document.getElementById('verify-input');
  show(input);
  input.focus();
  input.onblur = () => {
    if (!input.value.trim()) hide(input);
  };
});

document.getElementById('btn-verify-file').addEventListener('click', async () => {
  const res = await licenseAPI.showOpenDialog({
    title: 'Select Licence File',
    filters: [{ name: 'Licence Files', extensions: ['license', 'txt'] }]
  });
  if (!res.canceled && res.filePaths.length > 0) {
    const readRes = await licenseAPI.readFile(res.filePaths[0]);
    if (readRes.ok) {
      const code = readRes.content.trim();
      document.getElementById('verify-input').value = code;
      show(document.getElementById('verify-input'));
      await doVerify(code);
    } else {
      alert('Failed to read file: ' + readRes.error);
    }
  }
});

document.getElementById('verify-input').addEventListener('blur', async () => {
  const code = document.getElementById('verify-input').value.trim();
  if (code) await doVerify(code);
});

async function doVerify(code) {
  if (!code.startsWith('TDQS1.')) return;
  const res = await licenseAPI.verifyLicence(code);
  const detailsEl = document.getElementById('verify-details');
  if (res.ok) {
    const p = res.payload;
    let html = '<div style="margin-bottom:0.5rem;"><strong>Status:</strong> ' +
      (res.valid ? '<span class="status-ok">VALID ✓</span>' : '<span class="status-error">INVALID ✗</span>') + '</div>';
    html += '<div><strong>Instance:</strong> ' + (p.i || '—') + '</div>';
    html += '<div><strong>Customer:</strong> ' + (p.c || '—') + '</div>';
    html += '<div><strong>Valid:</strong> ' + (p.b || '—') + ' → ' + (p.x || '—') + '</div>';
    html += '<div><strong>Key ID:</strong> ' + (res.keyId || '—') + '</div>';
    if (!res.valid) {
      html += '<div class="status-error" style="margin-top:0.5rem;">Signature INVALID — licence rejected.</div>';
    }
    detailsEl.innerHTML = html;
  } else {
    detailsEl.innerHTML = '<span class="status-error">Error: ' + res.error + '</span>';
  }
  show(document.getElementById('verify-result'));
}

document.getElementById('btn-load-request').addEventListener('click', async () => {
  const res = await licenseAPI.showOpenDialog({
    title: 'Load Customer Request',
    filters: [{ name: 'Request JSON', extensions: ['json'] }]
  });
  if (!res.canceled && res.filePaths.length > 0) {
    const res2 = await licenseAPI.readRequest(res.filePaths[0]);
    const el = document.getElementById('request-details');
    if (res2.ok) {
      const r = res2.request;
      el.textContent = JSON.stringify(r, null, 2);
    } else {
      el.textContent = 'Error: ' + res2.error;
      el.style.color = '#f87171';
    }
    show(document.getElementById('request-result'));
  }
});

// Initial load
loadKeyStatus();
