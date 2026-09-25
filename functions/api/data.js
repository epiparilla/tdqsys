const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
};

export async function onRequest(context) {
    // Handle browser CORS preflight check
    if (context.request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (context.request.method === "GET") {
        try {
            // kv binding is QUEUE_DATA
            const data = await context.env.QUEUE_DATA.get("state");
            
            if (data) {
                return new Response(data, { headers: CORS_HEADERS });
            }
            
            // Default state if KV is empty
            const defaultState = {
                lexus:  { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
                toyota: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 }
            };

            return new Response(JSON.stringify(defaultState), { headers: CORS_HEADERS });
            
        } catch (err) {
            return new Response(JSON.stringify({ error: "Failed to read data" }), { 
                status: 500,
                headers: CORS_HEADERS
            });
        }
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
