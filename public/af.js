// AutoFocus v2 - shared frontend helpers. Loaded by dashboard/display/client pages.
// Renders the brand sections + queue cards from the state document
//   returned by GET /api/data  ->  { config, queues, reannounce }.

// Detect local vs cloud origin (config-driven hostname, resolved at runtime).
function afHostname() {
    try { return localStorage.getItem('af_hostname') || 'autofocus.local'; }
    catch (e) { return 'autofocus.local'; }
}

function afIsLocal() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === afHostname();
}

function afApiBase() {
    return afIsLocal() ? `http://${afHostname()}` : '';
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

// Fetch state with local->cloud fallback (mirrors original dual-source logic).
async function afFetchState() {
    const primary = `${afApiBase()}/api/data`;
    try {
        const r = await fetch(primary);
        if (r.ok) return await r.json();
    } catch (e) { /* fall through */ }
    if (!afIsLocal()) {
        try {
            const r = await fetch('/api/data');
            if (r.ok) return await r.json();
        } catch (e) { /* both failed */ }
    }
    return null;
}

async function afFetchConfig() {
    const primary = `${afApiBase()}/api/config`;
    try {
        const r = await fetch(primary);
        if (r.ok) return await r.json();
    } catch (e) { /* fall through */ }
    if (!afIsLocal()) {
        try {
            const r = await fetch('/api/config');
            if (r.ok) return await r.json();
        } catch (e) { /* both failed */ }
    }
    return null;
}

// Persist state: local-first when local, cloud otherwise (best-effort).
async function afSaveState(state) {
    if (afIsLocal()) {
        await fetch(`${afApiBase()}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        }).catch(() => {});
    } else {
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        }).catch(() => {});
    }
}