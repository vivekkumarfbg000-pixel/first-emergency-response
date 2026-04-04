/* ============================================================
   dashboard.js — v6-pro Clinical Logic Overhaul
   Features: Real-time Sync, Tailwind UI Integration, 
             Multi-Profile Management, and GPS Hub.
   ============================================================ */

(function () {
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    let currentPatient = null;
    let _cachedPatients = null;

    async function init() {
        console.log('[Dashboard] v6-pro Clinical Engine Starting...');
        
        // 1. Auth Check
        const user = await window.Auth.getUser();
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // 2. Initial Data Pull
        currentPatient = await window.Storage.getCurrentPatient();
        _cachedPatients = await window.Storage.getAllPatients();

        // 3. UI Setup
        bootstrapUI();
        await renderAll();
        
        // 4. Real-time Listeners
        setupRealtime();
        setupGPS();

        // 5. Finishing Touches
        if (window.lucide) lucide.createIcons();
    }

    function bootstrapUI() {
        // UI event listeners for static elements
        const gpsCard = $('gps-stat-card');
        if (gpsCard) gpsCard.onclick = () => requestLocation();
    }

    // ─── Rendering Engine (v6-pro Tailwind) ───
    async function renderAll() {
        try {
            currentPatient = await window.Storage.getCurrentPatient();
            const allPatients = await window.Storage.getAllPatients();
            _cachedPatients = allPatients;
            
            // 1. Welcome & Switcher
            txt('welcome-msg', currentPatient ? currentPatient.fullName : 'Welcome, Admin');

            const switcher = $('patientSwitcher');
            if (switcher) {
                switcher.innerHTML = allPatients.map(p => 
                    `<option value="${p.id || p.patientId}" ${ (currentPatient && (currentPatient.id === p.id || currentPatient.patientId === p.patientId)) ? 'selected' : ''}>
                        ${p.fullName}
                    </option>`
                ).join('');
                
                switcher.onchange = async (e) => {
                    localStorage.setItem('current_patient_id', e.target.value);
                    await renderAll();
                };
            }

            // 2. Metrics & SOS
            const totalScans = await window.Storage.getTotalScans();
            txt('stat-scans', (totalScans || 0).toLocaleString());

            // 3. Emergency Card (QR)
            renderEmergencyQR(currentPatient);

            // 4. Tab Lists
            await renderPatientsList(allPatients);
            await renderRecentActivity();

        } catch (err) {
            console.error('[Dashboard] Render Error:', err);
        }
    }

    function renderEmergencyQR(patient) {
        const wrapper = $('emergency-card-preview');
        if (!patient || !wrapper) return;

        wrapper.classList.remove('hidden');
        wrapper.innerHTML = `
            <div class="bg-white rounded-3xl p-6 border-2 border-slate-900 shadow-xl relative overflow-hidden">
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                        <span class="text-[10px] font-black uppercase tracking-widest text-red-600">Clinical ID</span>
                    </div>
                    <button onclick="downloadQR()" class="text-slate-400 hover:text-slate-900">
                        <i data-lucide="download" class="w-4 h-4"></i>
                    </button>
                </div>
                <div id="qr-code-zone" class="flex justify-center mb-6"></div>
                <div class="text-center">
                    <h3 class="text-xl font-black text-slate-900 uppercase tracking-tight">${patient.fullName}</h3>
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: ${patient.patientId || patient.id || 'EMS-REF'}</p>
                </div>
            </div>
        `;

        const qrZone = $('qr-code-zone');
        if (qrZone && window.QRCode) {
            const url = window.Storage.buildEmergencyUrl(patient);
            QRCode.toCanvas(url, {
                width: 180,
                margin: 0,
                color: { dark: '#0f172a', light: '#ffffff' }
            }, (err, canvas) => {
                if (!err) qrZone.appendChild(canvas);
            });
        }
        if (window.lucide) lucide.createIcons();
    }

    window.downloadQR = function() {
        const canvas = document.querySelector('#qr-code-zone canvas');
        if (canvas) {
            const link = document.createElement('a');
            link.download = `SehatPoint_QR_${currentPatient.fullName}.png`;
            link.href = canvas.toDataURL();
            link.click();
        }
    };

    async function renderPatientsList(patients) {
        const list = $('patients-list');
        if (!list) return;

        if (patients.length === 0) {
            list.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No Profiles Found</div>`;
            return;
        }

        list.innerHTML = patients.map(p => `
            <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center transition-all active:scale-95" onclick="window.switchToProfile('${p.id || p.patientId}')">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-black">
                        ${p.fullName.charAt(0)}
                    </div>
                    <div>
                        <p class="text-sm font-black text-slate-900">${p.fullName}</p>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${p.bloodGroup || 'Blood Type --'}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <a href="register.html?edit=${p.id || p.patientId}" class="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-slate-900" onclick="event.stopPropagation()">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </a>
                </div>
            </div>
        `).join('');
        if (window.lucide) lucide.createIcons();
    }

    window.switchToProfile = async function(id) {
        localStorage.setItem('current_patient_id', id);
        await renderAll();
        if (window.switchTab) window.switchTab('tab-overview');
    };

    async function renderRecentActivity() {
        const list = $('activity-list');
        if (!list) return;

        const scans = await window.Storage.getScanHistory();
        if (scans.length === 0) {
            list.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Quiet Protocol Active</div>`;
            return;
        }

        list.innerHTML = scans.map(s => {
            const isEmergency = s.type === 'emergency_scan' || s.is_emergency;
            const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return `
                <div class="bg-white p-4 rounded-2xl border ${isEmergency ? 'border-red-100 bg-red-50/20' : 'border-slate-100'} shadow-sm flex items-start gap-3">
                    <div class="w-8 h-8 ${isEmergency ? 'bg-red-600 font-bold pulse-red' : 'bg-slate-200'} text-white rounded-xl flex items-center justify-center flex-shrink-0">
                        <i data-lucide="${isEmergency ? 'alert-triangle' : 'scan'}" class="w-4 h-4"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-black uppercase tracking-widest ${isEmergency ? 'text-red-600' : 'text-slate-400'}">Scan Detected</span>
                            <span class="text-[10px] font-bold text-slate-400 uppercase">${time}</span>
                        </div>
                        <p class="text-xs font-black text-slate-900 truncate">${s.location || 'Location Not Synced'}</p>
                    </div>
                </div>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    function setupRealtime() {
        const client = window.Storage.db();
        if (!client) return;

        client.channel('dashboard-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'scans' }, () => renderAll())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => renderAll())
            .subscribe();
    }

    function setupGPS() {
        // Initial state
        if (navigator.geolocation) {
            // Can optionally check permission state here
        }
    }

    async function requestLocation() {
        const text = $('gps-text');
        const stat = $('stat-gps');
        const dot = $('gps-dot');

        if (!navigator.geolocation) return;

        txt('gps-text', 'SYNCING...');
        
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                txt('gps-text', 'ACTIVE');
                txt('stat-gps', 'Enabled');
                if (dot) {
                    dot.classList.remove('bg-slate-500');
                    dot.classList.add('bg-emerald-500', 'animate-pulse');
                }
                window.Storage.last_lat = pos.coords.latitude;
                window.Storage.last_lng = pos.coords.longitude;
            },
            () => {
                txt('gps-text', 'DENIED');
                txt('stat-gps', 'Disabled');
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
    window.requestLocation = requestLocation;

    // Start
    init();

})();
