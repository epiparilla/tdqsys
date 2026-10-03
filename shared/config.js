// TDQSYS v2 - Shared config / state schema, rules and helpers.
// Used by: video_server.js (Node), Electron main (Node), Cloudflare Pages functions (bundled).

const SCHEMA_VERSION = 2;
const MAX_TOTAL_CARS = 12;
const MAX_BRANDS = 2;

// Immutable per-install identity (UUID v4). Mints once on the first-ever boot of
// an installation and is stored in data.json forever after. This is the REAL
// cloud key — each installation owns a completely separate mirror under
// instances/<instanceId>, so two PCs can never collide or overwrite each other,
// no matter what they name themselves. Reinstalls (fresh data folder) mint a new
// id; a backup restore carries the old id back so the same mirror link works.
function newInstanceId() {
    // Node 18+ and the Cloudflare Workers runtime both expose a global
    // crypto.randomUUID(); if it is somehow missing, fall back to a UUID-shape
    // string from Math.random (still unique enough as a cloud key).
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const r = Math.floor(Math.random() * 16);
        const v = ch === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Unique-per-location site *label*. Purely a friendly name the operator picks
// for this location; it is NOT used as a cloud key (instanceId is). Duplicates
// of this label are harmless and never mix data.
function randomSite() {
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `auto-${rnd}`;
}

// Factory defaults for a brand-new installation. The operator configures the
// real brands/cars through the first-run wizard; until then the system shows a
// single generic car on the display so it's obvious nothing is set up yet.
// Brand 2 is disabled (absent from config.brands) until configured.
function defaultModels() {
    return {
        brand1: [
            { label: "Car 1", prefix: "AA", pronounce: "A A" }
        ],
        brand2: []
    };
}

function defaultConfig() {
    const models = defaultModels();
    return {
        schemaVersion: SCHEMA_VERSION,
        instanceId: newInstanceId(),
        site: randomSite(),
        hostname: "tdqsys.local",
        cloudBase: "https://tdqsys.pages.dev",
        wizardDone: false,
        ads: { enabled: true, minSec: 120, maxSec: 180 },
        ttsPort: (typeof process !== "undefined" && process.env && parseInt(process.env.AF_TTS_PORT, 10)) || 8001,
        brands: [
            { key: "brand1", name: "Brand 1", color: "#EB0A1E", models: models.brand1 }
        ]
    };
}

// Fresh queue state: every model starts at 0.
function emptyQueues(config) {
    const queues = {};
    for (const brand of (config && config.brands) || []) {
        queues[brand.key] = {};
        brand.models.forEach((_, idx) => { queues[brand.key][String(idx + 1)] = 0; });
    }
    return queues;
}

// Full document stored in data.json, KV, etc.
function defaultState() {
    const config = defaultConfig();
    return { config, queues: emptyQueues(config), reannounce: null };
}

// Number of models (cars) per brand.
function brandCarCount(config, brandKey) {
    const brand = (config.brands || []).find(b => b.key === brandKey);
    return brand ? brand.models.length : 0;
}

function brandByIdx(config, idx) {
    return (config.brands || [])[idx] || null;
}

// Brand 2 is effectively off when brand 1 has 12 cars or brand 2 has 0.
function brand2Enabled(config) {
    const b1 = brandCarCount(config, "brand1");
    const b2 = brandCarCount(config, "brand2");
    return b1 < MAX_TOTAL_CARS && b2 > 0;
}

// Layout metadata for display/dashboard rendering.
function brandRules(config) {
    const b1 = brandCarCount(config, "brand1");
    const b2 = brandCarCount(config, "brand2");
    return {
        total: b1 + b2,
        brand1Cars: b1,
        brand2Cars: b2,
        brand2On: brand2Enabled(config),
        brand1Full: b1 >= MAX_TOTAL_CARS,
        maxTotal: MAX_TOTAL_CARS,
        overLimit: b1 + b2 > MAX_TOTAL_CARS
    };
}

// Validate a config object. Returns { valid, errors[], total }.
function validateConfig(config) {
    const errors = [];
    const brands = (config && config.brands) || [];

    if (brands.length < 1 || brands.length > MAX_BRANDS) {
        errors.push(`Brand count must be 1-2 (got ${brands.length}).`);
    }

    let total = 0;
    brands.forEach((brand, idx) => {
        const key = brand.key || `brand${idx + 1}`;
        if (!brand.name || !String(brand.name).trim()) errors.push(`Brand ${idx+1}: name is required.`);
        if (!brand.color || !/^#[0-9a-fA-F]{6}$/.test(brand.color)) errors.push(`Brand ${idx+1}: hex color required.`);
        if (!Array.isArray(brand.models) || brand.models.length === 0) errors.push(`Brand ${idx+1} (${key}): at least one car required.`);
        total += (brand.models || []).length;
        (brand.models || []).forEach((m, mi) => {
            if (!m.label || !String(m.label).trim()) errors.push(`${key} car ${mi+1}: label required.`);
            if (!m.prefix || !String(m.prefix).trim()) errors.push(`${key} car ${mi+1}: prefix required.`);
        });
    });

    if (total > MAX_TOTAL_CARS) errors.push(`Max ${MAX_TOTAL_CARS} cars total (got ${total}).`);

    return { valid: errors.length === 0, errors, total };
}

// Reconcile queue slots with the current config:
//  - keeps existing values for models that still exist (matched by index within brand)
//  - zeroes new slots
//  - drops removed slots
// Used when a config change is applied with "preserve queues" selected.
function reconcileQueues(queues, config) {
    const result = {};
    for (const brand of (config.brands || [])) {
        const src = (queues && queues[brand.key]) || {};
        result[brand.key] = {};
        brand.models.forEach((_, idx) => {
            const key = String(idx + 1);
            const val = parseInt(src[key], 10);
            result[brand.key][key] = isNaN(val) ? 0 : Math.max(0, val);
        });
    }
    return result;
}

// Attempt to import a v1 legacy document ({toyota, lexus}) into a v2 state.
// Used only to rescue old data.json / KV values; returns null if shape unknown.
function migrateLegacy(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.config && raw.queues) return null; // already v2

    const hasLegacy = (raw.toyota || raw.lexus) && !raw.brands;
    if (!hasLegacy) return null;

    const config = defaultConfig();
    const toyota = raw.toyota || {};
    const lexus = raw.lexus || {};

    // Map legacy index 1..N onto the default brand models (same car lists).
    const mapLegacy = (src, dstModels) => {
        const out = {};
        const count = Math.min(dstModels.length, Object.keys(src).length || dstModels.length);
        for (let i = 1; i <= count; i++) {
            const val = parseInt(src[String(i)], 10);
            out[String(i)] = isNaN(val) ? 0 : Math.max(0, val);
        }
        return out;
    };

    const queues = {
        brand1: mapLegacy(toyota, config.brands[0].models),
        brand2: mapLegacy(lexus, config.brands[1].models)
    };
    return { config, queues, reannounce: raw.reannounce || null };
}

// Ensure an existing config carries an instanceId (1.1.8-era data.json/KV has
// none). Mints one when missing so the cloud key stays stable; returns true if
// a new one was assigned.
function ensureInstanceId(config) {
    if (config && typeof config.instanceId === 'string' && config.instanceId) {
        if (/^[0-9a-fA-F-]{1,64}$/.test(config.instanceId)) return false;
    }
    if (config) config.instanceId = newInstanceId();
    return !!config;
}

module.exports = {
    SCHEMA_VERSION,
    MAX_TOTAL_CARS,
    MAX_BRANDS,
    newInstanceId,
    randomSite,
    ensureInstanceId,
    defaultConfig,
    defaultModels,
    defaultState,
    emptyQueues,
    brandCarCount,
    brandByIdx,
    brand2Enabled,
    brandRules,
    validateConfig,
    reconcileQueues,
    migrateLegacy
};