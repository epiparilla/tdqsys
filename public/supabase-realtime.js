// Lazily loads the browser client only on the public site.  Local/offline
// TDQSYS screens must remain usable when the WAN is unavailable.
(function () {
    const config = window.AF_SUPABASE_CONFIG;
    if (!config || !config.url || !config.publishableKey) {
        window.afSupabaseReady = Promise.resolve(null);
        return;
    }

    window.afSupabaseReady = import('https://esm.sh/@supabase/supabase-js@2.57.4')
        .then(({ createClient }) => createClient(config.url, config.publishableKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        }))
        .catch((err) => {
            console.warn('TDQSYS realtime mirror unavailable; using slow refresh fallback.', err);
            return null;
        });
})();
