(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TdqNamedSpeech=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const defaults={enabled:false,
        nameTemplate:'Test driver, {name}, you may now approach the registration area to test drive the {counter}.',
        fallbackTemplate:'Test driver, {ticket}, you may now approach the registration area to test drive the {counter}.',
        callbackNameTemplate:'Test driver, {name}, please stand by, you are next in line to test the {counter}.',
        callbackFallbackTemplate:'Test driver, {ticket}, please stand by, you are next in line to test the {counter}.'};
    function normalize(value){return Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,key==='enabled'?value?.enabled===true:typeof value?.[key]==='string'?value[key].trim():fallback]));}
    function validate(value){const result=normalize(value);for(const key of Object.keys(defaults).filter(key=>key!=='enabled')){
        const text=result[key],required=key.toLowerCase().includes('fallback')?'ticket':'name';
        if(!text||text.length>600||!text.includes(`{${required}}`)||/[{}]/.test(text.replace(/\{(name|ticket|counter|service)\}/g,''))||required==='ticket'&&text.includes('{name}'))throw Error(`Invalid ${key}: include {${required}}, use supported placeholders and at most 600 characters. Ticket fallback must not require a name.`);
    }return result;}
    return {defaults,normalize,validate};
});
