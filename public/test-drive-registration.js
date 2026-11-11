'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const form = $('registration');
  const field = name => form.elements.namedItem(name);
  const instanceId = new URL(location.href).searchParams.get('id') || '';
  let config; let step = 0; let verifiedCode = ''; let busy = false; let steps = [0,1,2,3];
  // The key survives network failures and page refreshes for this phone/tab.
  const storageKey = `tdqsys-registration:${instanceId}`;
  let submissionKey;
  try { submissionKey = sessionStorage.getItem(storageKey); } catch { /* private browsing */ }
  submissionKey ||= crypto.randomUUID();
  try { sessionStorage.setItem(storageKey, submissionKey); } catch { /* in-memory retry remains available */ }
  function show() {
    document.querySelectorAll('[data-step]').forEach(section => { section.hidden = +section.dataset.step !== step; });
    $('progress').textContent = `Step ${steps.indexOf(step) + 1} of ${steps.length}`;
    $('back').hidden = step === 0; $('next').hidden = step === 3; $('submit').hidden = step !== 3;
    $('message').textContent = '';
  }
  function validStep() {
    const controls = document.querySelector(`[data-step="${step}"]`).querySelectorAll('input,select');
    for (const input of controls) if (!input.disabled && !input.reportValidity()) return false;
    if (step === 1 && !form.querySelector('[name=modelIds]:checked')) {
      $('message').textContent = 'Select at least one vehicle model.'; return false;
    }
    return true;
  }
  async function post(action, body, headers = {}) {
    const response = await fetch(`/api/test-drive/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.fields ? Object.values(result.fields).join('\n') : result.error || 'Please try again.');
    return result;
  }
  $('next').onclick = () => { if (validStep()) { step = steps[steps.indexOf(step) + 1]; show(); } };
  $('back').onclick = () => { step = steps[steps.indexOf(step) - 1]; show(); };
  field('seCode').oninput = () => { verifiedCode = ''; $('submit').disabled = true; $('se-details').textContent = ''; };
  field('privacyAccepted').onchange = () => { $('submit').disabled = busy || !verifiedCode || verifiedCode !== field('seCode').value || !field('privacyAccepted').checked; };
  $('validate-code').onclick = async () => {
    if (!field('seCode').reportValidity()) return;
    $('validate-code').disabled = true;
    const code = field('seCode').value;
    try {
      const result = await post('se-code', { instanceId, code });
      if (code !== field('seCode').value) return;
      verifiedCode = code;
      $('se-details').textContent = `${result.name} · ${result.dealership}`;
      $('submit').disabled = !field('privacyAccepted').checked;
    } catch (error) { $('message').textContent = error.message; }
    finally { $('validate-code').disabled = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || verifiedCode !== field('seCode').value || !verifiedCode) return;
    if (!field('privacyAccepted').checked) { step = 0; show(); field('privacyAccepted').reportValidity(); return; }
    busy = true; $('submit').disabled = true; $('message').textContent = 'Submitting…';
    const body = { instanceId, modelIds: [...form.querySelectorAll('[name=modelIds]:checked')].map(input => input.value),
      privacyAccepted: field('privacyAccepted').checked, waiverAccepted: field('waiverAccepted').checked, termsAccepted: field('termsAccepted').checked,
      waiverVersion: config.waiverVersion, termsVersion: config.termsVersion };
    for (const key of ['fullName','email','cityAddress','contactNumber','forApplication','forReservation','seCode']) body[key] = field(key).value;
    try {
      const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))))].map(byte => byte.toString(16).padStart(2,'0')).join('');
      try {
        const prior = sessionStorage.getItem(storageKey + ':fingerprint');
        if (prior && prior !== fingerprint) submissionKey = crypto.randomUUID();
        sessionStorage.setItem(storageKey,submissionKey); sessionStorage.setItem(storageKey + ':fingerprint',fingerprint);
      } catch { /* original in-memory identifier still protects retries */ }
      const result = await post('registrations', body, { 'Idempotency-Key': submissionKey });
      $('result').replaceChildren();
      for (const entry of result.entries) {
        const model = config.models.find(m => m.id === entry.modelId);
        const line = document.createElement('p');
        line.textContent = entry.existing ? `You are already registered for ${model?.name || 'this car model'}, your queue number is ${entry.queueNumber}.` : `${model?.name || 'Queue'}: ${entry.queueNumber}`;
        $('result').appendChild(line);
      }
      const message = document.createElement('p'); message.textContent = result.message; $('result').appendChild(message);
      form.hidden = true; $('message').textContent = ''; $('progress').textContent = 'Registration received';
      try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey + ':fingerprint'); } catch { /* optional */ }
    } catch (error) { $('message').textContent = `${error.message} Your details are still here. Retry to check the same submission.`; }
    finally { busy = false; $('submit').disabled = verifiedCode !== field('seCode').value || !field('privacyAccepted').checked; }
  };
  (async () => {
    try {
      const response = await fetch(`/api/test-drive/config?id=${encodeURIComponent(instanceId)}`);
      config = await response.json(); if (!response.ok || config.error) throw Error(config.error || 'Registration unavailable.');
      if (!config.models?.length || typeof config.waiverStatement !== 'string' || typeof config.termsAndConditions !== 'string') throw Error('Registration is being prepared. Please see the facilitator.');
      for (const model of config.models) {
        const label = document.createElement('label'); const input = document.createElement('input');
        input.type = 'checkbox'; input.name = 'modelIds'; input.value = model.id; label.append(input, ` ${model.name}`); $('models').appendChild(label);
      }
      $('waiver').textContent = config.waiverStatement; $('terms').textContent = config.termsAndConditions;
      for (const [name,text] of [['waiver',config.waiverStatement],['terms',config.termsAndConditions]]) {
        const required = !!text.trim();
        $(name+'-question').hidden = !required;
        field(name+'Accepted').required = required;
        field(name+'Accepted').disabled = !required;
      }
      if (!config.waiverStatement.trim() && !config.termsAndConditions.trim()) steps = [0,1,3];
      form.hidden = false; show();
    } catch (error) { $('message').textContent = error.message; }
  })();
})();
