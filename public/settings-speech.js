'use strict';
(() => {
    const $ = id => document.getElementById(id);
    let audio;
    let catalog = [];
    function selected() {
        return TdqSpeech.validate({voice:$('cfg-voice').value || 'af_heart',prefix:$('cfg-speech-prefix').value,template:$('cfg-speech-template').value,suffix:$('cfg-speech-suffix').value});
    }
    function sampleTicket(spoken=false) {
        const blocks=Array.from(document.querySelectorAll('.brand-block'));
        for(const block of blocks.filter(block=>!block.classList.contains('disabled'))) {
            const row=Array.from(block.querySelectorAll('.model-row')).find(row=>row.querySelector('.model-label')?.value.trim() || row.querySelector('.model-prefix')?.value.trim());
            if(!row)continue;
            const prefix=row.querySelector('.model-prefix').value.trim();
            const pronunciation=row.querySelector('.model-pronounce').value.trim().replace(/^["']+|["']+$/g,'').trim() || prefix.split('').join(' ');
            const model={label:row.querySelector('.model-label').value.trim(),prefix,pronounce:pronunciation,shortnamePronounce:row.querySelector('.model-shortname-pronounce')?.value.trim().replace(/^["']+|["']+$/g,'').trim() || ''};
            return {ticket:spoken ? `${pronunciation} 0 1`.trim() : `${prefix}01`,counter:spoken && model.shortnamePronounce || model.label,service:block.querySelector('.brand-name').value.trim(),model};
        }
        const brand=typeof stateDoc!=='undefined' ? stateDoc?.config?.brands?.find(brand=>brand.models?.length) : null;
        const model=brand?.models?.[0];
        if(!model)throw Error('Configure a vehicle model to preview its ticket and pronunciation.');
        return {ticket:spoken ? `${model.pronounce || (model.prefix || '').split('').join(' ')} 0 1`.trim() : `${model.prefix || ''}01`,counter:spoken && model.shortnamePronounce || model.label,service:brand.name,model};
    }
    function preview() {
        try {
            $('speech-preview').textContent = TdqSpeech.render(selected(),sampleTicket());
            $('speech-test-announcement').disabled = false;
        } catch (error) { $('speech-preview').textContent = error.message; $('speech-test-announcement').disabled = true; }
    }
    function applySavedVoice() {
        const saved = typeof stateDoc !== 'undefined' ? stateDoc?.config?.announcements?.voice || 'af_heart' : 'af_heart';
        if (!catalog.length) return;
        $('cfg-voice').value = catalog.includes(saved) ? saved : 'af_heart';
        $('speech-voice-notice').textContent = catalog.includes(saved) ? '' : `Saved voice ${saved} is not packaged. Announcements will use af_heart.`;
    }
    async function play(text) {
        $('speech-test-status').textContent = 'Preparing local speech…';
        try {
            const port = (typeof stateDoc !== 'undefined' && stateDoc?.config?.ttsPort) || 8001;
            const response = await fetch(`http://localhost:${port}/api/announcement?voice=${encodeURIComponent($('cfg-voice').value || 'af_heart')}&text=${encodeURIComponent(text)}`);
            if (!response.ok) throw new Error('Local speech service is not ready. Please try again.');
            if (audio) audio.pause();
            const url = URL.createObjectURL(await response.blob());
            audio = new Audio(url); audio.onended = audio.onerror = () => URL.revokeObjectURL(url);
            await audio.play(); $('speech-test-status').textContent = 'Playing preview.';
        } catch (error) { $('speech-test-status').textContent = error.message; }
    }
    function announcementPreview(kind) {
        const sample=sampleTicket(true);
        return {...selected(),kind,number:1,brandName:sample.service,model:sample.model,
            callbackPrefix:$('cfg-callback-prefix').value.trim(),callbackSuffix:$('cfg-callback-suffix').value.trim()};
    }
    async function playAnnouncement(kind) {
        $('speech-test-status').textContent='Preparing the same audio clips used by live announcements...';
        try {
            if(!window.afDesktop?.testDrive)throw Error('Open Settings inside the TDQSYS desktop app.');
            const result=await window.afDesktop.testDrive({action:'speech-preview',preview:announcementPreview(kind)});
            if(!result.ok)throw Error(result.error || 'Local speech preview is unavailable.');
            if(audio)audio.pause();
            audio=new Audio(`data:audio/wav;base64,${result.audioBase64}`);
            await audio.play();$('speech-test-status').textContent='Playing live-style preview (sample queue number 01).';
        }catch(error){$('speech-test-status').textContent=error.message;}
    }
    $('speech-test-voice').onclick = () => play('This is a test of the selected announcement voice.');
    $('speech-test-announcement').onclick = () => playAnnouncement('ongoing');
    $('speech-test-callback').onclick = () => {
        const prefix = $('cfg-callback-prefix').value.trim();
        const suffix = $('cfg-callback-suffix').value.trim();
        if (!prefix || !suffix) { $('speech-test-status').textContent = 'Call-back prefix and suffix cannot be blank.'; return; }
        playAnnouncement('callback');
    };
    for (const id of ['cfg-voice','cfg-speech-prefix','cfg-speech-template','cfg-speech-suffix']) $(id).addEventListener('input',preview);
    document.addEventListener('tdqsys-speech-hydrated', () => { applySavedVoice(); preview(); });
    document.addEventListener('input',event=>{if(event.target.closest?.('.brand-block'))preview();});
    (async () => {
        try {
            const config = await afFetchState(); const port = config?.config?.ttsPort || 8001;
            const response = await fetch(`http://localhost:${port}/api/voices`);
            if (!response.ok) throw Error('Packaged voice list is unavailable. Start or restart the TDQSYS local speech service.');
            const data = await response.json(); catalog = data.voices;
            $('cfg-voice').replaceChildren(...catalog.map(voice => new Option(voice,voice)));
            applySavedVoice(); preview();
        } catch(error) { $('speech-voice-notice').textContent=error.message; }
    })();
    preview();
})();
