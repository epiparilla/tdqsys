// Cloudflare-only boundary. The local desktop engine serves public/ directly
// and never executes Pages middleware, so local Settings remains available.
export async function onRequest(context) {
    let pathname;
    try {
        const decoded = decodeURIComponent(new URL(context.request.url).pathname).replace(/\/{2,}/g, '/');
        pathname = decodeURIComponent(new URL(decoded, 'https://local.invalid').pathname);
    } catch {
        return new Response('Invalid address.', { status: 400 });
    }

    if (/^\/(?:settings|dashboard(?:-brand2)?|master-table|print-queue|sales-executives|giveaways|giveaway-stock-settings|history-cleanup-ui|live-dashboard|event-setup|facilitator-shell|test-drive-operations)(?:[./"']|$)/i.test(pathname)) {
        return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Desktop app only</title></head><body><h1>Desktop app only</h1><p>Open Settings and facilitator controls from the TDQSYS desktop app on the registration laptop.</p><a href="/">Queue viewer</a></body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    }

    const response = await context.next();
    if (['/', '/index', '/index.html'].includes(pathname) && response.headers.get('Content-Type')?.includes('text/html')) {
        // Remove desktop links server-side too, including for phones with JS
        // disabled. The installed app still receives the original hub file.
        return new HTMLRewriter().on('[data-hub="local"]', { element(element) { element.remove(); } }).transform(response);
    }
    return response;
}
