'use strict';
let mirrorQrObj=null;
let mirrorLinkValue=null;
function renderMirrorQr() {
            const field = document.getElementById('cfg-mirrorlink');
            const canvas = document.getElementById('mirror-qr-canvas');
            const actions = document.getElementById('mirror-qr-actions');
            if (!field || !canvas || typeof qrcode !== 'function') return;

            const link = (field.value || '').trim();
            if (!link) {
                mirrorQrObj = null;
                canvas.hidden = true;
                if (actions) actions.hidden = true;
                return;
            }

            try {
                // Type 0 lets the library pick the smallest version that fits.
                const qr = qrcode(0, 'M');
                qr.addData(link);
                qr.make();
                mirrorQrObj = qr;

                const count = qr.getModuleCount();
                const quiet = 4;                       // spec-mandated quiet zone
                const total = count + quiet * 2;
                const cell = Math.max(2, Math.floor(1024 / total)); // integer = crisp
                const size = cell * total;

                canvas.width = size;
                canvas.height = size;
                canvas.hidden = false;

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#000000';
                for (let r = 0; r < count; r++) {
                    for (let c = 0; c < count; c++) {
                        if (qr.isDark(r, c)) {
                            ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
                        }
                    }
                }
                if (actions) actions.hidden = false;
            } catch (err) {
                mirrorQrObj = null;
                canvas.hidden = true;
                if (actions) actions.hidden = true;
                console.error('Could not build mirror link QR:', err);
            }
        }

function downloadMirrorQr(format) {
            const field = document.getElementById('cfg-mirrorlink');
            if (!mirrorQrObj || !field) return;

            const id = (field.value.match(/id=([0-9a-f-]+)/i) || [])[1] || 'location';
            const name = `tdqsys-queue-${id.slice(0, 8)}`;
            let href = null;
            let mime = null;

            if (format === 'svg') {
                // Vector output: stays sharp at any print size.
                href = 'data:image/svg+xml;charset=utf-8,' +
                    encodeURIComponent(mirrorQrObj.createSvgTag(8, 4));
                mime = 'svg';
            } else {
                const canvas = document.getElementById('mirror-qr-canvas');
                href = canvas.toDataURL('image/png');
                mime = 'png';
            }

            const a = document.createElement('a');
            a.href = href;
            a.download = `${name}.${mime}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

function copyMirrorLink() {
            const v = document.getElementById('cfg-mirrorlink').value;
            if (!v) return;
            navigator.clipboard.writeText(v).catch(() => {});
            document.getElementById('cfg-mirrorlink').select();
        }
function updateMirrorLink(link) {
    const field=document.getElementById('cfg-mirrorlink');
    if(!field || mirrorLinkValue===link)return;
    mirrorLinkValue=link;
    field.value=link;
    document.getElementById('mirror-link-notice').hidden=!!link;
    renderMirrorQr();
}
updateMirrorLink(window.TDQSYS_FACILITATOR_BOOTSTRAP?.mirrorLink || '');
