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
            const rawId = (url.searchParams.get("id") || "").trim().toLowerCase();
            const site = (url.searchParams.get("site") || "auto-01").toLowerCase();

            // A malformed id must NOT fall through to the legacy key or to a
            // fresh default: a missing key returns an empty "Brand 1 / Model 1"
            // board, which reads as data loss instead of a bad URL. Real clients
            // (af.js afInstanceId) already validate, so this only ever catches
            // hand-edited or truncated links.
            if (rawId && !/^[0-9a-f-]{1,64}$/.test(rawId)) {
                return new Response(JSON.stringify({
                    error: "Invalid instance id",
                    detail: "id must be 1-64 hex characters and dashes"
                }), { status: 400, headers: CORS_HEADERS });
            }

            const key = rawId ? `instances/${rawId}/state` : `sites/${site}/state`;

            const data = await context.env.TDQSYS_QUEUE_DATA.get(key, "text");

            if (data) {
                return new Response(data, { headers: CORS_HEADERS });
            }

            // Nothing stored for this instance yet: offer a fresh default state.
            const fresh = defaultState();
            fresh.config.instanceId = rawId || fresh.config.instanceId;
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