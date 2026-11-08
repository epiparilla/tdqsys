(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.TdqPrintLabel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const FONTS=['Arial','Calibri','Verdana','Tahoma','Courier New','Georgia'];
    const bounds={header:[6,30],number:[12,48]};
    function normalize(raw){
        const result={};
        for(const kind of ['client','agent']){
            const input=raw?.[kind]||{};
            result[kind]={align:['left','center','right'].includes(input.align)?input.align:'center'};
            for(const line of ['header','number']){
                const value=input[line]||{},size=Number(value.fontSize),[min,max]=bounds[line];
                result[kind][line]={fontFamily:FONTS.includes(value.fontFamily)?value.fontFamily:'Arial',
                    fontSize:Number.isFinite(size)&&size>=min&&size<=max?size:(line==='header'?24:36),
                    bold:typeof value.bold==='boolean'?value.bold:true,italic:value.italic===true};
            }
        }
        return result;
    }
    function validate(raw){
        for(const kind of ['client','agent'])for(const line of ['header','number']){
            const value=raw?.[kind]?.[line],[min,max]=bounds[line];
            if(!value||!FONTS.includes(value.fontFamily)||!Number.isFinite(Number(value.fontSize))||Number(value.fontSize)<min||Number(value.fontSize)>max)
                throw Error(`${kind==='client'?'Client ticket':'Agent code'} ${line} font must use a listed font and a size from ${min} to ${max} pt.`);
        }
        return normalize(raw);
    }
    // Self-contained: used in the preview document AND Electron print renderer.
    function fit(){
        const header=document.querySelector('h1'),number=document.querySelector('p'),name=header.querySelector('span');
        const initial=element=>parseFloat(getComputedStyle(element).fontSize);
        let headerSize=initial(header),numberSize=initial(number);
        while(headerSize>6&&(name.getBoundingClientRect().height>header.clientHeight||name.scrollWidth>header.clientWidth)){
            headerSize-=0.5;header.style.fontSize=headerSize+'px';
        }
        while(numberSize>6&&(number.scrollWidth>number.clientWidth||document.body.scrollHeight>document.body.clientHeight)){
            numberSize-=0.5;number.style.fontSize=numberSize+'px';
        }
    }
    function buildHtml(label,raw){
        const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const agent=label.kind==='se_code_slip',format=normalize(raw)[agent?'agent':'client'];
        const font=(line,weight)=>`font-family:'${line.fontFamily}';font-size:${line.fontSize}pt;font-weight:${line.bold?weight:400};font-style:${line.italic?'italic':'normal'}`;
        return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:50mm 30mm;margin:0}*{box-sizing:border-box}html{margin:0;padding:0;width:50mm;height:30mm;background:white;color:black}body{margin:0;padding:0;width:50mm;height:30mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:${format.align};overflow:hidden}h1{${font(format.header,900)};line-height:1.05;margin:1mm 2mm;max-width:46mm;overflow-wrap:anywhere}.large-code h1{width:46mm;height:10mm;flex-shrink:0;display:flex;align-items:center;overflow:hidden}.large-code h1 span{width:100%;overflow-wrap:anywhere}.large-code p{${font(format.number,700)};width:46mm;max-width:46mm;line-height:1.05;flex-shrink:0;margin:1mm 0;white-space:nowrap}</style></head><body class="${agent?'se-code':'client-ticket'} large-code"><h1><span>${escape(label.header)}</span></h1><p>${escape(label.value)}</p><script>(${fit.toString()})();<\/script></body></html>`;
    }
    return {FONTS,bounds,normalize,validate,fit,buildHtml};
});
