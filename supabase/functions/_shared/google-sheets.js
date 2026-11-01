// Server-only Google adapter. Credentials never travel to a browser/desktop.
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const encode = value => b64(new TextEncoder().encode(JSON.stringify(value)));

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

export async function appendRegistration(sheetUrl, payload, accessToken) {
  const url = new URL(sheetUrl);
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (url.origin !== 'https://docs.google.com' || !match) throw new Error('Configure a valid Google Sheets URL in Settings.');
  const spreadsheet = match[1];
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') || url.searchParams.get('gid');
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet}`;
  const metadataResponse = await fetch(`${root}?fields=sheets.properties`, { headers });
  if (!metadataResponse.ok) throw new Error('Google sheet is unavailable. Check sharing permissions.');
  const metadata = await metadataResponse.json();
  const selected = metadata.sheets.find(sheet => gid !== null ? String(sheet.properties.sheetId) === gid : sheet.properties.title === 'TDQ REGISTRATION');
  if (!selected) throw new Error('The selected Google Sheets tab was not found.');
  const tab = `'${selected.properties.title.replace(/'/g, "''")}'`;
  const idsResponse = await fetch(`${root}/values/${encodeURIComponent(`${tab}!A:A`)}`, { headers });
  if (!idsResponse.ok) throw new Error('Could not read giveaway registration IDs.');
  const ids = (await idsResponse.json()).values || [];
  if (ids.some(row => row[0] === payload.registrationId)) return { alreadyDelivered: true };
  if (ids.length && ids[0][0] !== 'Registration ID') throw new Error('Use an empty tracking tab, or a tab with the TDQSYS Registration ID header in column A.');
  const row = sheetRow(payload);
  const columnNames = ['Registration ID','Submitted at','Email Address','Name','City Address','Contact No.','Unit to Test Drive','For Application?','For Reservation?','Name of SE','Dealership'];
  const response = await fetch(`${root}/values/${encodeURIComponent(`${tab}!A:K`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', headers, body: JSON.stringify({ values: ids.length ? [row] : [columnNames, row] })
  });
  if (!response.ok) throw new Error('Google Sheets write failed. It will be retried.');
  return { alreadyDelivered: false };
}

export async function syncOneRegistration(admin, instanceId, credentialJson) {
  if (!credentialJson) return { configured: false };
  const { data: settings, error } = await admin.from('test_drive_settings').select('google_sheet_url').eq('instance_id', instanceId).maybeSingle();
  if (error) throw error;
  if (!settings?.google_sheet_url) return { configured: false };
  const { data: job, error: claimError } = await admin.rpc('tdqsys_claim_sheet_job', { p_instance_id: instanceId });
  if (claimError) throw claimError;
  if (!job) return { idle: true };
  let failure = null;
  try {
    const token = await googleToken(JSON.parse(credentialJson));
    await appendRegistration(settings.google_sheet_url, job.payload_snapshot, token);
  } catch (error) { failure = error.message || 'Google Sheets sync failed.'; }
  const { error: finishError } = await admin.rpc('tdqsys_finish_sheet_job', {
    p_instance_id: instanceId, p_job_id: job.id, p_claim_token: job.claim_token, p_error: failure
  });
  if (finishError) throw finishError;
  return { delivered: failure === null };
}
