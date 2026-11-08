(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.TdqDisplayBranding=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const fonts=[{id:'auto',name:'System default'},{id:'geely',name:'GEELY Bold',file:'GEELY-Bold.ttf'},
        {id:'inter',name:'Inter Variable',file:'Inter-Variable.ttf'},{id:'lynkco',name:'Lynkco Type Medium',file:'LynkcoType-Medium.ttf'},
        ...['Arial','Calibri','Verdana','Tahoma','Courier New','Georgia'].map(name=>({id:name,name}))];
    const validLogo=logo=>typeof logo==='string'&&logo.length<=43714&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(logo)
        &&(logo.length-22)%4===0&&(logo.length-22)*3/4-(logo.endsWith('==')?2:logo.endsWith('=')?1:0)<=32768;
    function normalize(raw={}){
        raw=raw&&typeof raw==='object'?raw:{};
        const logo=validLogo(raw.logo)?raw.logo:'';
        const font=value=>fonts.some(font=>font.id===value)?value:'auto';
        return {brandFont:font(raw.brandFont),labelFont:font(raw.labelFont),queueFont:font(raw.queueFont),headerMode:raw.headerMode==='logo'&&logo?'logo':'text',logo};
    }
    function validate(raw){
        if(raw===undefined)return normalize();
        if(!raw||typeof raw!=='object')throw Error('Invalid display branding settings.');
        for(const key of ['brandFont','labelFont','queueFont'])if(raw[key]!==undefined&&!fonts.some(font=>font.id===raw[key]))throw Error('Choose a listed display font.');
        if(raw.headerMode!==undefined&&!['text','logo'].includes(raw.headerMode))throw Error('Choose brand text or logo.');
        if(raw.logo&&!validLogo(raw.logo))throw Error('Choose a PNG logo no larger than 32 KB after preparation.');
        if(raw.headerMode==='logo'&&!validLogo(raw.logo))throw Error('Choose a brand logo before using logo mode.');
        return normalize(raw);
    }
    const family=(id,fallback)=>id==='auto'?fallback:`'${fonts.find(font=>font.id===id)?.name||'Arial'}',sans-serif`;
    function alphaBounds(pixels,width,height){
        let left=width,top=height,right=-1,bottom=-1;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>0){
            left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
        }
        return right<0?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
    }
    function cropLogo(image){
        const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
        if(!width||!height||width*height>40000000)return null;
        const source=document.createElement('canvas');source.width=width;source.height=height;
        const context=source.getContext('2d');context.drawImage(image,0,0);
        const bounds=alphaBounds(context.getImageData(0,0,width,height).data,width,height);
        if(!bounds)return null;
        if(bounds.width===width&&bounds.height===height)return source;
        const cropped=document.createElement('canvas');cropped.width=bounds.width;cropped.height=bounds.height;
        cropped.getContext('2d').drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
        return cropped;
    }
    let frame;
    function refresh(){
        if(typeof document==='undefined'||typeof requestAnimationFrame==='undefined'||frame)return;
        frame=requestAnimationFrame(()=>{
            frame=null;
            for(const section of document.querySelectorAll('.brand-section[data-custom-queue-font="true"]'))for(const number of section.querySelectorAll('.unit-number')){
                number.style.removeProperty('font-size');
                const box=number.parentElement,base=parseFloat(getComputedStyle(number).fontSize);
                // Layout dimensions ignore the transient Ongoing pop animation.
                const scale=Math.min(1,(box.clientWidth-4)/Math.max(1,number.scrollWidth),(box.clientHeight-4)/Math.max(1,number.scrollHeight));
                if(scale>0&&scale<1)number.style.fontSize=(base*scale)+'px';
            }
        });
    }
    function apply(section,heading,brand){
        const format=normalize(brand.display);
        section.style.setProperty('--display-brand-font',family(format.brandFont,"'Syncopate',sans-serif"));
        section.style.setProperty('--display-label-font',family(format.labelFont,"'Inter',sans-serif"));
        section.style.setProperty('--display-queue-font',family(format.queueFont,"'Inter',sans-serif"));
        section.dataset.customQueueFont=String(format.queueFont!=='auto');
        if(format.headerMode==='logo'){
            const image=document.createElement('img');image.className='brand-logo';image.alt=brand.name;image.src=format.logo;
            // Correct already-saved padded logos in memory, without changing
            // location settings. New uploads are trimmed before downsampling.
            image.onload=()=>{
                image.onload=null;
                try{const cropped=cropLogo(image);if(!cropped)throw Error('Empty logo');image.src=cropped.toDataURL('image/png');}
                catch{heading.textContent=brand.name;}
            };
            image.onerror=()=>{heading.textContent=brand.name;};heading.replaceChildren(image);
        }
        refresh();
        if(document.fonts)document.fonts.ready.then(refresh);
        if(document.fonts?.load)for(const id of new Set([format.brandFont,format.labelFont,format.queueFont])){
            const font=fonts.find(font=>font.id===id);
            if(font?.file)document.fonts.load(`16px "${font.name}"`).then(refresh).catch(()=>{});
        }
    }
    if(typeof window!=='undefined')window.addEventListener('resize',refresh);
    if(typeof document!=='undefined'&&document.fonts?.addEventListener)document.fonts.addEventListener('loadingdone',refresh);
    return {fonts,validLogo,normalize,validate,alphaBounds,cropLogo,apply,refresh};
});
