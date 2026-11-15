'use strict';
(() => {
    const keys=Object.keys(TdqNamedSpeech.defaults),field=key=>document.getElementById('named-'+key);
    window.TdqNamedSettings={
        hydrate(value){const config=TdqNamedSpeech.normalize(value);for(const key of keys)field(key)[key==='enabled'?'checked':'value']=config[key];},
        collect(){return TdqNamedSpeech.validate(Object.fromEntries(keys.map(key=>[key,field(key)[key==='enabled'?'checked':'value']])));}
    };
    for(const variant of ['name','ticket'])for(const kind of ['ongoing','callback']){
        document.getElementById(`named-test-${kind}-${variant}`).onclick=async()=>{
            const status=document.getElementById('speech-test-status');
            try{const result=await window.afDesktop.testDrive({action:'speech-preview',preview:{...window.TdqSpeechPreview(kind),namedAnnouncements:window.TdqNamedSettings.collect(),namedVariant:variant,clientName:'Juan Dela Cruz'}});
                if(!result.ok)throw Error(result.error||'Preview unavailable.');
                if(window.tdqNamedPreview)window.tdqNamedPreview.pause();
                window.tdqNamedPreview=new Audio(`data:audio/wav;base64,${result.audioBase64}`);await window.tdqNamedPreview.play();status.textContent=`Playing ${kind} ${variant} preview. Preview does not save Settings or call a live client.`;
            }catch(error){status.textContent=error.message;}
        };
    }
})();
