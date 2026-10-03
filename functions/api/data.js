import { defaultState, ensureInstanceId } from "../../shared/config.js";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
};

export async function onRequest(context) {
    if (context.request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (context.request.method === "GET") {
        try {
            const url = new URL(context.request.url);
            // The mirror is keyed by the INSTANCE id (immutable per installation).
            // Legacy/URL fallback: a bare site label keeps older bookmarks working.
            const instanceId = (url.searchParams.get("id") || "").toLowerCase();
            const site = (url.searchParams.get("site") || "auto-01").toLowerCase();
            const key = instanceId ? `instances/${instanceId}/state` : `sites/${site}/state`;

            const data = await context.env.TDQSYS_QUEUE_DATA.get(key, "text");

            if (data) {
                return new Response(data, { headers: CORS_HEADERS });
            }

            // Nothing stored for this instance yet: offer a fresh default state.
            const fresh = defaultState();
            fresh.config.instanceId = instanceId || fresh.config.instanceId;
            fresh.config.site = site;
            return new Response(JSON.stringify(fresh), { headers: CORS_HEADERS });
        } catch (err) {
            return new Response(JSON.stringify({ error: "Failed to read data" }), {
                status: 500,
                headers: CORS_HEADERS
            });
        }
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}