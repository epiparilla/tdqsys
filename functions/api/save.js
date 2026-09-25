import { defaultState, migrateLegacy } from "../../shared/config.js";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
};

export async function onRequest(context) {
    if (context.request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (context.request.method === "POST") {
        try {
            const reqJson = await context.request.json();
            const url = new URL(context.request.url);
            const site = (url.searchParams.get("site") || "auto-01").toLowerCase();
            const key = `${site}/state`;

            let state = reqJson;

            // Accept either a full state doc or a queue-only payload.
            // Queue-only => merge with whatever config is already stored (or defaults).
            if (reqJson && !reqJson.queues) {
                const existing = await context.env.QUEUE_DATA.get(key, "text");
                let base = null;
                if (existing) {
                    const parsed = JSON.parse(existing);
                    base = parsed && parsed.config ? parsed : null;
                }
                if (!base) base = defaultState();
                state = { ...base, queues: reqJson, reannounce: reqJson.reannounce || null };
            } else if (reqJson && reqJson.queues && !reqJson.config) {
                const existing = await context.env.QUEUE_DATA.get(key, "text");
                let base = null;
                if (existing) {
                    const parsed = JSON.parse(existing);
                    base = parsed && parsed.config ? parsed : null;
                }
                if (!base) base = defaultState();
                state = { config: base.config, queues: reqJson.queues, reannounce: reqJson.reannounce || base.reannounce || null };
            }

            // Rescue legacy v1 payloads dropped in from the old system.
            const legacy = migrateLegacy(state);
            if (legacy) state = legacy;

            if (!state.config.site) state.config.site = site;

            await context.env.QUEUE_DATA.put(key, JSON.stringify(state));

            return new Response(JSON.stringify({ success: true }), { headers: CORS_HEADERS });
        } catch (err) {
            return new Response(JSON.stringify({ error: "Invalid JSON or KV error" }), {
                status: 400,
                headers: CORS_HEADERS
            });
        }
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}