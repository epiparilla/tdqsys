'use strict';
(() => {
  const byId = id => document.getElementById(id);
  let snapshot = { entries: [], models: [], printJobs: [] };
  let busy = false;
  let licenceCanWrite = false;
  let licenceStatus = null;
  function applyLicenceLock(st) {
    licenceStatus = st; licenceCanWrite = !!st?.canWrite;
    document.querySelectorAll('[data-write]').forEach(button => { button.disabled = busy || !licenceCanWrite; });
    byId('licence-locked').hidden = licenceCanWrite;
    byId('licence-locked-why').textContent = licenceCanWrite ? '' : st?.state === 'expired'
      ? `This licence expired on ${st.until || 'an unknown date'}.`
      : st?.state === 'revoked' ? (st.detail || 'This licence was revoked.') : 'This location is not licensed.';
  }
  async function refreshLicence() {
    try {
      const response = await fetch('/api/license');
      if (!response.ok) throw Error('Cannot verify the licence.');
      applyLicenceLock(await response.json());
    } catch { applyLicenceLock({canWrite:false}); }
  }
  function formatTicket(entry, model) {
    return entry ? `${model?.display_prefix || ''}${String(entry.queue_number).padStart(2,'0')}` : '';
  }
  function cell(row, value) {
    const td = document.createElement('td'); td.textContent = value ?? ''; row.appendChild(td);
  }
  async function request(body) {
    if (!window.afDesktop?.testDrive) throw new Error('Open this page inside the TDQSYS desktop app.');
    const result = await window.afDesktop.testDrive(body);
    if (!result.ok) throw new Error(result.error);
    return result;
  }
  function renderBrand() {
    const brands = snapshot.brands || [{key:'brand1',name:'Brand 1',color:'#EB0A1E'}];
    const selectedKey = document.body.dataset.brand || brands[0]?.key;
    const selected = brands.find(brand => brand.key === selectedKey);
    document.body.style.setProperty('--brand-accent', selected?.color || brands[0]?.color || '#EB0A1E');
    byId('brand-controls-title').textContent = selected ? `${selected.name} CONTROLS` : 'Brand 2 is not enabled';
    for (const [index,id] of ['brand1-link','brand2-link'].entries()) {
      const brand = brands[index]; const link = byId(id); link.hidden = !brand;
      if (brand) {
        link.textContent = `${brand.name} Queue Board`;
        if (document.body.dataset.view === 'board' && brand.key === selectedKey) link.setAttribute('aria-current','page');
        else link.removeAttribute('aria-current');
      }
    }
    return selected ? snapshot.models.filter(model => !model.brand_key || model.brand_key === selected.key).sort((a,b) => a.unit_index-b.unit_index) : [];
  }
  function render() {
    byId('registration-links').replaceChildren();
    for (const [kind, link] of Object.entries(snapshot.registrationLinks || {})) {
      const card = document.createElement('div'); const title = document.createElement('p');
      title.textContent = kind === 'se' ? 'SE registration' : 'Client registration'; card.appendChild(title);
      const canvas = document.createElement('canvas'); canvas.style.width = '160px'; canvas.style.height = '160px';
      const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
      const count = qr.getModuleCount(), scale = 8, size = (count + 8) * scale;
      canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = 'black';
      for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
      card.appendChild(canvas); const anchor = document.createElement('a'); anchor.href = canvas.toDataURL('image/png');
      anchor.download = `tdqsys-${kind}-registration.png`; anchor.textContent = 'Download QR'; card.appendChild(anchor);
      byId('registration-links').appendChild(card);
    }
    byId('run').textContent = snapshot.run ? `${snapshot.run.operating_day} · Run ${snapshot.run.run_number} · ${snapshot.entries.length} tickets` : 'No active queue run. Configure models and open a run before accepting registrations.';
    byId('sheets-status').textContent = snapshot.sheetsStatus?.hasUrl
      ? 'Google Sheets destination saved. Registrations sync automatically while TDQSYS is running.'
      : 'Google Sheets is not connected for this location. Paste its URL in System Settings and save. Already submitted registrations remain queued for delivery.';
    byId('board').replaceChildren();
    const visibleModels = renderBrand();
    for (const model of visibleModels) {
      const column = document.createElement('article');
      const title = document.createElement('h2'); title.textContent = model.full_name; column.appendChild(title);
      const entries = snapshot.entries.filter(e => e.vehicle_model_id === model.id);
      const count = document.createElement('p'); count.className = 'registered-count'; count.textContent = `Total registered: ${new Set(entries.map(e => e.registration_id)).size}`; column.appendChild(count);
      for (const entry of entries.filter(e => ['waiting', 'ongoing'].includes(e.status))) {
        const row = document.createElement('div'); row.className = 'entry'; row.dataset.status = entry.status;
        const summary = document.createElement('div'); summary.className = 'entry-summary';
        const number = document.createElement('strong'); number.textContent = formatTicket(entry,model); summary.appendChild(number);
        const name = document.createElement('span'); name.className = 'client-name'; name.textContent = entry.registrations?.full_name || ''; name.title = name.textContent; summary.appendChild(name);
        const state = document.createElement('small'); state.textContent = entry.status === 'ongoing' ? 'On going' : 'Waiting'; summary.appendChild(state);
        row.appendChild(summary);
        const actions = document.createElement('div'); actions.className = 'actions';
        for (const [label, action, status] of [['Ongoing', 'ongoing'], ['Done', 'status', 'done'], ['No Show', 'status', 'no_show'], ['Call Back','callback']]) {
          const button = document.createElement('button'); button.textContent = label; button.dataset.write = '';
          button.onclick = () => mutate({ action, entryId: entry.id, status }); actions.appendChild(button);
        }
        row.appendChild(actions); column.appendChild(row);
      }
      byId('board').appendChild(column);
    }
    renderMaster();
    byId('print-rows').replaceChildren();
    for (const job of snapshot.printJobs) {
      const entry = snapshot.entries.find(e => e.id === job.test_drive_entry_id);
      const model = snapshot.models.find(m => m.id === entry?.vehicle_model_id);
      const row = document.createElement('tr');
      cell(row, job.kind === 'se_code_slip' ? job.seCode : formatTicket(entry,model)); cell(row, entry?.registrations?.full_name || job.se_daily_checkins?.sales_executives?.name);
      cell(row, model?.full_name || 'Sales Executive code slip'); cell(row, job.status);
      const action = document.createElement('td'), button = document.createElement('button');
      button.textContent = 'Print'; button.dataset.write = ''; button.hidden = job.status === 'claimed';
      button.onclick = () => mutate({ action: 'print', jobId: job.id, printerName: byId('printer').value });
      action.appendChild(button); row.appendChild(action);
      if (job.status === 'claimed') {
        for (const [label, status] of [['Confirm printed','printed'],['Retry — no label printed','failed']]) {
          const recovery = document.createElement('button'); recovery.textContent = label;
          recovery.dataset.write = '';
          recovery.onclick = () => mutate({ action:'print-result', jobId:job.id, status, error:'Facilitator checked physical output and requested retry.' }); action.appendChild(recovery);
        }
      }
      byId('print-rows').appendChild(row);
    }
    renderSales();
    applyLicenceLock(licenceStatus);
  }
  function renderSales() {
    byId('sales-rows').replaceChildren();
    const query = byId('sales-search').value.trim().toLocaleLowerCase();
    const checkins = snapshot.seCheckins || [];
    byId('sales-count').textContent = `${checkins.length} Sales Executive check-ins`;
    for (const checkin of checkins.filter(item => `${item.name} ${item.dealership}`.toLocaleLowerCase().includes(query))) {
      const row = document.createElement('tr');
      cell(row,checkin.code || 'Expired'); cell(row,checkin.name); cell(row,checkin.dealership);
      cell(row,checkin.operatingDay); cell(row,new Date(checkin.expiresAt).toLocaleString()); cell(row,checkin.code ? 'Active' : 'Expired');
      byId('sales-rows').appendChild(row);
    }
  }
  function renderMaster() {
    byId('master-rows').replaceChildren();
    const query = byId('search').value.trim().toLocaleLowerCase();
    const list = byId('history').checked ? (snapshot.earlierEntries || []) : snapshot.entries;
    for (const entry of list.filter(e => (e.registrations?.full_name || '').toLocaleLowerCase().includes(query))) {
      const row = document.createElement('tr');
      cell(row, formatTicket(entry,snapshot.models.find(m => m.id === entry.vehicle_model_id) || entry.vehicle_models)); cell(row, entry.registrations?.full_name);
      cell(row, snapshot.models.find(m => m.id === entry.vehicle_model_id)?.full_name || entry.vehicle_models?.full_name); cell(row, entry.status);
      const actions = document.createElement('td');
      const reissue = document.createElement('button'); reissue.textContent = byId('history').checked ? 'Issue in current run' : 'Reprint / issue new number';
      reissue.onclick = () => mutate({ action: 'reissue', entryId: entry.id }); actions.appendChild(reissue);
      const selection = document.createElement('select'); selection.add(new Option('Select another model', ''));
      snapshot.models.forEach(model => selection.add(new Option(model.full_name, model.id)));
      actions.appendChild(selection);
      const add = document.createElement('button'); add.textContent = 'Add model';
      add.onclick = () => { if (selection.value) mutate({ action: 'reissue', entryId: entry.id, modelId: selection.value }); };
      actions.appendChild(add);
      if (!byId('history').checked && entry.status === 'waiting') {
        const change = document.createElement('button'); change.textContent = 'Change model';
        change.onclick = () => { if (selection.value) mutate({ action: 'reissue', entryId: entry.id, modelId: selection.value, cancelSource: true }); };
        actions.appendChild(change);
      }
      row.appendChild(actions);
      actions.querySelectorAll('button').forEach(button => { button.dataset.write = ''; });
      byId('master-rows').appendChild(row);
    }
    applyLicenceLock(licenceStatus);
  }
  async function refresh() {
    snapshot = await request({ action: 'snapshot', history: byId('history').checked,
      includePrintCodes:document.body.dataset.view === 'prints', includeSalesExecutives:document.body.dataset.view === 'sales',salesHistory:byId('sales-history').checked }); render();
  }
  async function mutate(body) {
    if (busy || !licenceCanWrite) return; busy = true; applyLicenceLock(licenceStatus); byId('message').textContent = 'Saving...';
    try {
      const result = await request(body);
      if (result.audioUrl) { const audio = new Audio(result.audioUrl); await audio.play(); }
      await refresh(); byId('message').textContent = body.action === 'reset'
        ? 'New queue run opened. Every model and the TV display have been reset to zero. Client and SE history are retained.'
        : result.audioUrl ? 'Call-back announcement playing.' : 'Saved.';
    }
    catch (error) { byId('message').textContent = error.message; }
    finally { busy = false; applyLicenceLock(licenceStatus); }
  }
  byId('refresh').onclick = () => refresh().catch(error => { byId('message').textContent = error.message; });
  byId('configure').onclick = () => mutate({ action: 'configure' });
  byId('export').onclick = async () => {
    try {
      const backup = await request({ action:'snapshot', history:true });
      const rows = [['Run ID','Queue number','Name','Email','City','Contact','Model','Status','Issued at','Print status']];
      for (const entry of [...backup.entries,...(backup.earlierEntries || [])]) {
        const registration = entry.registrations || {};
        rows.push([entry.queue_run_id,entry.queue_number,registration.full_name,registration.email,registration.city_address,registration.contact_number,
          backup.models.find(m => m.id === entry.vehicle_model_id)?.full_name || entry.vehicle_models?.full_name,entry.status,entry.issued_at,
          backup.printJobs.find(j => j.test_drive_entry_id === entry.id)?.status || 'See print history']);
      }
      const quote = value => { let text = String(value ?? ''); if (/^[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g,'""') + '"'; };
      const url = URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row => row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
      const anchor = document.createElement('a'); anchor.href=url; anchor.download=`tdqsys-registrants-${backup.run?.operating_day || 'today'}.csv`; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      byId('message').textContent='Backup downloaded. Earlier runs and client records remain saved in the database.';
    } catch (error) { byId('message').textContent=error.message; }
  };
  async function loadPrinters() {
    try {
      const result = await request({ action: 'printers' });
      byId('printer').replaceChildren(new Option('Select printer', ''));
      result.printers.forEach(printer => byId('printer').add(new Option(printer.displayName || printer.name, printer.name)));
      byId('printer').value = localStorage.getItem('tdqsys-label-printer') || '';
    } catch (error) { byId('message').textContent = error.message; }
  }
  byId('load-printers').onclick = loadPrinters;
  byId('printer').onchange = () => localStorage.setItem('tdqsys-label-printer', byId('printer').value);
  byId('reset-form').onsubmit = event => {
    event.preventDefault();
    if (!byId('reset-form').reportValidity()) return;
    mutate({ action: 'reset', reason: byId('reset-reason').value.trim() }); byId('reset-confirm').checked = false;
  };
  byId('search').oninput = renderMaster;
  byId('sales-search').oninput = renderSales;
  byId('sales-history').onchange = () => refresh().catch(error => { byId('message').textContent = error.message; });
  byId('history').onchange = () => refresh().catch(error => { byId('message').textContent = error.message; });
  refreshLicence().then(() => refresh()).catch(error => { byId('message').textContent = error.message; });
  setInterval(refreshLicence, 30000);
  if (document.body.dataset.view === 'prints') loadPrinters();
  let refreshing = false;
  setInterval(async () => {
    if (busy || refreshing || document.hidden) return;
    refreshing = true;
    try { await refresh(); } catch (error) { byId('message').textContent = error.message; }
    finally { refreshing = false; }
  }, 5000);
})();
