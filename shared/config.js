// AutoFocus v2 - Shared config / state schema, rules and helpers.
// Used by: video_server.js (Node), Electron main (Node), Cloudflare Pages functions (bundled).

const SCHEMA_VERSION = 2;
const MAX_TOTAL_CARS = 12;
const MAX_BRANDS = 2;

// Brand defaults (matching the dealership vehicle lists). Prefixes are spoken
// letter-by-letter by the TTS engine, so `pronounce` defaults to spaced letters.
function defaultModels() {
    return {
        brand1: [
            { label: "RAV4 LTD HEV",     prefix: "RH", pronounce: "R H" },
            { label: "bZ4X",             prefix: "BZ", pronounce: "B Z" },
            { label: "Urban Cruiser",    prefix: "UC", pronounce: "U C" },
            { label: "RAV4 ADV",         prefix: "RA", pronounce: "R A" },
            { label: "Yaris Cross SE HEV", prefix: "YC", pronounce: "Y C" },
            { label: "Corolla Cross G HEV", prefix: "CC", pronounce: "C C" },
            { label: "ATIV HEV",         prefix: "AH", pronounce: "A H" }
        ],
        brand2: [
            { label: "IS Premier",       prefix: "IS", pronounce: "I S" },
            { label: "Lexus NX",         prefix: "NX", pronounce: "N X" },
            { label: "Lexus LBX",        prefix: "LBX", pronounce: "L B X" }
        ]
    };
}

function defaultConfig() {
    const models = defaultModels();
    return {
        schemaVersion: SCHEMA_VERSION,
        site: "auto-01",
        hostname: "autofocus.local",
        cloudBase: "",
        wizardDone: false,
        ads: { enabled: true, minSec: 120, maxSec: 180 },
        ttsPort: parseInt(process.env.AF_TTS_PORT, 10) || 8000,
        brands: [
            { key: "brand1", name: "TOYOTA", color: "#EB0A1E", models: models.brand1 },
            { key: "brand2", name: "LEXUS",  color: "#B0B0B0", models: models.brand2 }
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

module.exports = {
    SCHEMA_VERSION,
    MAX_TOTAL_CARS,
    MAX_BRANDS,
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