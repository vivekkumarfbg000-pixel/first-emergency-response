/**
 * card-generator.js
 * Renders high-fidelity offline vCard graphics, ID Cards, and Wristbands using HTML5 Canvas.
 */
window.CardGenerator = {

    _loadLogo: function() {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn('[CardGenerator] Failed to load logo.png');
                resolve(null);
            };
            img.src = 'assets/logo.png';
        });
    },

    // Generates a literal QR code payload onto a temporary Canvas
    // Mode can be 'vcard' (offline data) or 'url' (fast scan)
    _generateQR: async function(patient, size, mode = 'vcard') {
        let payload = '';
        if (mode === 'url') {
            payload = window.Storage.buildEmergencyUrl(patient);
        } else {
            payload = window.Storage.buildQRPayload(patient);
        }

        const canvas = document.createElement('canvas');
        if (window.QRCode) {
            await window.QRCode.toCanvas(canvas, payload, {
                width: size, 
                margin: 1, 
                color: { dark: '#000000', light: '#FFFFFF' },
                errorCorrectionLevel: mode === 'url' ? 'L' : 'M' // Lower error correction for URL means faster scan
            });
        } else {
            console.error('[CardGen] QRCode library missing!');
        }
        return canvas;
    },

    // ─── 1. USER: High-Fidelity Branded QR (Metallic Landscape Design) ───
    generateBrandedQR: async function(p, mode = 'vcard') {
        const cw = 1100;
        const ch = 650;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        const burgundy = '#6B1C23';
        const gold = '#D4A017';
        const teal = '#064E3B';
        const brandGold = '#C5A059';

        // 1. Metallic Background (Brushed Steel)
        const grad = ctx.createLinearGradient(0, 0, cw, ch);
        grad.addColorStop(0, '#e2e8f0');
        grad.addColorStop(0.2, '#ffffff');
        grad.addColorStop(0.5, '#cbd5e1');
        grad.addColorStop(0.8, '#f8fafc');
        grad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);

        // Enhanced Brushed Texture
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 0.5;
        for(let i=0; i<ch; i+=2) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(cw, i + (Math.random()*0.5 - 0.25));
            ctx.stroke();
        }

        // 2. Upper Section (Emergency - Burgundy)
        ctx.fillStyle = burgundy;
        CardGenerator._roundRect(ctx, 30, 30, 640, 140, 20);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('EMERGENCY', 85, 95);

        // Gold prompter box (centered inside header)
        ctx.fillStyle = burgundy;
        CardGenerator._roundRect(ctx, 90, 110, 680, 80, 15);
        ctx.fill();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = gold;
        ctx.font = 'bold 54px "Hind", serif';
        ctx.textAlign = 'right';
        ctx.fillText('स्कैन करें', 740, 172);
        
        // Lines inside prompter
        ctx.beginPath();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        ctx.moveTo(110, 160); ctx.lineTo(500, 160);
        ctx.stroke();

        // 3. Patient Info (Left Section)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1e293b';
        ctx.font = '900 64px "Inter", sans-serif';
        const name = (p.fullName || 'NAME REDACTED').toUpperCase();
        ctx.fillText(name, 80, 260);

        ctx.font = 'bold 38px "Inter", sans-serif';
        const displayId = (p.id || p.patientId || 'A0000000').substring(0, 8).toUpperCase();
        ctx.fillText(`ID: ${displayId}`, 80, 320);

        // Blood Group (Red)
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 44px "Inter", sans-serif';
        ctx.fillText(`BLOOD GROUP: ${p.bloodGroup || 'UNKNOWN'}`, 80, 385);

        // Allergies
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 38px "Inter", sans-serif';
        ctx.fillText(`Critical Allergies: `, 80, 450);
        const allergies = p.allergies || 'NA';
        ctx.fillStyle = (allergies === 'NA' || !allergies) ? '#334155' : '#ef4444';
        ctx.fillText(allergies.toUpperCase(), 430, 450);

        // Contact
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 38px "Inter", sans-serif';
        ctx.fillText(`Family Contact: ${p.emergencyContact || p.contact1_Phone || 'NOT SET'}`, 80, 515);

        // 4. QR Section (Right Side)
        const qrSize = 300;
        const qrCanvas = await CardGenerator._generateQR(p, qrSize, mode);
        
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffffff';
        CardGenerator._roundRect(ctx, 730, 210, qrSize + 25, qrSize + 25, 10);
        ctx.fill();
        ctx.restore();
        
        ctx.strokeStyle = gold;
        ctx.lineWidth = 4;
        CardGenerator._roundRect(ctx, 730, 210, qrSize + 25, qrSize + 25, 10);
        ctx.stroke();

        ctx.drawImage(qrCanvas, 742, 222, qrSize, qrSize);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 18px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCAN TO VIEW MEDICAL REPORT', 742 + qrSize/2, 535);

        // 5. Footer (Teal Bar)
        ctx.fillStyle = teal;
        CardGenerator._roundRect(ctx, 30, 550, 1040, 110, 20);
        ctx.fill();

        CardGenerator._drawMedicalShield(ctx, 130, 605, 45);

        // Brand Label
        ctx.textAlign = 'left';
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = brandGold;
        ctx.font = 'bold 54px "Hind", serif';
        ctx.fillText('सेहत', 195, 618);
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px "Inter", sans-serif';
        ctx.fillText('Point', 320, 618);

        // Local Emergency Numbers (Right side of footer)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px "Inter", sans-serif';
        ctx.fillText('Emergency - 112', 1030, 595);
        ctx.font = 'normal 28px "Inter", sans-serif';
        ctx.fillText('sehat point - 9876543210', 1030, 635);

        // Gold line separator
        ctx.strokeStyle = gold;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(30, 550); ctx.lineTo(1070, 550);
        ctx.stroke();

        CardGenerator._download(canvas, `SehatPoint-QR-${p.fullName || 'User'}-${mode}.png`);
    },

    // ─── 2. ADMIN: Premium Medical Identity Card ───
    generateMedicalCard: async function(p) {
        const cw = 1100;
        const ch = 650;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        // 1. Metallic Background (Brushed Steel)
        const grad = ctx.createLinearGradient(0, 0, cw, ch);
        grad.addColorStop(0, '#e2e8f0');
        grad.addColorStop(0.2, '#ffffff');
        grad.addColorStop(0.5, '#cbd5e1');
        grad.addColorStop(0.8, '#f8fafc');
        grad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);

        // Brushed texture effect
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 0.5;
        for(let i=0; i<ch; i+=2) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(cw, i + (Math.random()*0.5 - 0.25));
            ctx.stroke();
        }

        // 2. Header (Emergency - Burgundy)
        const burgundy = '#6B1C23';
        const gold = '#D4A017';
        
        ctx.fillStyle = burgundy;
        CardGenerator._roundRect(ctx, 30, 30, 640, 140, 20);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('EMERGENCY', 85, 95);

        // Gold prompter box (centered inside header)
        ctx.fillStyle = burgundy;
        CardGenerator._roundRect(ctx, 90, 110, 680, 80, 15);
        ctx.fill();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = gold;
        ctx.font = 'bold 54px "Hind", serif';
        ctx.textAlign = 'right';
        ctx.fillText('स्कैन करें', 740, 172);
        
        // Lines inside prompter
        ctx.beginPath();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        ctx.moveTo(110, 160); ctx.lineTo(500, 160);
        ctx.stroke();

        // 3. Patient Info (Left Section)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1e293b';
        ctx.font = '900 64px "Inter", sans-serif';
        const name = (p.fullName || 'NAME REDACTED').toUpperCase();
        ctx.fillText(name, 80, 260);

        ctx.font = 'bold 38px "Inter", sans-serif';
        const displayId = (p.id || p.patientId || 'A0000000').substring(0, 8).toUpperCase();
        ctx.fillText(`ID: ${displayId}`, 80, 320);

        // Blood Group (Red)
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 44px "Inter", sans-serif';
        ctx.fillText(`BLOOD GROUP: ${p.bloodGroup || 'UNKNOWN'}`, 80, 385);

        // Allergies
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 38px "Inter", sans-serif';
        ctx.fillText(`Critical Allergies: `, 80, 450);
        const allergies = p.allergies || 'NA';
        ctx.fillStyle = (allergies === 'NA' || !allergies) ? '#334155' : '#ef4444';
        ctx.fillText(allergies.toUpperCase(), 430, 450);

        // Contact
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 38px "Inter", sans-serif';
        ctx.fillText(`Family Contact: ${p.contact1_Phone || p.emergencyContact || 'NOT SET'}`, 80, 515);

        // 4. QR Section (Right Side)
        const qrSize = 280;
        const qrCanvas = await CardGenerator._generateQR(p, qrSize, 'url'); // Identity cards use URL for instant access
        
        ctx.fillStyle = '#ffffff';
        CardGenerator._roundRect(ctx, 730, 210, qrSize + 20, qrSize + 20, 10);
        ctx.fill();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.drawImage(qrCanvas, 740, 220, qrSize, qrSize);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 18px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCAN TO VIEW MEDICAL REPORT', 740 + qrSize/2, 530);

        // 5. Footer (Teal Bar)
        const teal = '#064E3B';
        const brandGold = '#C5A059';

        ctx.fillStyle = teal;
        CardGenerator._roundRect(ctx, 30, 550, 1040, 110, 20); // Overflow a bit for bleed look
        ctx.fill();

        CardGenerator._drawMedicalShield(ctx, 130, 605, 45);

        // Brand Label
        ctx.textAlign = 'left';
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = brandGold;
        ctx.font = 'bold 54px "Hind", serif';
        ctx.fillText('सेहत', 195, 618);
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px "Inter", sans-serif';
        ctx.fillText('Point', 320, 618);

        // Local Emergency Numbers (Right side of footer)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px "Inter", sans-serif';
        ctx.fillText('Emergency -112', 1030, 595);
        ctx.font = 'normal 28px "Inter", sans-serif';
        ctx.fillText('sehat point - 9876543210', 1030, 635);

        // Gold line separator
        ctx.strokeStyle = gold;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(30, 550); ctx.lineTo(1070, 550);
        ctx.stroke();

        CardGenerator._download(canvas, `SehatPoint-ID-${p.fullName || 'User'}.png`);
    },

    // ─── 3. ADMIN: Premium Silicon Wristband ───
    generateWristband: async function(p) {
        const cw = 1800; const ch = 400;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        // Dark Silicon Deep Teal/Grey
        const bandGrad = ctx.createLinearGradient(0,0,0,ch);
        bandGrad.addColorStop(0, '#1e293b');
        bandGrad.addColorStop(0.5, '#0f172a');
        bandGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = bandGrad;
        CardGenerator._roundRect(ctx, 40, 40, cw-80, ch-80, 40);
        ctx.fill();

        // Texture/Shadow
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2;
        ctx.strokeRect(50, 50, cw-100, ch-100);

        // Left Branding
        CardGenerator._drawMedicalShield(ctx, 150, ch/2, 50);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 900 48px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('SEHAT POINT', 240, (ch/2) - 10);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('EMERGENCY RESPONSE UNIT', 240, (ch/2) + 30);

        // Divider
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(700, 80, 4, 240);

        // Patient Data (Embossed look)
        ctx.textAlign = 'left';
        ctx.shadowColor = 'black'; ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 64px sans-serif';
        ctx.fillText(p.fullName?.toUpperCase() || 'NAME', 760, 160);

        ctx.fillStyle = '#ef4444';
        ctx.font = '900 52px sans-serif';
        ctx.fillText('BLOOD: ' + (p.bloodGroup || 'UNK'), 760, 240);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('ALLERGIES: ' + (p.allergies || 'NONE'), 760, 310);
        ctx.shadowOffsetY = 0;

        // Divider 2
        ctx.fillRect(1350, 80, 4, 240);

        // QR Zone
        const qrSize = 240;
        const qrCanvas = await CardGenerator._generateQR(p, qrSize, 'url');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1420, 80, qrSize+20, qrSize+20);
        ctx.drawImage(qrCanvas, 1430, 90, qrSize, qrSize);

        CardGenerator._download(canvas, `Premium-Wristband-${p.fullName || 'Patient'}.png`);
    },

    // ─── HELPERS ───
    _roundRect: function(ctx, x, y, width, height, radius) {
        if (typeof radius === 'undefined') radius = 5;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    _drawMedicalShield: function(ctx, x, y, size) {
        ctx.save();
        ctx.translate(x, y);
        
        // Shield Outline (White)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.bezierCurveTo(size, -size, size, size/2, 0, size);
        ctx.bezierCurveTo(-size, size/2, -size, -size, 0, -size);
        ctx.closePath();
        ctx.stroke();
        
        // Inner Plus (White)
        ctx.fillStyle = '#ffffff';
        const plusSize = size * 0.4;
        ctx.fillRect(-plusSize/2, -plusSize/10, plusSize, plusSize/5);
        ctx.fillRect(-plusSize/10, -plusSize/2, plusSize/5, plusSize);
        
        ctx.restore();
    },

    _download: function(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename.trim().replace(/\s+/g, '-');
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
    }
};
