// TDQSYS v2 - shared frontend helpers. Loaded by dashboard/display/client pages.
// Renders the brand sections + queue cards from the state document
//   returned by GET /api/data  ->  { config, queues, reannounce }.

// Detect local vs cloud origin (config-driven hostname, resolved at runtime).
function afHostname() {
    try { return localStorage.getItem('af_hostname') || 'tdqsys.local'; }
    catch (e) { return 'tdqsys.local'; }
}

function afIsLocal() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === afHostname();
}

function afApiBase() {
    // Same-origin when served from localhost/127.0.0.1; otherwise use the
    // configured hostname so it applies on LAN devices too.
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return '';
    return afIsLocal() ? `http://${afHostname()}` : '';
}

// Cloud mirror per instance: the web viewer (https://tdqsys.pages.dev/client.html)
// can watch any location by ?id=<instanceId> or by the saved selection. Local
// pages ignore this — each PC's engine is already that location's live data.
// The cloud key is the immutable instanceId, so two machines naming themselves
// the same thing can never mix or overwrite each other.
function afInstanceId() {
    try {
        const qs = new URLSearchParams(window.location.search).get('id');
        if (qs && /^[0-9a-fA-F-]{1,64}$/.test(qs)) return qs.toLowerCase();
        const saved = localStorage.getItem('af_instance_id');
        if (saved && /^[0-9a-fA-F-]{1,64}$/.test(saved)) return saved.toLowerCase();
    } catch (e) { /* ignore */ }
    return null;
}

// Extra query string appended ONLY to cloud-origin calls; the local engine
// ignores the id parameter since it holds a single location's data.
//
// Returns the instance-scoped query when the location is known, an explicit
// `?site=` when the link deliberately asks for a legacy label, and null when
// there is NO target. It used to fall back to '?site=auto-01', which meant a
// bare /client silently rendered whichever machine last wrote that shared
// record - two different locations showing each other's queue. Callers must
// treat null as "no location selected" rather than fetching something.
function afCloudQuery() {
    if (afIsLocal()) return '';
    const id = afInstanceId();
    if (id) return `?id=${encodeURIComponent(id)}`;
    try {
        const site = new URLSearchParams(window.location.search).get('site');
        if (site && /^[A-Za-z0-9._-]{1,64}$/.test(site)) return `?site=${encodeURIComponent(site)}`;
    } catch (e) { /* ignore */ }
    return null;
}

// True when this cloud page knows which location to show. False means we must
// not fetch: there is no instance behind the URL.
function afHasCloudTarget() {
    return afCloudQuery() !== null;
}

// Build a brand section (header + grid) into the given container.
// container: element; brand: config brand object; gridId: base id for the grid.
function buildBrandSection(container, brand, gridId) {
    const section = document.createElement('main');
    section.className = 'brand-section';
    section.dataset.brandKey = brand.key;
    section.style.setProperty('--brand-accent', brand.color);

    const header = document.createElement('header');
    header.className = 'brand-header';
    const h1 = document.createElement('h1');
    h1.textContent = brand.name;
    header.appendChild(h1);
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'queue-grid';
    grid.id = gridId;
    section.appendChild(grid);

    container.appendChild(section);
    return grid;
}

// Populate one queue grid from config models.
function populateGrid(grid, brand, state, { withReannounce = false } = {}) {
    grid.innerHTML = '';
    const queues = (state.queues && state.queues[brand.key]) || {};
    brand.models.forEach((model, idx) => {
        const unit = idx + 1;
        const card = document.createElement('div');
        card.className = 'unit-card';
        card.id = `card-${brand.key}-${unit}`;
        card.dataset.brandKey = brand.key;
        card.dataset.unit = unit;

        const label = document.createElement('div');
        label.className = 'unit-label';
        label.textContent = model.label;
        card.appendChild(label);

        const wrapper = document.createElement('div');
        wrapper.className = 'unit-number-wrapper';
        const number = document.createElement('div');
        number.className = 'unit-number';
        number.id = `num-${brand.key}-${unit}`;
        const val = parseInt(queues[String(unit)], 10);
        const display = Number.isNaN(val) ? 0 : val;
        const prefixSpan = document.createElement('span');
        prefixSpan.className = 'prefix';
        prefixSpan.textContent = model.prefix;
        number.appendChild(prefixSpan);
        number.appendChild(document.createTextNode(String(display).padStart(2, '0')));
        wrapper.appendChild(number);
        card.appendChild(wrapper);

        if (withReannounce) {
            const btn = document.createElement('button');
            btn.className = 'reannounce-btn';
            btn.title = 'Re-announce this number';
            btn.textContent = '\u{1F4E2}';
            btn.onclick = () => afReannounce(brand.key, unit);
            card.appendChild(btn);
        }

        grid.appendChild(card);
    });
}

// Shared render-to-display (updates numbers without rebuilding DOM).
function setUnitNumber(brandKey, unit, prefix, value) {
    const el = document.getElementById(`num-${brandKey}-${unit}`);
    if (!el) return;
    el.innerHTML = '';
    const p = document.createElement('span');
    p.className = 'prefix';
    p.textContent = prefix;
    el.appendChild(p);
    el.appendChild(document.createTextNode(String(value).padStart(2, '0')));
}

function padValue(n) {
    const v = parseInt(n, 10);
    return (Number.isNaN(v) ? 0 : v).toString().padStart(2, '0');
}

