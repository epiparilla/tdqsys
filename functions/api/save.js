const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
};

export async function onRequest(context) {
    // Handle browser CORS preflight check
    if (context.request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (context.request.method === "POST") {
        try {
            const reqJson = await context.request.json();
            
            // Save the valid JSON stringified data to the KV store key "state"
            await context.env.QUEUE_DATA.put("state", JSON.stringify(reqJson));
            
            return new Response(JSON.stringify({ success: true }), {
                headers: CORS_HEADERS
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: "Invalid JSON or KV error" }), { 
                status: 400,
                headers: CORS_HEADERS
            });
        }
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
