'use strict';
// Read-only audio preparation status, independent of queue mutations.
{ const statusScript=document.createElement('script'); statusScript.src='speech-cache-status.js'; document.head.appendChild(statusScript); }
(() => {
  const byId = id => document.getElementById(id);
  let snapshot = { entries: [], models: [], printJobs: [] };
  let busy = false;
  let actionGeneration = 0;
  const selectedModels = new Map();
  let boardCycleWidth = 0;
  let boardDrag = null;
  let boardSignature = '';
  let boardViewportWidth = -1;
  let boardScrollFrame = null;
  let boardScrollTarget = null;
  let registrationLinksSignature = '';
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
  function sortedRows(rows, key, direction, value) {
    if(!key)return rows;
    return [...rows].sort((a,b)=>String(value(a,key)??'').localeCompare(String(value(b,key)??''),undefined,{numeric:true,sensitivity:'base'})*(direction==='desc'?-1:1));
  }
  function loopPosition(position, cycleWidth) {
    if(cycleWidth<=0)return position;
    return cycleWidth+((position-cycleWidth)%cycleWidth+cycleWidth)%cycleWidth;
  }
  function scrollBoard(delta) {
    if(!boardCycleWidth)return;
    scheduleBoardPosition((boardScrollTarget ?? byId('board').scrollLeft)+delta);
  }
  function scheduleBoardPosition(position) {
    boardScrollTarget=position;
    if(boardScrollFrame!==null)return;
    boardScrollFrame=requestAnimationFrame(flushBoardScroll);
  }
  function flushBoardScroll() {
    if(boardScrollFrame!==null)cancelAnimationFrame(boardScrollFrame);
    boardScrollFrame=null;
    if(boardScrollTarget!==null && boardCycleWidth)byId('board').scrollLeft=loopPosition(boardScrollTarget,boardCycleWidth);
    boardScrollTarget=null;
  }
  async function request(body) {
    if (!window.afDesktop?.testDrive) throw new Error('Open this page inside the TDQSYS desktop app.');
    const result = await window.afDesktop.testDrive(body);
    if (!result.ok) throw new Error(result.error);
    return result;
  }
  function renderBrand() {
    const brands = snapshot.brands || (typeof window!=='undefined' ? window.TDQSYS_FACILITATOR_BOOTSTRAP?.brands : null) || [];
    if(!brands.length)return [];
    const selected = applyFacilitatorBrand(brands);
    return selected ? snapshot.models.filter(model => !model.brand_key || model.brand_key === selected.key).sort((a,b) => a.unit_index-b.unit_index) : [];
  }
  function render() {
    if(document.body.dataset.view==='setup' && typeof updateMirrorLink==='function')updateMirrorLink(snapshot.mirrorLink ?? window.TDQSYS_FACILITATOR_BOOTSTRAP?.mirrorLink ?? '');
    const linksSignature=JSON.stringify(snapshot.registrationLinks || {});
    if(document.body.dataset.view==='setup' && linksSignature!==registrationLinksSignature) {
    registrationLinksSignature=linksSignature;
    byId('registration-links').replaceChildren();
    for (const [kind, link] of Object.entries(snapshot.registrationLinks || {})) {
      const card = document.createElement('div'); const title = document.createElement('p');
      title.textContent = kind === 'se' ? 'Agent registration' : 'Client registration'; card.appendChild(title);
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
    }
    byId('run').textContent = snapshot.run ? `${snapshot.run.operating_day} · Run ${snapshot.run.run_number} · ${snapshot.entries.length} tickets` : 'No active queue run. Configure models and open a run before accepting registrations.';
    byId('sheets-status').textContent = snapshot.sheetsStatus?.hasUrl
      ? 'Google Sheets destination saved. Registrations sync automatically while TDQSYS is running.'
      : 'Google Sheets is not connected for this location. Paste its URL in Event Setup / QR Codes and save. Already submitted registrations remain queued for delivery.';
    const local=snapshot.localSync;
    if(byId('local-sync-status'))byId('local-sync-status').textContent=!local ? '' : local.blocked
      ? `Queue actions are saved locally and need review: ${local.lastError}`
      : !local.ready ? `Loading today's queue into this desktop${local.lastError ? ': '+local.lastError : '...'}`
      : local.pending ? `${local.pending} queue action(s) saved locally; cloud sync pending${local.lastError ? '. '+local.lastError : '.'}`
      : local.lastError ? `Using the saved local queue. Cloud connection: ${local.lastError}` : 'Local queue ready. Cloud synchronization is up to date.';
    if(byId('archive-local-conflicts'))byId('archive-local-conflicts').hidden=!local?.earlierRunPending;
    if(byId('retry-local-sync'))byId('retry-local-sync').hidden=!local?.blocked || local?.earlierRunPending;
    renderBoard();
    renderMaster();
    renderPrints();
    renderSales();
    applyLicenceLock(licenceStatus);
  }
  function createBoardColumn(model) {
      const column = document.createElement('article');
      column.dataset.modelId=model.id;
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
      return column;
  }
  function renderBoard() {
    if(boardDrag)return;
    const board=byId('board'), oldCycle=boardCycleWidth;
    const models=renderBrand();
    const signature=JSON.stringify([models,snapshot.entries.map(entry=>[entry.id,entry.vehicle_model_id,entry.registration_id,entry.queue_number,entry.status,entry.registrations?.full_name])]);
    if(boardSignature===signature && boardViewportWidth===board.clientWidth)return;
    flushBoardScroll();
    boardSignature=signature;boardViewportWidth=board.clientWidth;
    const oldPosition=board.scrollLeft || 0;
    const phase=oldCycle ? (loopPosition(oldPosition,oldCycle)-oldCycle)/oldCycle : 0;
    board.replaceChildren();
    const columns=models.map(createBoardColumn);
    columns.forEach(column=>board.appendChild(column));
    const columnWidth=columns[0]?.getBoundingClientRect?.().width || columns[0]?.offsetWidth || 0;
    const stride=columnWidth+12;
    const cycle=models.length*stride;
    boardCycleWidth=columnWidth && cycle-12>board.clientWidth+1 ? cycle : 0;
    if(boardCycleWidth) {
      // Three identical interactive cycles keep a matching neighbour on both
      // sides. Recentering by a full cycle changes no visible pixel or ticket.
      for(let copy=0;copy<2;copy++)for(const model of models)board.appendChild(createBoardColumn(model));
      board.scrollLeft=boardCycleWidth+(oldCycle ? phase*boardCycleWidth : Math.min(oldPosition,boardCycleWidth-1));
    } else board.scrollLeft=oldCycle ? 0 : oldPosition;
    applyLicenceLock(licenceStatus);
  }
  function renderPrints() {
    byId('print-rows').replaceChildren();
    const query=(byId('print-search')?.value || '').trim().toLocaleLowerCase();
    for (const job of snapshot.printJobs) {
      const entry = snapshot.entries.find(e => e.id === job.test_drive_entry_id);
      const model = snapshot.models.find(m => m.id === entry?.vehicle_model_id);
      const name=entry?.registrations?.full_name || job.se_daily_checkins?.sales_executives?.name || '';
      if(!name.toLocaleLowerCase().includes(query))continue;
      const row = document.createElement('tr');
      cell(row, job.kind === 'se_code_slip' ? job.seCode : formatTicket(entry,model)); cell(row, entry?.registrations?.full_name || job.se_daily_checkins?.sales_executives?.name);
      cell(row, model?.full_name || 'Agent code slip'); cell(row, job.status);
      const action = document.createElement('td'), button = document.createElement('button');
      button.textContent = 'Print'; button.dataset.write = ''; button.hidden = job.status === 'claimed';
      button.onclick = () => mutate({ action: 'print', jobId: job.id, printerName: byId('printer').value });
      action.appendChild(button); row.appendChild(action);
      if(['pending','failed'].includes(job.status)) {
        const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.dataset.write='';
        cancel.onclick=()=>mutate({action:'cancel-print',jobId:job.id});action.appendChild(cancel);
      }
      if (job.status === 'claimed') {
        for (const [label, status] of [['Confirm printed','printed'],['Retry — no label printed','failed']]) {
          const recovery = document.createElement('button'); recovery.textContent = label;
          recovery.dataset.write = '';
          recovery.onclick = () => mutate({ action:'print-result', jobId:job.id, status, error:'Facilitator checked physical output and requested retry.' }); action.appendChild(recovery);
        }
      }
      byId('print-rows').appendChild(row);
    }
    applyLicenceLock(licenceStatus);
  }
  function renderSales() {
    byId('sales-rows').replaceChildren();
    const query = byId('sales-search').value.trim().toLocaleLowerCase();
    const checkins = snapshot.seCheckins || [];
    byId('sales-count').textContent = `${checkins.length} Agent check-ins`;
    const sorted=sortedRows(checkins,byId('sales-sort')?.value,byId('sales-direction')?.value,(item,key)=>key==='status' ? item.revokedAt?'Reset':item.code?'Active':'Expired':item[key]);
    for (const checkin of sorted.filter(item => `${item.name} ${item.dealership}`.toLocaleLowerCase().includes(query))) {
      const row = document.createElement('tr');
      cell(row,checkin.code || 'Expired'); cell(row,checkin.name); cell(row,checkin.dealership);
      cell(row,checkin.operatingDay); cell(row,new Date(checkin.expiresAt).toLocaleString()); cell(row,checkin.revokedAt ? 'Reset' : checkin.code ? 'Active' : 'Expired');
      const action=document.createElement('td');
      if(checkin.code) {
        const button=document.createElement('button');button.textContent='Reprint';button.dataset.write='';
        button.onclick=()=>mutate({action:'reprint-se-code',checkinId:checkin.id});action.appendChild(button);
      }
      row.appendChild(action);
      byId('sales-rows').appendChild(row);
    }
  }
  function renderMaster() {
    if(document.activeElement?.matches?.('.master-actions select'))return;
    byId('master-rows').replaceChildren();
    const query = byId('search').value.trim().toLocaleLowerCase();
    const list = sortedRows(byId('history').checked ? (snapshot.earlierEntries || []) : snapshot.entries,
      byId('master-sort')?.value,byId('master-direction')?.value,(entry,key)=>key==='name'?entry.registrations?.full_name:key==='agent'?entry.agentName:key==='model'?snapshot.models.find(m=>m.id===entry.vehicle_model_id)?.full_name || entry.vehicle_models?.full_name:entry[key]);
    for (const entry of list.filter(e => (e.registrations?.full_name || '').toLocaleLowerCase().includes(query))) {
      const row = document.createElement('tr');
      cell(row, formatTicket(entry,snapshot.models.find(m => m.id === entry.vehicle_model_id) || entry.vehicle_models)); cell(row, entry.registrations?.full_name);
      cell(row,[entry.agentName,entry.agentCode].filter(Boolean).join(' / '));
      cell(row, snapshot.models.find(m => m.id === entry.vehicle_model_id)?.full_name || entry.vehicle_models?.full_name); cell(row, entry.status);
      const actions = document.createElement('td'); actions.className='master-actions';
      const reissue = document.createElement('button'); reissue.textContent = byId('history').checked ? 'Issue in current run' : 'Reprint / issue new number';
      reissue.onclick = () => mutate({ action: 'reissue', entryId: entry.id,printNow:true,printerName:byId('master-printer').value }); actions.appendChild(reissue);
      const selection = document.createElement('select'); selection.add(new Option('Select another model', ''));
      snapshot.models.forEach(model => selection.add(new Option(model.full_name, model.id)));
      selection.value=selectedModels.get(entry.id) || '';
      selection.onchange=()=>selectedModels.set(entry.id,selection.value);
      selection.onblur=()=>renderMaster();
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
  async function refresh(refreshCloud=false) {
    const generation=actionGeneration;
    const next = await request({ action: 'snapshot',refreshCloud, history: byId('history').checked,
      includeAgentCodes:document.body.dataset.view === 'master',includePrintCodes:document.body.dataset.view === 'prints', includeSalesExecutives:document.body.dataset.view === 'sales',salesHistory:byId('sales-history').checked });
    if(generation!==actionGeneration)return;
    snapshot=next;render();
  }
  async function mutate(body) {
    if (busy || !licenceCanWrite) return; busy = true; actionGeneration++; applyLicenceLock(licenceStatus);
    byId('message').textContent = body.action==='callback' ? 'Queuing announcement...' : body.action==='ongoing' ? 'Updating queue...' : 'Saving...';
    try {
      const result = await request(body);
      if(result.localSnapshot){snapshot=result.localSnapshot;render();}
      byId('message').textContent = result.printed ? result.issuedTicket ? `Ticket ${result.issuedTicket.reprint?'reprinted':'issued and printed'}: ${result.issuedTicket.queueNumber}.` : 'Printed.' : body.action==='cancel-print' ? 'Print job cancelled. Client registration and queue number are retained.' : body.action==='reprint-se-code' ? 'Agent slip queued in Print Queue.' : body.action === 'reset-sales-executives'
        ? `${result.deactivated} Agent code(s) deactivated. Agents may register again. Client registrations, queues and TV numbers are unchanged.`
        : body.action === 'reset'
        ? 'New queue run opened. Every model and the TV display have been reset to zero. Client and Agent history are retained.'
        : result.speechError ? `Queue action completed. ${result.speechError}`
        : result.speechQueued ? result.speechPreparing ? 'Announcement queued; preparing missing audio clips.' : 'Announcement queued locally.' : result.localSaved ? 'Saved locally; cloud synchronization runs in the background.' : 'Saved.';
      refresh().catch(error=>{byId('message').textContent=`Action completed. Refresh failed: ${error.message}`;});
    }
    catch (error) { byId('message').textContent = error.message; }
    finally { busy = false; applyLicenceLock(licenceStatus); }
  }
  byId('refresh').onclick = () => refresh(true).catch(error => { byId('message').textContent = error.message; });
  window.addEventListener('tdqsys-history-cleaned',()=>refresh(true).catch(error=>{byId('message').textContent=error.message;}));
  byId('configure').onclick = () => mutate({ action: 'configure' });
  byId('retry-local-sync').onclick=()=>mutate({action:'retry-local-sync'});
  byId('export-local-queue').onclick=async()=>{
    try {
      const result=await request({action:'export-local-queue'});
      const url=URL.createObjectURL(new Blob([JSON.stringify(result.recovery,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='tdqsys-local-queue-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){byId('message').textContent=error.message;}
  };
  byId('archive-local-conflicts').onclick=()=>{
    if(window.confirm('Retain earlier-run unsynced actions in the local recovery archive and stop retrying them? Current-run actions and all client registrations are kept.'))mutate({action:'archive-local-conflicts',confirm:true});
  };
  byId('export').onclick = async () => {
    try {
      const backup = await request({ action:'snapshot', history:true,requireFresh:true });
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
      for(const id of ['printer','master-printer']) {
        byId(id).replaceChildren(new Option('Select printer', ''));
        result.printers.forEach(printer => byId(id).add(new Option(printer.displayName || printer.name, printer.name)));
        byId(id).value=localStorage.getItem('tdqsys-label-printer') || '';
      }
    } catch (error) { byId('message').textContent = error.message; }
  }
  byId('load-printers').onclick = loadPrinters;
  for(const id of ['printer','master-printer'])byId(id).onchange=()=>{
    localStorage.setItem('tdqsys-label-printer',byId(id).value);
    for(const other of ['printer','master-printer'])byId(other).value=byId(id).value;
  };
  byId('reset-form').onsubmit = event => {
    event.preventDefault();
    if (!byId('reset-form').reportValidity()) return;
    mutate({ action: 'reset', reason: byId('reset-reason').value.trim() }); byId('reset-confirm').checked = false;
  };
  byId('search').oninput = renderMaster;
  byId('print-search').oninput=renderPrints;
  for(const id of ['master-sort','master-direction'])byId(id).onchange=renderMaster;
  for(const id of ['sales-sort','sales-direction'])byId(id).onchange=()=>{renderSales();applyLicenceLock(licenceStatus);};
  byId('board').onscroll=()=>{
    if(!boardCycleWidth)return;
    const board=byId('board');
    if(board.scrollLeft>=boardCycleWidth && board.scrollLeft<2*boardCycleWidth)return;
    const centered=loopPosition(board.scrollLeft,boardCycleWidth);
    if(Math.abs(centered-board.scrollLeft)>0.5)board.scrollLeft=centered;
  };
  byId('board').onwheel=event=>{
    const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if(!delta || !boardCycleWidth)return;
    event.preventDefault();scrollBoard(delta*(event.deltaMode===1?16:event.deltaMode===2?byId('board').clientWidth:1));
  };
  byId('board').onpointerdown=event=>{
    if(event.pointerType!=='mouse' || event.button!==0 || !boardCycleWidth || event.target.closest('button,a,input,select,textarea,label'))return;
    boardDrag={id:event.pointerId,x:event.clientX,position:byId('board').scrollLeft,moved:false};
  };
  byId('board').onpointermove=event=>{
    if(!boardDrag || boardDrag.id!==event.pointerId)return;
    const delta=boardDrag.x-event.clientX;
    if(!boardDrag.moved && Math.abs(delta)<5)return;
    boardDrag.moved=true;event.preventDefault();
    byId('board').setPointerCapture(event.pointerId);
    scheduleBoardPosition(boardDrag.position+delta);
    byId('board').classList.add('dragging');
  };
  function endBoardDrag(event) {
    if(!boardDrag || boardDrag.id!==event.pointerId)return;
    flushBoardScroll();
    boardDrag=null;
    const board=byId('board');
    if(board.hasPointerCapture(event.pointerId))board.releasePointerCapture(event.pointerId);
    board.classList.remove('dragging');renderBoard();
  }
  byId('board').onpointerup=endBoardDrag;
  byId('board').onpointercancel=endBoardDrag;
  byId('board').onkeydown=event=>{
    if(event.target!==byId('board') || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();scrollBoard((event.key==='ArrowLeft'?-1:1)*byId('board').clientWidth);
  };
  let boardResizeFrame;
  new ResizeObserver(()=>{
    cancelAnimationFrame(boardResizeFrame);
    boardResizeFrame=requestAnimationFrame(renderBoard);
  }).observe(byId('board'));
  byId('sales-search').oninput = renderSales;
  byId('sales-reset-form').onsubmit = event => {
    event.preventDefault();
    if (!byId('sales-reset-form').reportValidity()) return;
    mutate({action:'reset-sales-executives',confirm:byId('sales-reset-confirm').checked,reason:byId('sales-reset-reason').value.trim()});
    byId('sales-reset-confirm').checked = false;
  };
  byId('sales-history').onchange = () => refresh().catch(error => { byId('message').textContent = error.message; });
  byId('history').onchange = () => refresh().catch(error => { byId('message').textContent = error.message; });
  refreshLicence().then(() => refresh()).catch(error => { byId('message').textContent = error.message; });
  setInterval(refreshLicence, 30000);
  if (['prints','master'].includes(document.body.dataset.view)) loadPrinters();
  let refreshing = false;
  const stopQueueUpdates=window.afDesktop?.onLocalQueueChanged?.(()=>{
    if(busy || refreshing || document.hidden)return;
    refreshing=true;
    refresh().catch(error=>{byId('message').textContent=error.message;}).finally(()=>{refreshing=false;});
  });
  window.addEventListener('beforeunload',()=>stopQueueUpdates?.(),{once:true});
  setInterval(async () => {
    if (busy || refreshing || document.hidden) return;
    refreshing = true;
    try { await refresh(); } catch (error) { byId('message').textContent = error.message; }
    finally { refreshing = false; }
  }, 5000);
})();
