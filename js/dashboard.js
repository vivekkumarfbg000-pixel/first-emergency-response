/* ============================================================
   dashboard.js — v9-pro Personal Command Center Engine
   Features: Multi-Profile Clinical Hub, Real-time Scan Sync,
             Tactical Medical ID Generation & Activity Tracking.
   ============================================================ */

(function () {
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    let _currentView = 'tab-overview';
    let _patients = [];
    let _activePatient = null;

    // ─── Initialization ───
    async function init() {
        console.log('[PersonalCommand] Initializing v9-pro Tactical Engine...');
        
        // 1. Auth & Session Check
        const session = await window.Auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const sid = urlParams.get('sid');

        // 2. Initial Data Pull
        await loadDashboardData(sid);
        
        // 3. Register Global Listeners
        if ($('patientSwitcher')) {
            $('patientSwitcher').addEventListener('change', e => switchPatient(e.target.value));
        }

        // 4. GPS & Sync Heartbeat
        setupGPS();
        setInterval(() => txt('admin-time', new Date().toLocaleTimeString('en-GB') + ' UTC'), 1000);

        if (window.lucide) lucide.createIcons();
    }

    async function loadDashboardData(sid = null) {
        if (sid) {
            const isAdmin = await window.Storage._isAdminUser();
            if (isAdmin) {
                const p = await window.Storage.getPatientById(sid);
                if (p) {
                    _patients = [p];
                    console.log('[PersonalCommand] Admin override: Loading patient context', p.id);
                }
            }
        }

        if (_patients.length === 0) {
            _patients = await window.Storage.getAllPatients();
        }
        
        // Populate Registry Metrics
        txt('stat-profiles', _patients.length);
        
        // Populate Switcher
        const switcher = $('patientSwitcher');
        if (switcher && _patients.length > 0) {
            switcher.innerHTML = _patients.map(p => `
                <option value="${p.id}">${p.fullName.split(' ')[0]}</option>
            `).join('');

            // Set Initial Active
            const primary = _patients.find(p => p.isPrimary) || _patients[0];
            await switchPatient(primary.id);
        } else if (_patients.length === 0) {
            const isAdmin = await window.Storage._isAdminUser();
            if (isAdmin) {
                txt('welcome-msg', 'Admin Monitor');
                return;
            }
            // NEW: Auto-Redirect to Registration for first-time users
            console.log('[PersonalCommand] No clinical profiles detected. Redirecting to initialization...');
            const user = await window.Auth.getUser();
            const name = user?.user_metadata?.full_name || user?.user_metadata?.display_name || '';
            const email = user?.email || '';
            window.location.href = `register.html?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
            return;
        }

        // Render Tables & Feeds
        renderPatientRegistry();
        renderActivityLog();
        refreshScanCount();
    }

    async function switchPatient(id) {
        _activePatient = _patients.find(p => p.id === id);
        if (!_activePatient) return;

        txt('welcome-msg', _activePatient.fullName.split(' ')[0]);
        renderMedicalIDHub(_activePatient);
        
        // Update Session Meta
        console.log(`[PersonalCommand] Switched to Frequency: ${_activePatient.fullName}`);
    }

    // ─── Tactical UI Rendering (v9-pro Style) ───
    function renderMedicalIDHub(p) {
        const container = $('emergency-card-preview');
        if (!container) return;

        const isCritical = p.conditions?.toLowerCase().includes('allergy') || p.conditions?.toLowerCase().includes('heart');
        const bloodClass = p.bloodGroup?.includes('-') ? 'text-red-500' : 'text-blue-500';

        container.innerHTML = `
            <div class="clinical-id-card rounded-[2rem] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
                <div class="absolute top-0 right-0 bg-dispatch-blue/20 text-dispatch-blue text-[9px] font-black px-4 py-2 rounded-bl-2xl tracking-widest">ENCRYPTED ID</div>
                
                <div class="flex items-start justify-between mb-8">
                    <div>
                        <h2 class="text-3xl font-black text-white italic uppercase leading-none mb-2">${p.fullName}</h2>
                        <div class="flex items-center gap-3">
                            <span class="bg-slate-900 border border-slate-700 text-slate-400 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest leading-none">AGE: ${p.age || '--'}</span>
                            <span class="bg-slate-900 border border-slate-700 ${bloodClass} px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest leading-none">BLOOD: ${p.bloodGroup || '--'}</span>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col md:flex-row items-center gap-8">
                    <div class="bg-white p-4 rounded-3xl shadow-inner ring-8 ring-white/5">
                        <canvas id="qr-canvas-${p.id}" class="w-40 h-40"></canvas>
                    </div>
                    
                    <div class="flex-1 space-y-4 w-full">
                        <div class="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                            <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                <i data-lucide="alert-octagon" class="w-3 h-3 text-red-500"></i> Critical Alert
                            </p>
                            <p class="text-xs font-bold ${isCritical ? 'text-red-400' : 'text-slate-300'} uppercase">${p.conditions || 'None Reported'}</p>
                        </div>
                        <div class="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                            <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                <i data-lucide="phone" class="w-3 h-3 text-blue-400"></i> Emergency Line
                            </p>
                            <p class="text-xs font-bold text-white mono tracking-tighter">${p.emergencyContact || 'Not Set'}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
        generateQR(p.id, `qr-canvas-${p.id}`);
    }

    function renderPatientRegistry() {
        const body = $('patients-list');
        if (!body) return;

        body.innerHTML = _patients.map(p => `
            <tr class="hover:bg-slate-800/30 transition-colors group">
                <td class="px-6 py-5 font-bold text-slate-500 text-[11px] mono">#ID-${p.id.substring(0,4)}</td>
                <td class="px-6 py-5">
                    <p class="text-sm font-black text-white group-hover:text-blue-400 transition-colors">${p.fullName}</p>
                </td>
                <td class="px-6 py-5">
                    <span class="bg-slate-900 border border-slate-700 text-blue-400 px-2 py-1 rounded-md text-[11px] font-black">${p.bloodGroup || '--'}</span>
                </td>
                <td class="px-6 py-5">
                    <div class="flex items-center gap-2">
                        <div class="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div class="bg-emerald-500 h-full" style="width: 100%"></div>
                        </div>
                        <span class="text-[9px] font-black text-emerald-500 uppercase">Operational</span>
                    </div>
                </td>
                <td class="px-6 py-5 text-right">
                    <button onclick="window.confirm('Delete this record?') && (window.Storage.deletePatient('${p.id}'), location.reload())" 
                            class="text-slate-500 hover:text-red-500 transition-colors px-3 py-1">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        if (window.lucide) lucide.createIcons();
    }

    async function renderActivityLog() {
        const container = $('activity-list');
        if (!container) return;

        const scans = await window.Storage.getScanHistory();
        if (scans.length === 0) return;

        container.innerHTML = scans.map(s => {
            const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="bg-slate-800/20 border-l-4 border-dispatch-blue rounded-r-2xl p-4 shadow-xl mb-3">
                    <div class="flex items-start gap-3">
                        <div class="bg-slate-900 p-2 rounded-xl mt-1">
                            <i data-lucide="scan" class="w-4 h-4 text-dispatch-blue"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between items-start mb-1">
                                <h4 class="text-[10px] font-black text-white uppercase tracking-widest leading-none">SYSTEM SCAN DETECTED</h4>
                                <span class="text-[9px] font-bold text-slate-500 italic">${time}</span>
                            </div>
                            <p class="text-xs font-bold text-slate-300">Identity: ${s.patient_name || 'Family Member'}</p>
                            <div class="flex items-center gap-1.5 mt-2 text-[9px] font-black text-emerald-500 uppercase tracking-tighter">
                                <i data-lucide="check" class="w-3 h-3"></i> Cloud Authenticated
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    // ─── Utilities ───
    async function generateQR(id, canvasId) {
        try {
            const url = `${window.location.protocol}//${window.location.host}/emergency.html?sid=${id}`;
            await QRCode.toCanvas($(canvasId), url, {
                width: 160,
                margin: 0,
                color: { dark: '#0F172A', light: '#FFFFFF' }
            });
        } catch (err) { console.error('[PersonalCommand] QR Gen Failure:', err); }
    }

    async function refreshScanCount() {
        const count = await window.Storage.getScanCount();
        txt('stat-scans', count || 0);
    }

    function setupGPS() {
        const stat = $('gps-status');
        if (!$('gps-stat-card')) return;
        
        $('gps-stat-card').addEventListener('click', () => {
            txt('stat-gps', 'SYNCING...');
            navigator.geolocation.getCurrentPosition(pos => {
                txt('stat-gps', `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`);
                console.log('[PersonalCommand] Tactical GPS Lock Acquired.');
            }, () => txt('stat-gps', 'LOCATION DENIED'));
        });
    }

    window.downloadQR = async function() {
        if (!_activePatient) return;
        
        const btn = document.querySelector('button[onclick="window.downloadQR()"]');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> Generating Graphic...';
        if (window.lucide) lucide.createIcons();
        
        await window.CardGenerator.generateBrandedQR(_activePatient);
        
        btn.innerHTML = origHtml;
        if (window.lucide) lucide.createIcons();
    };

    document.addEventListener('DOMContentLoaded', init);
})();
