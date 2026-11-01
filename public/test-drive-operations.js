'use strict';
(() => {
  const byId = id => document.getElementById(id);
  let snapshot = { entries: [], models: [], printJobs: [] };
  let busy = false;
  function cell(row, value) {
    const td = document.createElement('td'); td.textContent = value ?? ''; row.appendChild(td);
  }
  async function request(body) {
    if (!window.afDesktop?.testDrive) throw new Error('Open this page inside the TDQSYS desktop app.');
    const result = await window.afDesktop.testDrive(body);
    if (!result.ok) throw new Error(result.error);
    return result;
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
    byId('board').replaceChildren();
    byId('board').style.setProperty('--model-count',Math.max(1,snapshot.models.length));
    for (const model of snapshot.models) {
      const column = document.createElement('article');
      const title = document.createElement('h2'); title.textContent = model.full_name; column.appendChild(title);
      const entries = snapshot.entries.filter(e => e.vehicle_model_id === model.id);
      const count = document.createElement('p'); count.textContent = `${entries.length} registered`; column.appendChild(count);
      for (const entry of entries.filter(e => ['waiting', 'ongoing'].includes(e.status))) {
        const row = document.createElement('div'); row.className = 'entry';
        const number = document.createElement('strong'); number.textContent = String(entry.queue_number).padStart(2, '0'); row.appendChild(number);
        const name = document.createElement('p'); name.textContent = entry.registrations?.full_name || ''; row.appendChild(name);
        const state = document.createElement('small'); state.textContent = entry.status; row.appendChild(state);
        const actions = document.createElement('div'); actions.className = 'actions';
        for (const [label, action, status] of [['Ongoing', 'ongoing'], ['Done', 'status', 'done'], ['No Show', 'status', 'no_show'], ['Call Back','callback']]) {
          const button = document.createElement('button'); button.textContent = label;
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
      cell(row, entry?.queue_number); cell(row, entry?.registrations?.full_name || job.se_daily_checkins?.sales_executives?.name);
      cell(row, model?.full_name || 'Sales Executive code slip'); cell(row, job.status);
      const action = document.createElement('td'), button = document.createElement('button');
      button.textContent = 'Print'; button.disabled = job.status === 'claimed';
      button.onclick = () => mutate({ action: 'print', jobId: job.id, printerName: byId('printer').value });
      action.appendChild(button); row.appendChild(action);
      if (job.status === 'claimed') {
        for (const [label, status] of [['Confirm printed','printed'],['Retry — no label printed','failed']]) {
          const recovery = document.createElement('button'); recovery.textContent = label;
          recovery.onclick = () => mutate({ action:'print-result', jobId:job.id, status, error:'Facilitator checked physical output and requested retry.' }); action.appendChild(recovery);
        }
      }
      byId('print-rows').appendChild(row);
    }
  }
  function renderMaster() {
    byId('master-rows').replaceChildren();
    const query = byId('search').value.trim().toLocaleLowerCase();
    const list = byId('history').checked ? (snapshot.earlierEntries || []) : snapshot.entries;
    for (const entry of list.filter(e => (e.registrations?.full_name || '').toLocaleLowerCase().includes(query))) {
      const row = document.createElement('tr');
      cell(row, entry.queue_number); cell(row, entry.registrations?.full_name);
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
      byId('master-rows').appendChild(row);
    }
  }
  async function refresh() {
    snapshot = await request({ action: 'snapshot', history: byId('history').checked }); render();
  }
  async function mutate(body) {
    if (busy) return; busy = true; byId('message').textContent = 'Saving…';
    try {
      const result = await request(body);
      if (result.audioUrl) { const audio = new Audio(result.audioUrl); await audio.play(); }
      await refresh(); byId('message').textContent = result.audioUrl ? 'Call-back announcement playing.' : 'Saved.';
    }
    catch (error) { byId('message').textContent = error.message; }
    finally { busy = false; }
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
  byId('history').onchange = () => refresh().catch(error => { byId('message').textContent = error.message; });
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
    ['board', 'master', 'prints'].forEach(id => { byId(id).hidden = id !== button.dataset.view; });
  });
  refresh().catch(error => { byId('message').textContent = error.message; });
  loadPrinters();
  let refreshing = false;
  setInterval(async () => {
    if (busy || refreshing || document.hidden) return;
    refreshing = true;
    try { await refresh(); } catch (error) { byId('message').textContent = error.message; }
    finally { refreshing = false; }
  }, 5000);
  let syncingSheets = false;
  setInterval(async () => {
    if (syncingSheets) return; syncingSheets = true;
    try { await request({ action: 'sync-sheets' }); } catch { /* silent background retry */ }
    finally { syncingSheets = false; }
  }, 15000);
})();
