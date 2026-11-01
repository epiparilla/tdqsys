(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TdqSpeech = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const defaults = Object.freeze({ voice:'af_heart', prefix:'Test driver', template:'{ticket}', suffix:'you may now approach the registration area for your test drive.' });
    function normalize(value) {
        const input = value && typeof value === 'object' ? value : {};
        return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof input[key] === 'string' ? input[key].trim() : fallback]));
    }
    function validate(value) {
        const config = normalize(value);
        if (!/^[a-z0-9_]{1,64}$/.test(config.voice)) throw new Error('Select a valid packaged voice.');
        if (!config.template) throw new Error('Main announcement template cannot be empty.');
        for (const [key, limit] of [['prefix',200],['template',400],['suffix',200]]) {
            if (config[key].length > limit) throw new Error(`${key} is too long (maximum ${limit} characters).`);
            const remainder = config[key].replace(/\{(ticket|counter|service)\}/g, '');
            if (/[{}]/.test(remainder)) throw new Error('Use only {ticket}, {counter}, and {service} placeholders, with matching braces.');
        }
        if (!`${config.prefix} ${config.template} ${config.suffix}`.includes('{ticket}')) throw new Error('Include {ticket} in the announcement.');
        return config;
    }
    function render(config, values) {
        const safe = validate(config);
        return [safe.prefix,safe.template,safe.suffix].map(text => text.replace(/\{(ticket|counter|service)\}/g, (_,key) => String(values[key] ?? ''))).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    }
    function textForQueue(config, brandKey, unit, displayValue) {
        const brand = (config.brands || []).find(item => item.key === brandKey);
        const model = brand?.models?.[Number(unit)-1];
        const letters = String(displayValue).replace(/[^a-z]/gi,'');
        const digits = String(displayValue).replace(/\D/g,'').split('').join(' ');
        const spokenPrefix = model?.pronounce || letters.split('').join(' ');
        return render(config.announcements, { ticket:`${spokenPrefix} ${digits}`.trim(), counter:model?.label || `Counter ${unit}`, service:brand?.name || '' });
    }
    return { defaults, normalize, validate, render, textForQueue };
});
