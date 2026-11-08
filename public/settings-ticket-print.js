'use strict';
(() => {
    const api=window.TdqPrintLabel,controls=document.getElementById('ticket-font-controls');
    let formats=api.normalize(),active='client';
    for(const line of ['header','number']){
        const fieldset=document.createElement('fieldset');
        const title=line==='header'?'Header (model shortname / Agent name)':'Queue number / four-digit code';
        fieldset.innerHTML=`<legend>${title}</legend><div class="ticket-font-row"><label>Font<select id="ticket-${line}-font"></select></label><label>Size (pt)<input id="ticket-${line}-size" type="number" step="0.5" min="${api.bounds[line][0]}" max="${api.bounds[line][1]}" required></label><label class="check-label"><input id="ticket-${line}-bold" type="checkbox">Bold</label><label class="check-label"><input id="ticket-${line}-italic" type="checkbox">Italic</label></div>`;
        for(const font of api.FONTS){const option=document.createElement('option');option.value=option.textContent=font;fieldset.querySelector('select').append(option);}
        controls.append(fieldset);
    }
    const node=id=>document.getElementById(id);
    function capture(){
        const result={align:node('ticket-align').value};
        for(const line of ['header','number'])result[line]={fontFamily:node(`ticket-${line}-font`).value,fontSize:Number(node(`ticket-${line}-size`).value),bold:node(`ticket-${line}-bold`).checked,italic:node(`ticket-${line}-italic`).checked};
        formats[active]=result;
    }
    function renderControls(){
        const format=formats[active];node('ticket-align').value=format.align;
        for(const line of ['header','number']){
            node(`ticket-${line}-font`).value=format[line].fontFamily;node(`ticket-${line}-size`).value=format[line].fontSize;
            node(`ticket-${line}-bold`).checked=format[line].bold;node(`ticket-${line}-italic`).checked=format[line].italic;
        }
    }
    function preview(){
        const model=document.querySelector('.brand-block .model-row');
        const header=active==='agent'?node('ticket-agent-sample').value:(model?.querySelector('.model-shortname')?.value||model?.querySelector('.model-label')?.value||'CAR MODEL');
        const prefix=model?.querySelector('.model-prefix')?.value||'AA';
        node('ticket-print-preview').srcdoc=api.buildHtml({kind:active==='agent'?'se_code_slip':'client_ticket',header,value:active==='agent'?'0042':prefix+'01'},formats);
    }
    controls.addEventListener('input',()=>{capture();preview();});
    node('ticket-align').addEventListener('change',()=>{capture();preview();});
    node('ticket-label-type').addEventListener('change',()=>{capture();active=node('ticket-label-type').value;renderControls();preview();});
    node('ticket-agent-sample').addEventListener('input',preview);
    node('ticket-font-reset').addEventListener('click',()=>{formats[active]=api.normalize()[active];renderControls();preview();});
    document.getElementById('brand-editors').addEventListener('input',preview);
    new MutationObserver(preview).observe(document.getElementById('brand-editors'),{childList:true,subtree:true});
    window.TdqTicketPrint={hydrate(raw){formats=api.normalize(raw);renderControls();preview();},collect(){capture();return api.validate(formats);}};
    renderControls();preview();
})();
