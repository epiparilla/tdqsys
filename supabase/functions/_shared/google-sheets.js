// Server-only Google adapter. Credentials never travel to a browser/desktop.
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const encode = value => b64(new TextEncoder().encode(JSON.stringify(value)));
const COLUMN_NAMES = ['Registration ID','Submitted at','Email Address','Name','City Address','Contact No.','Unit to Test Drive','For Application?','For Reservation?','Agent name','Dealership'];

export function registrationTabName(instant = new Date(), timeZone = 'Asia/Manila') {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error('Registration date is invalid.');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, month:'2-digit', day:'2-digit', year:'numeric' }).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  return `TDQSYS Reg ${part('month')}/${part('day')}/${part('year')}`;
}

export async function googleToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const pem = credentials.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), ch => ch.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${b64(new Uint8Array(signature))}` }) });
  if (!response.ok) throw new Error('Google account authentication failed.');
  return (await response.json()).access_token;
}

export function sheetRow(payload) {
  return [payload.registrationId, payload.submittedAt, payload.email, payload.fullName, payload.cityAddress,
    payload.contactNumber, (payload.models || []).join(', '), payload.forApplication ?? '', payload.forReservation ?? '',
    payload.se?.name || '', payload.se?.dealership || ''];
}

async function readSheetDestination(sheetUrl, accessToken, options = {}) {
  const url = new URL(sheetUrl);
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (url.origin !== 'https://docs.google.com' || !match) throw new Error('Configure a valid Google Sheets URL in Settings.');
  const spreadsheet = match[1];
  // The URL selects the spreadsheet; its gid does not override the daily tab.
  const title = registrationTabName(options.instant, options.timeZone);
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet}`;
  const metadataResponse = await fetch(`${root}?fields=properties.title,sheets.properties`, { headers });
  if (!metadataResponse.ok) throw new Error('Google sheet is unavailable. Check sharing permissions.');
  const metadata = await metadataResponse.json();
  let selected = metadata.sheets.find(sheet => sheet.properties.title === title);
  let created = false;
  if (!selected) {
    const createResponse = await fetch(`${root}:batchUpdate`, { method:'POST', headers,
      body:JSON.stringify({requests:[{addSheet:{properties:{title,gridProperties:{frozenRowCount:1,columnCount:11}}}}]}) });
    if (createResponse.ok) {
      selected = { properties:(await createResponse.json()).replies[0].addSheet.properties };
      created = true;
    } else {
      // Another worker may have created today's tab concurrently. Re-read it
      // before treating the failure as an actual permission/API error.
      const retry = await fetch(`${root}?fields=properties.title,sheets.properties`, { headers });
      if (retry.ok) selected = (await retry.json()).sheets.find(sheet => sheet.properties.title === title);
      if (!selected) throw new Error('Could not create the daily registration tab. Share the spreadsheet with the TDQSYS account as Editor.');
    }
  }
  const tab = `'${selected.properties.title.replace(/'/g, "''")}'`;
  const idsResponse = await fetch(`${root}/values/${encodeURIComponent(`${tab}!A:A`)}`, { headers });
  if (!idsResponse.ok) throw new Error('Could not read giveaway registration IDs.');
  let ids = (await idsResponse.json()).values || [];
  if (ids.length && ids[0][0] !== 'Registration ID') throw new Error(`The ${title} tab has different columns. Its existing data has been kept; please check the tab.`);
  if (!ids.length) {
    const headerResponse = await fetch(`${root}/values/${encodeURIComponent(`${tab}!A1:K1`)}?valueInputOption=RAW`, {
      method:'PUT', headers, body:JSON.stringify({values:[COLUMN_NAMES]})
    });
    if (!headerResponse.ok) throw new Error('Could not prepare daily registration headers. Check Editor access.');
    ids = [COLUMN_NAMES];
  }
  return { root, headers, tab, ids, spreadsheetTitle: metadata.properties?.title || 'Spreadsheet', tabTitle:title, tabId:selected.properties.sheetId, created };
}

export async function verifySheetConnection(sheetUrl, accessToken, options = {}) {
  const destination = await readSheetDestination(sheetUrl, accessToken, options);
  return { spreadsheetTitle:destination.spreadsheetTitle, tabTitle:destination.tabTitle, tabId:destination.tabId, created:destination.created, emptyTab:destination.ids.length === 1 };
}

export async function appendRegistration(sheetUrl, payload, accessToken, options = {}) {
  // Retries after midnight still write to the original registration date.
  const { root, headers, tab, ids } = await readSheetDestination(sheetUrl, accessToken, { ...options, instant:payload.submittedAt });
  if (ids.some(row => row[0] === payload.registrationId)) return { alreadyDelivered: true };
  const row = sheetRow(payload);
  const response = await fetch(`${root}/values/${encodeURIComponent(`${tab}!A:K`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers, body: JSON.stringify({ values: [row] })
  });
  if (!response.ok) throw new Error('Google Sheets write failed. It will be retried.');
  return { alreadyDelivered: false };
}

export async function syncOneRegistration(admin, instanceId, credentialJson) {
  if (!credentialJson) return { configured: false };
  const { data: settings, error } = await admin.from('test_drive_settings').select('google_sheet_url,timezone').eq('instance_id', instanceId).maybeSingle();
  if (error) throw error;
  if (!settings?.google_sheet_url) return { configured: false };
  const { data: job, error: claimError } = await admin.rpc('tdqsys_claim_sheet_job', { p_instance_id: instanceId });
  if (claimError) throw claimError;
  if (!job) return { idle: true };
  let failure = null;
  try {
    const token = await googleToken(JSON.parse(credentialJson));
    await appendRegistration(settings.google_sheet_url, job.payload_snapshot, token, {timeZone:settings.timezone || 'Asia/Manila'});
  } catch (error) { failure = error.message || 'Google Sheets sync failed.'; }
  const { error: finishError } = await admin.rpc('tdqsys_finish_sheet_job', {
    p_instance_id: instanceId, p_job_id: job.id, p_claim_token: job.claim_token, p_error: failure
  });
  if (finishError) throw finishError;
  return { delivered: failure === null };
}
