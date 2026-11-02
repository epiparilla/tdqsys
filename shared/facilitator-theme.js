'use strict';
const FACILITATOR_PAGES = new Set(['dashboard.html','dashboard-brand2.html','master-table.html','print-queue.html','sales-executives.html','event-setup.html']);

function facilitatorBootstrap(config) {
    const firstCount = (config.brands || []).find(brand => brand.key === 'brand1')?.models?.length || 0;
    return {brands:(config.brands || []).filter(brand => brand.models?.length && (brand.key !== 'brand2' || firstCount < 12)).map(brand => ({
        key:brand.key,name:brand.name,color:/^#[0-9a-f]{6}$/i.test(brand.color || '') ? brand.color : '#EB0A1E'
    })),sheetsConfigured:!!config.testDrive?.sheetsUrl};
}

function injectFacilitatorBootstrap(html, config) {
    const bootstrap = facilitatorBootstrap(config);
    const selectedKey = html.includes('data-brand="brand2"') ? 'brand2' : bootstrap.brands[0]?.key;
    const color = bootstrap.brands.find(brand => brand.key === selectedKey)?.color || bootstrap.brands[0]?.color || '#EB0A1E';
    // Names are configuration data, never executable markup. Omit credentials,
    // client records and all unrelated configuration from the HTML bootstrap.
    const json = JSON.stringify(bootstrap).replace(/[<>&\u2028\u2029]/g,char => '\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
    return html.replace('<!--TDQSYS_FACILITATOR_BOOTSTRAP-->',`<style id="facilitator-theme">:root{--brand-accent:${color}}</style><script>window.TDQSYS_FACILITATOR_BOOTSTRAP=${json};</script><link rel="preload" href="vendor/fonts/Inter-latin-variable.woff2" as="font" type="font/woff2" crossorigin>`);
}
module.exports = {FACILITATOR_PAGES,facilitatorBootstrap,injectFacilitatorBootstrap};
