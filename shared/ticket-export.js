'use strict';
// Minimal OOXML workbook writer: inline text cells prevent formula injection;
// no Excel installation or network dependency is needed to save the report.
const HEADERS=['Submitted at','Email Address','Name','City Address','Contact No.','Unit to Test Drive','For Application?','For Reservation?','Agent name','Dealership','Status','Operating day','Run','Queue number','Ticket issued','Model (colors combined)'];
function localTime(value,zone){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;}
function records(tickets,zone,brands=[]){
  return tickets.map(t=>{
    const brand=brands.find(b=>b.key===t.brandKey),prefix=brand?.models?.[t.unitIndex-1]?.prefix||'';
    return [localTime(t.submittedAt,zone),t.email,t.name,t.cityAddress,t.contactNumber,t.model,t.forApplication,t.forReservation,t.agent,t.dealership,t.status.replace('_',' '),t.day,t.runNumber,
      prefix+String(t.number).padStart(2,'0'),localTime(t.issuedAt,zone),t.model.replace(/\s+(Black|White)$/i,'')];
  });
}
const text=value=>String(value??'');
const xml=value=>text(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function csv(rows){return '\uFEFF'+rows.map(row=>row.map(value=>{let v=text(value);if(/^[\s]*[=+@-]/.test(v)||/^[\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}).join(',')).join('\r\n')+'\r\n';}
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zip(files){
  const chunks=[],directory=[];let offset=0;
  for(const [name,content] of files){const filename=Buffer.from(name),data=Buffer.from(content),crc=crc32(data),header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    chunks.push(header,filename,data);directory.push(central,filename);offset+=header.length+filename.length+data.length;
  }
  const end=Buffer.alloc(22),dir=Buffer.concat(directory);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,dir,end]);
}
function xlsx(rows,metadata){
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  function cell(value,ref,header,column,typedDates){
    if(!header && typedDates && [0,11,14].includes(column)){
      const serial=column===11?(Date.parse(value+'T00:00:00Z')/86400000+25569):(()=>{const [date,time]=value.split(' '),[day,month,year]=date.split('/').map(Number),[hour,minute,second]=time.split(':').map(Number);return Date.UTC(year,month-1,day,hour,minute,second)/86400000+25569;})();
      return `<c r="${ref}" s="${column===11?3:2}"><v>${serial}</v></c>`;
    }
    return typeof value==='number'?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"${header?' s="1"':''}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }
  const col=index=>{let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  const sheet=(data,filter)=>`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${data[0].map((_,i)=>`<col min="${i+1}" max="${i+1}" width="${[0,14].includes(i)?24:i===2||i===5||i===15?30:22}" customWidth="1"/>`).join('')}</cols><sheetData>${data.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>cell(value,col(c)+(r+1),r===0,c,filter)).join('')}</row>`).join('')}</sheetData>${filter?`<autoFilter ref="A1:${col(data[0].length-1)}${data.length}"/>`:''}</worksheet>`;
  return zip([
    ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Issued tickets" sheetId="1" r:id="rId1"/><sheet name="Report scope" sheetId="2" r:id="rId2"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',`<?xml version="1.0"?><styleSheet xmlns="${ns}"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm:ss"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF193448"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml',sheet(rows,true)],['xl/worksheets/sheet2.xml',sheet([['Report scope','Value'],...metadata],false)]
  ]);
}
function buildExport(snapshot,excludedRunIds,format,brands=[]){
  const {summarize}=require('../public/ticket-report');const summary=summarize(snapshot,excludedRunIds,true);
  const rows=[HEADERS,...records(summary.tickets,snapshot.timezone,brands)];
  const included=snapshot.runs.filter(r=>!excludedRunIds.includes(r.id));
  const meta=[['From',snapshot.from],['To',snapshot.to],['Timezone',snapshot.timezone],['Snapshot',snapshot.asOf],['Tickets issued',summary.totals.tickets],['Form submissions',summary.totals.leads],['Queued registrations',summary.totals.clients],['Included runs',included.map(r=>`${r.day} Run ${r.number}`).join('; ')],['Excluded runs',snapshot.runs.filter(r=>excludedRunIds.includes(r.id)).map(r=>`${r.day} Run ${r.number}`).join('; ')],['Queue prefix','Current desktop configuration; numeric queue numbers are preserved.'],['Dates','Day/month/year timestamps in the configured timezone; Operating day is ISO YYYY-MM-DD.']];
  if(format==='csv')return Buffer.from(csv(rows));
  if(format==='xlsx')return xlsx(rows,meta);
  throw Error('Choose Excel or CSV.');
}
module.exports={buildExport,records,csv,xlsx};
