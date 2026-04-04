/* ============================================================
   admin.js — v12.0 Tactical Dispatch Control
   Features: Bento Grid Overview, Real-time Triage, 
             Signal Velocity Analytics, and Hero Map Ops.
   ============================================================ */

(function () {
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    let _activeSection = 'overview';
    let _realtimeChannel = null;

    // ─── Initialization ───
    async function init() {
        console.log('[MasterDispatch] v12.0 Tactical Console Active...');
        
        const isAdmin = await window.Storage._isAdminUser();
        if (!isAdmin && window.location.hostname !== 'localhost') {
            window.location.href = 'login.html';
            return;
        }

        updateConnectionStatus('connected');
        
        try {
            await refreshMetrics();
            await renderMasterTable();
            await refreshLogs();
            await renderAnalytics();
        } catch (e) {
            console.error('[MasterDispatch] Data Load Failure:', e);
        }
        
        // 3. Initialize Tactical Map (Wrapped in Safety)
        try {
            initMap();
        } catch (e) {
            console.error('[MasterDispatch] Map Initialization Failure:', e);
        }
        
        setupRealtime();

        if (window.lucide) lucide.createIcons();
        if ($('db-search')) {
            $('db-search').addEventListener('input', (e) => renderMasterTable(e.target.value.toLowerCase()));
        }

        setInterval(updateServerTime, 1000);
        window.switchTab('overview');
    }

    function initMap() {
        const container = $('admin-live-map');
        if (!container) return;
        
        // Ensure container has height
        if (container.offsetHeight === 0) {
            container.style.height = '400px';
        }

        try {
            window.adminMap = L.map('admin-live-map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(window.adminMap);
            console.log('[MasterDispatch] Tactical Map Synchronized.');
        } catch (err) {
            console.error('[MasterDispatch] Leaflet Init Error:', err);
            container.innerHTML = `<div class="h-full flex items-center justify-center text-slate-500 text-[10px] uppercase font-black tracking-widest gap-2 bg-slate-900/50">
                <i data-lucide="map-pin" class="w-4 h-4 text-red-500"></i> Local Grid Map Offline (Check Internet)
            </div>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    function updateServerTime() {
        const el = $('admin-time');
        if (el) el.textContent = new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    function updateConnectionStatus(status) {
        const txtEl = $('connection-status');
        if (!txtEl) return;
        txtEl.textContent = status === 'connected' ? 'Operational Sync' : 'Signal Lost';
        txtEl.className = status === 'connected' ? 'text-[9px] font-black text-emerald-500 uppercase tracking-widest' : 'text-[9px] font-black text-red-500 uppercase tracking-widest';
    }

    // ─── Metrics ───
    async function refreshMetrics() {
        const db = window.Storage.db();
        if (!db) return;
        try {
            const { count: userCount } = await db.from('patients').select('*', { count: 'exact', head: true });
            txt('metric-users', (userCount || 0).toLocaleString());

            const today = new Date().toISOString().split('T')[0];
            const { count: scanCount } = await db.from('scans').select('*', { count: 'exact', head: true }).gte('timestamp', today);
            txt('metric-scans', (scanCount || 0).toLocaleString());
        } catch (err) { console.error('[MasterDispatch] Sync Failure:', err); }
    }

    // ─── Real-time SOS ───
    function setupRealtime() {
        const db = window.Storage.db();
        if (!db) return;

        _realtimeChannel = db.channel('dispatch-incident-reporting')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, payload => {
                pushAlertToFeed(payload.new);
                refreshMetrics();
                renderAnalytics();
                dropMapMarker(payload.new);
                playAlertSound();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scans' }, () => {
                refreshMetrics();
                refreshLogs();
                renderAnalytics();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patients' }, () => {
                renderMasterTable();
                refreshMetrics();
                renderAnalytics();
            })
            .subscribe();
    }

    function playAlertSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.start(); osc.stop(audioCtx.currentTime + 0.5);
        } catch (e) {}
    }

    function pushAlertToFeed(alert) {
        // Redundant with Mini Log but kept for specific SOS focus if needed
        console.log('[MasterDispatch] SOS RECEIVED', alert);
        refreshLogs();
    }

    // ─── Map Operations ───
    function dropMapMarker(alert) {
        if (!window.adminMap || !alert.gps_lat) return;
        const icon = L.divIcon({
            className: 'custom-icon',
            html: `<div class="relative"><div class="emergency-pulse absolute w-10 h-10 bg-red-500/20 rounded-full"></div><div class="w-3 h-3 bg-red-500 rounded-full border border-white"></div></div>`,
            iconSize: [40, 40], iconAnchor: [20, 20]
        });
        L.marker([alert.gps_lat, alert.gps_long], { icon }).addTo(window.adminMap).bindPopup(`<b>${alert.patient_name}</b>`).openPopup();
        window.adminMap.setView([alert.gps_lat, alert.gps_long], 15);
    }

    // ─── Data Rendering ───
    async function renderMasterTable(filter = '') {
        const body = $('admin-table-body');
        if (!body) return;

        const all = await window.Storage.getAllPatients();
        const filtered = filter ? all.filter(p => p.fullName.toLowerCase().includes(filter)) : all;

        body.innerHTML = filtered.map(p => {
            const isCritical = (p.conditions||'').toLowerCase().includes('heart') || (p.allergies||'').length > 5;
            return `
                <tr class="group border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td class="px-8 py-5 font-mono text-[10px] text-slate-500 uppercase">#PT-${(p.id||'----').substring(0,6)}</td>
                    <td class="px-8 py-5 text-[14px] font-black text-white italic capitalize">${p.fullName}</td>
                    <td class="px-8 py-5">
                        <span class="text-blue-400 font-black text-xs bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">${p.bloodGroup || 'O-'}</span>
                    </td>
                    <td class="px-8 py-5">
                        <span class="text-[10px] font-black uppercase tracking-tighter ${isCritical?'text-red-500':'text-emerald-500'}">
                            ${isCritical?'Critical Case':'Stable Identity'}
                        </span>
                    </td>
                    <td class="px-8 py-5 text-right">
                        <div class="flex justify-end gap-3">
                            <button onclick="window.generateAdminAssets('${p.id}')" class="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 transition-all hover:text-white border border-emerald-500/20"><i data-lucide="printer" class="w-4 h-4"></i></button>
                            <button onclick="window.deletePatientProfile('${p.id}')" class="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 transition-all hover:text-white border border-red-500/20"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    window.refreshLogs = async function() {
        const body = $('admin-log-body');
        const mini = $('admin-live-log-mini');
        
        try {
            const scans = await window.Storage.getScanHistory();
            if (!scans || scans.length === 0) return;

            const html = scans.map(s => {
                const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isEmergency = s.type === 'emergency_scan';
                return `
                    <tr class="border-b border-white/5 hover:bg-white/[0.01]">
                        <td class="px-8 py-4 text-[11px] font-black text-slate-400">${time}</td>
                        <td class="px-8 py-4"><span class="text-[10px] font-black uppercase ${isEmergency?'text-red-500':'text-blue-500'}">${s.type}</span></td>
                        <td class="px-8 py-4 text-[11px] font-black text-white italic">#PT-${(s.patient_id||'').substring(0,6)}</td>
                        <td class="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase">${s.location||'Sector 7'}</td>
                    </tr>
                `;
            }).join('');
            if(body) body.innerHTML = html;

            if(mini) {
                mini.innerHTML = scans.slice(0, 5).map(s => `
                    <div class="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                        <div class="flex items-center gap-3">
                            <i data-lucide="${s.type==='emergency_scan'?'alert-octagon':'activity'}" class="w-4 h-4 ${s.type==='emergency_scan'?'text-red-500':'text-blue-500'}"></i>
                            <div>
                                <p class="text-[11px] font-black text-white italic uppercase tracking-tighter">Identity Scanned: #PT-${(s.patient_id||'').substring(0,4)}</p>
                                <p class="text-[9px] font-bold text-slate-600 uppercase">${s.location||'Unknown Geo-Grid'}</p>
                            </div>
                        </div>
                        <span class="text-[9px] font-black text-slate-600 italic whitespace-nowrap">${new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                `).join('');
                if (window.lucide) lucide.createIcons();
            }
        } catch (e) { console.error('[MasterDispatch] Log Sync Failure:', e); }
    };

    async function renderAnalytics() {
        const patients = await window.Storage.getAllPatients();
        const scans = await window.Storage.getScanHistory();

        const critical = patients.filter(p => (p.conditions||'').toLowerCase().includes('heart') || (p.allergies||'').length > 5).length;
        const regular = patients.length - critical;
        
        const triageList = $('admin-triage-list');
        if (triageList && patients.length > 0) {
            triageList.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3"><span class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></span><span class="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Stable Entities</span></div>
                    <span class="text-[11px] font-black text-white">${Math.round((regular/patients.length)*100)}%</span>
                </div>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3"><span class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]"></span><span class="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Critical Risk</span></div>
                    <span class="text-[11px] font-black text-white">${Math.round((critical/patients.length)*100)}%</span>
                </div>
            `;
        }

        const chart = $('chart-velocity');
        if (chart) {
            const seed = [15, 25, 10, 35, 45, 30, (scans.length % 50) + 20];
            chart.innerHTML = seed.map(c => `
                <div class="flex-1 rounded-t-sm transition-all duration-1000 ${c > 40 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-800'}" style="height: ${c}%"></div>
            `).join('');
        }
    }

    window.switchTab = function(tab) {
        _activeSection = tab;
        const sections = { overview: $('section-overview'), monitoring: $('section-overview'), registry: $('section-registry'), logs: $('section-logs') };
        const navs = { overview: $('nav-overview'), monitoring: $('nav-monitoring'), registry: $('nav-registry'), logs: $('nav-logs') };

        Object.keys(sections).forEach(k => {
            if(!sections[k] || !navs[k]) return;
            if(k === tab) {
                sections[k].classList.remove('hidden');
                navs[k].classList.add('bg-dispatch-blue', 'text-white', 'shadow-lg', 'active-tab');
                navs[k].classList.remove('text-slate-500');
            } else {
                sections[k].classList.add('hidden');
                navs[k].classList.remove('bg-dispatch-blue', 'text-white', 'shadow-lg', 'active-tab');
                navs[k].classList.add('text-slate-500');
            }
        });

        if (tab === 'overview' && window.adminMap) {
            setTimeout(() => window.adminMap.invalidateSize(), 200);
        }
        if (window.lucide) lucide.createIcons();
    };

    window.generateAdminAssets = async function(id) {
        const patient = await window.Storage.getPatientById(id);
        if (patient && window.CardGenerator) {
            await window.CardGenerator.generateMedicalCard(patient);
            setTimeout(() => window.CardGenerator.generateWristband(patient), 1000);
        }
    };

    window.deletePatientProfile = async function(id) {
        if(confirm('TERMINATE RECORD: Are you sure?')) {
            await window.Storage.deletePatient(id);
            renderMasterTable(); refreshMetrics(); renderAnalytics();
        }
    };

    document.addEventListener('DOMContentLoaded', init);

})();
