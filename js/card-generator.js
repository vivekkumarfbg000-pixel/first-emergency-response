/**
 * card-generator.js
 * Renders a professional medical ID card using HTML5 Canvas.
 */
window.CardGenerator = {
    // Standard credit card aspect ratio: 85.6mm x 53.98mm (scaled for high-res)
    WIDTH: 1012, 
    HEIGHT: 638,
    PPI: 300,
    FONT: 'bold 42px Inter, "Segoe UI", Roboto, sans-serif',

    generate: async function (p) {
        if (!p) return null;
        console.log('[CardGen] Starting generation for:', p.fullName);

        // ─── 1. Font Handling (Robust Load) ───
        try {
            if (document.fonts && document.fonts.load) {
                // We load multiple weights to ensure the card looks professional
                await Promise.all([
                    document.fonts.load('bold 42px Inter'),
                    document.fonts.load('500 24px Inter')
                ]);
            }
        } catch (e) {
            console.warn('[CardGen] Font load failed, using system fallbacks', e);
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.WIDTH;
        canvas.height = this.HEIGHT;
        const ctx = canvas.getContext('2d');

        // 1. BACKGROUND (Premium Gradient)
        const grad = ctx.createLinearGradient(0, 0, this.WIDTH, this.HEIGHT);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#f8fafc');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

        // 2. HEADER STRIPE
        ctx.fillStyle = '#dc2626'; // Emergency Red
        ctx.fillRect(0, 0, this.WIDTH, 120);

        // Header Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px Inter, system-ui, sans-serif';
        ctx.fillText('EMERGENCY MEDICAL ID', 40, 75);
        
        ctx.font = '500 24px Inter, system-ui, sans-serif';
        ctx.fillText('First Emergency Response System', 40, 105);

        // 3. BRANDING LOGO (Placeholder)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.WIDTH - 80, 60, 30, 0, Math.PI * 2);
        ctx.stroke();

        // 4. PHOTO PLACEHOLDER
        ctx.fillStyle = '#e2e8f0';
        ctx.roundRect = ctx.roundRect || function (x, y, w, h, r) {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            this.beginPath();
            this.moveTo(x + r, y);
            this.arcTo(x + w, y, x + w, y + h, r);
            this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r);
            this.arcTo(x, y, x + w, y, r);
            this.closePath();
            return this;
        };
        
        ctx.beginPath();
        ctx.fillStyle = '#f1f5f9';
        ctx.roundRect(40, 160, 220, 220, 20).fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Avatar Initial
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 80px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.fullName.charAt(0).toUpperCase(), 40 + 110, 160 + 135);
        ctx.textAlign = 'left';

        // 5. PATIENT DETAILS
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 44px Inter, sans-serif';
        ctx.fillText(p.fullName.toUpperCase(), 300, 210);

        ctx.font = '500 24px Inter, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`ID: ${p.patientId} • ${p.age}Y / ${p.gender.toUpperCase()}`, 300, 250);

        // 6. BLOOD GROUP BADGE
        ctx.fillStyle = '#fee2e2';
        ctx.roundRect(300, 280, 140, 60, 12).fill();
        ctx.fillStyle = '#991b1b';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.fillText(p.bloodGroup, 325, 322);

        // 7. ALLERGY ALERT
        if (p.allergies && p.allergies.toLowerCase() !== 'none') {
            ctx.fillStyle = '#fef3c7'; // Amber
            ctx.fillRect(300, 360, 670, 80);
            ctx.fillStyle = '#92400e';
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.fillText('⚠️ ALLERGIES:', 320, 395);
            ctx.font = '500 24px Inter, sans-serif';
            ctx.fillText(p.allergies, 320, 425);
        }

        // 8. CONTACTS
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 26px Inter, sans-serif';
        ctx.fillText('EMERGENCY CONTACT', 40, 480);
        
        ctx.font = '500 22px Inter, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(`${p.contact1_Name} (${p.contact1_Relation})`, 40, 515);
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(p.contact1_Phone, 40, 550);

        // ─── 9. QR Code (Self-Sufficient Internal Gen) ───
        ctx.fillStyle = '#ffffff';
        const qrSize = 180;
        const qrX = this.WIDTH - qrSize - 40;
        const qrY = 430;
        
        ctx.roundRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 15).fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.stroke();

        try {
            const baseUrl = window.location.href.split('dashboard.html')[0];
            const profileUrl = `${baseUrl}emergency.html?id=${p.patientId || p.id}`;
            const vcard = window.Storage.generateHybridVCard(p, profileUrl);
            
            const tempCanvas = document.createElement('canvas');
            // Use the global QRCode to generate a fresh copy
            await new Promise((resolve, reject) => {
                if (typeof QRCode === 'undefined') return reject('QRCode library missing');
                QRCode.toCanvas(tempCanvas, vcard, { 
                    margin: 1, 
                    width: qrSize,
                    errorCorrectionLevel: 'M' // Medium is best for print/scan balance
                }, (err) => err ? reject(err) : resolve());
            });
            ctx.drawImage(tempCanvas, qrX, qrY, qrSize, qrSize);
        } catch (qrErr) {
            console.error('[CardGen] QR Fallback failed:', qrErr);
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(qrX, qrY, qrSize, qrSize);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px Inter';
            ctx.fillText('QR LOAD ERROR', qrX + 45, qrY + 90);
        }

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SCAN FOR FULL PROFILE', qrX + (qrSize/2), 625);
        ctx.textAlign = 'left';

        // 10. FOOTER ACCENT
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, this.HEIGHT - 8, this.WIDTH, 8);

        return canvas.toDataURL('image/png', 1.0);
    }
};