// Fetch state. On the cloud mirror the request MUST carry the instance id:
// a bare /api/data resolves to the legacy sites/auto-01 record and would
// serve one PC's stale queue to every viewer. With no instance known we
// return null without fetching - the caller shows "select a location"
// instead of displaying a location that was never asked for.
async function afFetchState() {
    if (!afIsLocal()) {
        const query = afCloudQuery();
        if (query === null) return null;
        try {
            const r = await fetch(`/api/data${query}`);
            if (r.ok) return await r.json();
        } catch (e) { /* cloud unavailable */ }
        return null;
    }
    try {
        const r = await fetch(`${afApiBase()}/api/data`);
        if (r.ok) return await r.json();
    } catch (e) { /* engine unavailable */ }
    return null;
}

async function afFetchConfig() {
    if (!afIsLocal()) {
        const query = afCloudQuery();
        if (query === null) return null;
        try {
            const r = await fetch(`/api/config${query}`);
            if (r.ok) return await r.json();
        } catch (e) { /* cloud unavailable */ }
        return null;
    }
    try {
        const r = await fetch(`${afApiBase()}/api/config`);
        if (r.ok) return await r.json();
    } catch (e) { /* engine unavailable */ }
    return null;
}

// Shown on a cloud page that has no instance in its URL. Deliberately explicit:
// guessing a location is how one shop ends up watching another's queue.
function afRenderNoLocation(container, opts) {
    if (!container) return;
    const options = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'no-location';
    wrap.innerHTML = `
        <h2>No location selected</h2>
        <p>This viewer needs a location's Instance ID.</p>
        <p class="no-location-hint">Open the link from
            <strong>Settings &rsaquo; System Identity &rsaquo; Copy mirror link</strong>,
            or add it to the address:</p>
        <form class="no-location-form" novalidate>
            <input type="text" inputmode="text" autocomplete="off" spellcheck="false"
                   placeholder="00000000-0000-0000-0000-000000000000"
                   aria-label="Instance ID">
            <button type="submit">Open</button>
        </form>
        <p class="no-location-err" hidden>That does not look like an Instance ID.</p>
    `;
    container.innerHTML = '';
    container.appendChild(wrap);

    const form = wrap.querySelector('.no-location-form');
    const input = wrap.querySelector('input');
    const err = wrap.querySelector('.no-location-err');
    if (options.origin) input.value = options.origin;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = input.value.trim();
        if (!/^[0-9a-fA-F-]{1,64}$/.test(id)) {
            err.hidden = false;
            return;
        }
        err.hidden = true;
        // Remember it so a bare /client on this device resolves next time.
        try { localStorage.setItem('af_instance_id', id.toLowerCase()); } catch (err2) { /* ignore */ }
        const url = new URL(window.location.href);
        url.search = `?id=${encodeURIComponent(id.toLowerCase())}`;
        window.location.replace(url.toString());
    });
}

// Notifies the page that a write was refused. Registered by operator-facing
// pages (dashboard, settings) so they can disable controls and explain why;
// optional, so a read-only page never has to define it.
let afSaveRejectedHandler = null;
function afOnSaveRejected(fn) { afSaveRejectedHandler = fn; }

// Persist state. The cloud (https://tdqsys.pages.dev/...) is a READ-ONLY
// mirror: only the Electron app on the PC pushes to it. Remote viewers must
// not write, so this is a no-op for cloud-origin pages.
//
// Returns true only when the engine actually accepted the write. This used to
// swallow the response and always return true, so a rejected save (a full disk,
// or a 403 once licensing lands) looked exactly like a successful one - the
// operator watches their number tick over, and nothing was ever persisted.
async function afSaveState(state) {
    if (!afIsLocal()) return false;
    let res;
    try {
        res = await fetch(`${afApiBase()}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
    } catch (e) {
        console.error('Save failed: the engine could not be reached.', e);
        return false;
    }
    if (!res.ok) {
        // Surface why. A licence refusal must be visible, not silent.
        let detail = `HTTP ${res.status}`;
        try {
            const body = await res.json();
            if (body && body.error) detail = body.error;
            if (body && body.notAfter) detail += ` (valid until ${body.notAfter})`;
        } catch (e) { /* not JSON; the status line will do */ }
        console.error(`Save rejected by the engine: ${detail}`);
        try { if (afSaveRejectedHandler) afSaveRejectedHandler(detail, res.status); }
        catch (e) { /* a broken handler must not break the save path */ }
        return false;
    }
    return true;
}

// Config change detection: true if the two configs differ in any user setting
// (brands/models/colors), so the dashboard/settings page can prompt and reconcile.
function afConfigEqual(a, b) {
    const norm = (c) => JSON.stringify({
        hostname: c.hostname || '',
        cloudBase: c.cloudBase || '',
        ads: c.ads || null,
        brands: (c.brands || []).map(br => ({
            key: br.key,
            name: br.name,
            color: br.color,
            models: (br.models || []).map(m => ({ label: m.label, prefix: m.prefix, pronounce: m.pronounce }))
        }))
    });
    return norm(a) === norm(b);
}

// Client-side mirrors of shared/config.js helpers (settings page needs them
// without a Node dependency).
function afEmptyQueues(config) {
    const queues = {};
    for (const brand of (config && config.brands) || []) {
        queues[brand.key] = {};
        brand.models.forEach((_, idx) => { queues[brand.key][String(idx + 1)] = 0; });
    }
    return queues;
}

function afReconcileQueues(queues, config) {
    const result = {};
    for (const brand of (config && config.brands) || []) {
        const src = (queues && queues[brand.key]) || {};
        result[brand.key] = {};
        brand.models.forEach((_, idx) => {
            const key = String(idx + 1);
            const val = parseInt(src[key], 10);
            result[brand.key][key] = Number.isNaN(val) ? 0 : Math.max(0, val);
        });
    }
    return result;
}