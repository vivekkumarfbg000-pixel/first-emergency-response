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
    _generateVCardQR: async function(patient, size) {
        // Build the offline payload string via storage.js
        const payload = window.Storage.buildQRPayload(patient);
        const canvas = document.createElement('canvas');
        if (window.QRCode) {
            await window.QRCode.toCanvas(canvas, payload, {
                width: size, 
                margin: 1, 
                color: { dark: '#0F172A', light: '#FFFFFF' },
                errorCorrectionLevel: 'M'
            });
        } else {
            console.error('[CardGen] QRCode library missing!');
        }
        return canvas;
    },

    // ─── 1. USER: Branded Offline QR Graphic ───
    generateBrandedQR: async function(p) {
        const cw = 800;
        const ch = 1000;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);

        // Header (Hazard Red)
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, 0, cw, 120);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCAN IN EMERGENCY --- MADAD K LIYE SCAN KRE', cw/2, 70);

        // QR Code
        const qrSize = 500;
        const qrCanvas = await this._generateVCardQR(p, qrSize);
        ctx.drawImage(qrCanvas, (cw - qrSize)/2, 180, qrSize, qrSize);

        // Footer Branding
        const logo = await this._loadLogo();
        if (logo) {
            ctx.drawImage(logo, (cw/2) - 170, 780, 60, 60);
        }
        ctx.fillStyle = '#0f172a';
        ctx.font = 'italic 900 48px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('SEHAT POINT', (cw/2) - 90, 825);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Reliable Medical Identity System', cw/2, 890);
        
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('Allergies & Contacts Embedded', cw/2, 930);

        this._download(canvas, `SehatPoint-QR-${p.fullName || 'User'}.png`);
    },

    // ─── 2. ADMIN: Standard Medical ID Card ───
    generateMedicalCard: async function(p) {
        const cw = 1100; const ch = 650;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        // Linear Gradient Background
        const grad = ctx.createLinearGradient(0,0,cw,ch);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#f1f5f9');
        ctx.fillStyle = grad; ctx.fillRect(0,0,cw,ch);

        // Header Stripe
        ctx.fillStyle = '#dc2626'; ctx.fillRect(0,0,cw,100);

        // Logo & Title
        const logo = await this._loadLogo();
        if (logo) ctx.drawImage(logo, 30, 20, 60, 60);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 900 42px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('SEHAT POINT', 110, 65);

        // Patient Data
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 54px sans-serif';
        ctx.fillText(p.fullName || 'PATIENT NAME', 50, 190);

        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('ID: ' + (p.id || p.patientId || 'N/A').substring(0,8).toUpperCase(), 50, 240);

        // Data Grid
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('BLOOD GROUP: ' + (p.bloodGroup || 'UNKNOWN'), 50, 320);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Critical Allergies:', 50, 400);
        ctx.font = '28px sans-serif';
        ctx.fillStyle = '#dc2626';
        ctx.fillText(p.allergies || 'None Identified', 50, 440);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Family Contact:', 50, 500);
        ctx.font = '28px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(p.contact1_Phone || 'Not Assisgned', 50, 540);

        // Emergency Line Footer
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 590, cw, 60);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('EMERGENCY DISPATCH: 1800-SEHAT-PT', cw/2, 630);

        // QR Code
        const qrSize = 340;
        const qrCanvas = await this._generateVCardQR(p, qrSize);
        ctx.drawImage(qrCanvas, cw - qrSize - 50, 150, qrSize, qrSize);

        // Scan Prompt Under QR
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('SCAN TO CALL & VIEW', cw - 50 - (qrSize/2), 530);

        this._download(canvas, `Medical-ID-${p.fullName || 'Patient'}.png`);
    },

    // ─── 3. ADMIN: Wristband Band QR ───
    generateWristband: async function(p) {
        const cw = 1600; const ch = 300;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cw,ch);
        
        // Solid Borders
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 4; ctx.strokeRect(0,0,cw,ch);

        // Left Tag Warning Zone
        ctx.fillStyle = '#ef4444'; ctx.fillRect(0,0,60,ch);

        const logo = await this._loadLogo();
        if (logo) ctx.drawImage(logo, 90, 110, 80, 80);

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'left';
        ctx.font = 'italic 900 36px sans-serif';
        ctx.fillText('SEHAT POINT', 190, 140);
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('EMERGENCY WRISTBAND', 190, 180);

        // Visual Divider 1
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(550, 30, 2, 240);

        // Medical Data Zone
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText(p.fullName || 'PATIENT NAME', 600, 110);

        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText('BLOOD: ' + (p.bloodGroup || 'UNKNOWN'), 600, 170);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('AGE: ' + (p.age || '--') + ' | GENDER: ' + (p.gender || '--'), 600, 230);

        // Visual Divider 2
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(1220, 30, 2, 240);

        // Specific QR Zone
        const qrSize = 240;
        const qrCanvas = await this._generateVCardQR(p, qrSize);
        ctx.drawImage(qrCanvas, 1290, 30, qrSize, qrSize);

        this._download(canvas, `Wristband-${p.fullName || 'Patient'}.png`);
    },

    _download: function(canvas, filename) {
        const link = document.createElement('a');
        link.download = filename.trim().replace(/\s+/g, '-');
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
    }
};
