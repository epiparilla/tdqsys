'use strict';
window.TdqDisplaySettings=(()=>{
    const api=window.TdqDisplayBranding;
    function mount(block,raw){
        const format=api.normalize(raw),panel=document.createElement('div');panel.className='display-branding-settings';panel.dataset.logo=format.logo;
        panel.innerHTML='<h3>TV and remote display fonts and brand logo</h3><p class="hint">Font type only. Display sizes remain automatic. These settings apply to this brand on both the TV and its online mirror.</p><div class="field-row"></div><div class="field"><label>Brand heading<select class="display-header-mode"><option value="text">Brand name as text</option><option value="logo">Brand logo instead of text</option></select></label></div><div class="field"><label>Choose brand logo (PNG, JPEG or WebP)<input class="display-logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="hint">Transparent PNG is recommended for the dark display. Images are resized and stored with this location\'s settings so the remote viewer needs no local file path.</p><img class="logo-preview" alt="Selected brand logo preview" hidden><button class="settings-btn btn-ghost display-logo-remove" type="button">Remove logo / use text</button><p class="logo-status" role="status"></p></div>';
        const row=panel.querySelector('.field-row');
        for(const [key,label]of [['brandFont','Brand name font'],['labelFont','Car label font'],['queueFont','Prefixed queue number font']]){
            const field=document.createElement('div');field.className='field';const text=document.createElement('label');text.textContent=label;
            const select=document.createElement('select');select.dataset.displayFont=key;
            for(const font of api.fonts){const option=document.createElement('option');option.value=font.id;option.textContent=font.name;select.append(option);}
            select.value=format[key];text.append(select);field.append(text);row.append(field);
        }
        const mode=panel.querySelector('.display-header-mode'),preview=panel.querySelector('.logo-preview'),status=panel.querySelector('.logo-status'),input=panel.querySelector('.display-logo-file');
        mode.value=format.headerMode;
        function showLogo(){preview.hidden=!panel.dataset.logo;if(panel.dataset.logo)preview.src=panel.dataset.logo;else preview.removeAttribute('src');}
        showLogo();
        panel.querySelector('.display-logo-remove').onclick=()=>{panel.dataset.logo='';mode.value='text';input.value='';status.textContent='';showLogo();};
        input.onchange=async()=>{
            const file=input.files[0];if(!file)return;
            panel.dataset.loading='true';status.textContent='Preparing logo...';
            input.disabled=true;panel.querySelector('.display-logo-remove').disabled=true;
            let url;
            try{
                if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024*1024)throw Error('Choose a PNG, JPEG or WebP image up to 4 MB.');
                url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
                if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Logo image dimensions are too large.');
                const canvas=document.createElement('canvas');let data;
                for(const width of [512,384,256,192]){
                    const scale=Math.min(1,width/image.naturalWidth,128/image.naturalHeight);
                    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
                    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/png');
                    if(api.validLogo(data))break;
                }
                if(!api.validLogo(data))throw Error('Use a simpler or smaller logo (prepared PNG must fit within 32 KB).');
                panel.dataset.logo=data;mode.value='logo';showLogo();status.textContent='Logo ready. Save Configuration to apply it to the TV and remote viewer.';
            }catch(error){status.textContent=error.message;}
            finally{panel.dataset.loading='false';input.disabled=false;panel.querySelector('.display-logo-remove').disabled=false;input.value='';if(url)URL.revokeObjectURL(url);}
        };
        block.querySelector('.model-list').closest('.field').before(panel);
    }
    function collect(block){
        const panel=block.querySelector('.display-branding-settings');
        if(panel.dataset.loading==='true')throw Error('Wait for the brand logo to finish preparing before saving.');
        const format={headerMode:panel.querySelector('.display-header-mode').value,logo:panel.dataset.logo};
        panel.querySelectorAll('[data-display-font]').forEach(select=>format[select.dataset.displayFont]=select.value);
        return api.validate(format);
    }
    return {mount,collect};
})();
