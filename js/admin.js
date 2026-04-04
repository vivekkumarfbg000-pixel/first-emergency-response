/* ============================================================
   admin.js — v11-pro Master Dispatch Dispatch Hub
   Features: Multi-Screen Mobile Navigation, SOS Notification Pulse,
             Real-time Map Integration & Global Registry Triage.
   ============================================================ */

(function () {
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    let _activeSection = 'monitoring';
    let _realtimeChannel = null;

    // ─── Initialization ───
    async function init() {
        console.log('[MasterDispatch] v11-pro Operational Console Active...');
        
        // 1. Auth Guard (Strict firstemergencyresponse@gmail.com)
        const isAdmin = await window.Storage._isAdminUser();
        if (!isAdmin && window.location.hostname !== 'localhost') {
            console.error('[MasterDispatch] Unauthorized Access Attempt.');
            window.location.href = 'login.html';
            return;
        }

        // Update real-time connection status UI
        updateConnectionStatus('connecting');

        // 2. Initial Data Pull
        await refreshMetrics();
        await renderMasterTable();
        await refreshLogs();
        
        // 3. Setup Real-time SOS Engine
        setupRealtime();

        // 4. Global UI Init
        if (window.lucide) lucide.createIcons();
        if ($('db-search')) {
            $('db-search').addEventListener('input', (e) => renderMasterTable(e.target.value.toLowerCase()));
        }

        // Support global UI listeners if needed
        window.currentSection = 'monitoring';
        setInterval(updateServerTime, 1000);
    }

    function updateServerTime() {
        const el = $('admin-time');
        if (el) el.textContent = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }

    function updateConnectionStatus(status) {
        const ind = $('connection-indicator');
        const txt = $('connection-status');
        if (!ind || !txt) return;

        if (status === 'connected') {
            ind.className = 'w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]';
            txt.textContent = 'Operational';
            txt.className = 'text-[9px] font-black tracking-widest text-emerald-400 uppercase';
        } else if (status === 'connecting') {
            ind.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
            txt.textContent = 'Syncing...';
            txt.className = 'text-[9px] font-black tracking-widest text-amber-400 uppercase';
        } else {
            ind.className = 'w-2 h-2 rounded-full bg-red-500 animate-ping';
            txt.textContent = 'Offline';
            txt.className = 'text-[9px] font-black tracking-widest text-red-500 uppercase';
        }
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

    // ─── Real-time SOS Alerting ───
    function setupRealtime() {
        const db = window.Storage.db();
        if (!db) {
            updateConnectionStatus('error');
            return;
        }

        _realtimeChannel = db.channel('dispatch-incident-reporting')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, payload => {
                console.log('[MasterDispatch] INCIDENT REPORTED:', payload.new);
                pushAlertToFeed(payload.new);
                refreshMetrics();
                refreshLogs();
                dropMapMarker(payload.new);
                playAlertSound();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scans' }, () => {
                refreshMetrics();
                refreshLogs();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patients' }, () => {
                renderMasterTable();
                refreshMetrics();
            })
            .subscribe((status) => {
                console.log('[MasterDispatch] Real-time Status:', status);
                if (status === 'SUBSCRIBED') updateConnectionStatus('connected');
                else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') updateConnectionStatus('error');
            });
    }

    function playAlertSound() {
        // Simple synth beep for emergency
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
        } catch (e) {}
    }

    function pushAlertToFeed(alert) {
        const container = $('admin-alert-feed');
        if (!container) return;

        if (container.innerHTML.includes('Monitoring')) container.innerHTML = '';

        const card = document.createElement('div');
        card.id = `sos-${alert.id}`;
        card.className = `bg-red-500/10 border-l-4 border-red-500 rounded-r-2xl p-4 shadow-xl relative transition-all duration-300 animate-slide-in`;
        
        card.innerHTML = `
            <div class="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-bl-lg tracking-widest uppercase italic">JUST NOW</div>
            <div class="flex items-start gap-3">
                <div class="bg-red-500 p-2 rounded-xl mt-1">
                    <i data-lucide="radio" class="w-4 h-4 text-white animate-pulse"></i>
                </div>
                <div class="flex-1">
                    <h3 class="text-red-500 font-bold text-[11px] mb-1.5 uppercase tracking-widest">URGENT: SCAN DETECTED</h3>
                    <p class="text-[14px] text-white font-bold mb-1 italic">Patient: ${alert.patient_name || 'Rahul Sharma'}</p>
                    <p class="text-[10px] text-slate-400 font-bold mb-3 tracking-tighter uppercase leading-none">ID: #PT-${(alert.patient_id || '8842').substring(0, 4)}</p>
                    <div class="flex items-center gap-2 text-[10px] font-black text-emerald-400 mb-4 bg-emerald-500/5 px-2.5 py-1.5 rounded-lg border border-emerald-500/10 w-fit">
                        <i data-lucide="mail-check" class="w-3.5 h-3.5"></i> Auto-Email Sent
                    </div>
                    <div class="flex gap-2">
                        <button onclick="acknowledgeAlert('${alert.id}')" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black py-2.5 rounded-xl transition-all shadow-lg active:scale-95">Acknowledge</button>
                        <a href="emergency.html?sid=${alert.patient_id}" target="_blank" class="bg-slate-800 hover:bg-slate-700 p-2.5 rounded-xl border border-slate-700/50 flex flex-col justify-center">
                            <i data-lucide="external-link" class="w-4 h-4 text-white"></i>
                        </a>
                    </div>
                </div>
            </div>
        `;

        container.prepend(card);
        if (window.lucide) lucide.createIcons();
    }

    // ─── Global Registry (AS PER IMAGE 4) ───
    async function renderMasterTable(filter = '') {
        const body = $('admin-table-body');
        if (!body) return;

        const all = await window.Storage.getAllPatients();
        const filtered = filter ? all.filter(p => p.fullName.toLowerCase().includes(filter)) : all;

        if (filtered.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-20 text-center">
                        <div class="flex flex-col items-center justify-center opacity-40">
                            <i data-lucide="database-zap" class="w-10 h-10 mb-4 text-slate-500"></i>
                            <p class="text-xs font-black uppercase tracking-[0.2em] text-slate-500">No Patient Records Synchronized</p>
                            <p class="text-[10px] font-bold text-slate-600 mt-2 uppercase tracking-tighter italic">Register profiles at Sehat Point Home to populate registry</p>
                        </div>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        body.innerHTML = filtered.map(p => {
            const isCritical = p.conditions?.toLowerCase().includes('allergy') || p.conditions?.toLowerCase().includes('heart');
            const truncId = (p.id || p.patientId || '').substring(0, 4);

            return `
                <tr class="tactical-row transition-colors group border-b border-white/5">
                    <td class="px-6 py-5 font-bold text-slate-500 text-[11px] leading-tight italic border-none">#ID-<br>${truncId}</td>
                    <td class="px-6 py-5">
                        <p class="text-[14px] font-black text-white group-hover:text-blue-400 transition-colors">${p.fullName}</p>
                    </td>
                    <td class="px-6 py-5">
                        <div class="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 flex items-center justify-center w-fit">
                           <span class="text-blue-400 font-bold text-[12px]">${p.bloodGroup || 'O-'}</span>
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-2">
                            ${isCritical ? `
                                <i data-lucide="alert-octagon" class="w-4 h-4 text-red-500"></i>
                                <span class="text-red-500 font-bold text-[10px] uppercase tracking-tighter">Critical Risk</span>
                            ` : `
                                <span class="text-emerald-500 font-bold text-[10px] uppercase tracking-tighter">Standard</span>
                            `}
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex items-center justify-end gap-4">
                            <button onclick="window.generateAdminAssets('${p.id || p.patientId}')" class="text-emerald-500 hover:text-emerald-400 font-black text-[11px] uppercase tracking-widest transition-colors flex items-center gap-1" title="Generate Physical ID and Wristband">
                                <i data-lucide="printer" class="w-3 h-3"></i> Assets
                            </button>
                            <a href="emergency.html?sid=${p.id || p.patientId}" target="_blank" 
                               class="text-blue-500 hover:text-blue-400 font-black text-[11px] uppercase tracking-widest transition-colors">
                               View
                            </a>
                            <a href="register.html?edit=${p.id || p.patientId}" target="_blank" 
                               class="text-amber-500 hover:text-amber-400 font-black text-[11px] uppercase tracking-widest transition-colors">
                               Edit
                            </a>
                            <button onclick="window.deletePatientProfile('${p.id || p.patientId}')" class="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors border border-transparent hover:border-red-500/20" title="Delete Profile globally">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    window.acknowledgeAlert = function(id) {
        const el = $(`sos-${id}`);
        console.log(el);
        if (el) {
            el.className = "bg-slate-800/40 border-l-4 border-slate-600 rounded-r-2xl p-4 opacity-60 transition-all duration-500 shadow-xl";
            el.innerHTML = `
                <div class="flex items-start gap-4">
                    <div class="bg-slate-700 p-2 rounded-xl mt-1"><i data-lucide="check" class="w-4 h-4 text-white"></i></div>
                    <div>
                        <h3 class="text-slate-400 font-black text-[11px] uppercase tracking-widest leading-none">RESOLVED</h3>
                        <p class="text-xs font-bold text-slate-300 mt-2 italic shadow-sm">Audit: Handled by Master Admin</p>
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.deletePatientProfile = async function(id) {
        if(confirm('CRITICAL ACTION: Are you sure you want to permanently delete this patient record? This cannot be undone.')) {
            await window.Storage.deletePatient(id);
            renderMasterTable();
            refreshMetrics();
        }
    };

    window.generateAdminAssets = async function(id) {
        const patient = await window.Storage.getPatientById(id);
        if (!patient) {
            alert('Patient not found in local cache. Try refreshing.');
            return;
        }
        
        // Use the newly overhauled HTML5 generator
        await window.CardGenerator.generateMedicalCard(patient);
        
        // Stagger to prevent browser from blocking multiple rapid downloads
        setTimeout(async () => {
            await window.CardGenerator.generateWristband(patient);
        }, 1000);
    };

    function dropMapMarker(alert) {
        if (!window.adminMap || !alert.gps_lat) return;
        const icon = L.divIcon({
            className: 'custom-icon',
            html: `<div class="relative"><div class="emergency-pulse-ring absolute"></div><div class="emergency-core"></div></div>`,
            iconSize: [60, 60], iconAnchor: [30, 30]
        });
        L.marker([alert.gps_lat, alert.gps_long], { icon }).addTo(window.adminMap).bindPopup(`<b>${alert.patient_name}</b>`).openPopup();
        window.adminMap.setView([alert.gps_lat, alert.gps_long], 15);
    }

    window.refreshLogs = async function() {
        const body = $('admin-log-body');
        if (!body) return;

        try {
            const scans = await window.Storage.getScanHistory();
            if (!scans || scans.length === 0) {
                body.innerHTML = '<tr><td colspan="4" class="px-8 py-10 text-center text-slate-600 font-bold uppercase text-[10px] tracking-widest italic opacity-40">No activity recorded yet</td></tr>';
                return;
            }

            body.innerHTML = scans.map(s => {
                const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const date = new Date(s.timestamp).toLocaleDateString();
                const isEmergency = s.type === 'emergency_scan';
                
                return `
                    <tr class="border-b border-white/5 tactical-row transition-all">
                        <td class="px-8 py-4">
                            <div class="text-[11px] font-black text-slate-300 italic">${time}</div>
                            <div class="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">${date}</div>
                        </td>
                        <td class="px-8 py-4">
                            <div class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full ${isEmergency ? 'bg-red-500 animate-pulse' : 'bg-blue-400'}"></span>
                                <span class="text-[10px] font-black uppercase tracking-widest ${isEmergency ? 'text-red-400' : 'text-blue-300'}">
                                    ${s.type.replace('_', ' ')}
                                </span>
                            </div>
                        </td>
                        <td class="px-8 py-4">
                             <div class="text-[11px] font-black text-white italic">#PT-${(s.patient_id || '----').substring(0,6)}</div>
                             <div class="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">${s.device || 'Unknwon Device'}</div>
                        </td>
                        <td class="px-8 py-4">
                            <div class="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                                <i data-lucide="map-pin" class="w-3 h-3 text-slate-500"></i>
                                ${s.location || 'Unknown'}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('[MasterDispatch] Log Sync Failure:', e);
        }
    };

    window.switchTab = function(tab) {
        _activeSection = tab;
        
        // UI Sections
        const sections = {
            'monitoring': $('section-operations'),
            'registry': $('section-registry'),
            'logs': $('section-logs')
        };
        
        // Tab Buttons
        const tabs = {
            'monitoring': $('tab-monitoring'),
            'registry': $('tab-registry'),
            'logs': $('tab-logs')
        };

        Object.keys(sections).forEach(key => {
            const s = sections[key];
            const t = tabs[key];
            if (!s || !t) return;

            if (key === tab) {
                s.classList.remove('hidden');
                t.classList.add('active', 'border-blue-500', 'text-blue-400');
                t.classList.remove('border-transparent', 'text-slate-500');
            } else {
                s.classList.add('hidden');
                t.classList.remove('active', 'border-blue-500', 'text-blue-400');
                t.classList.add('border-transparent', 'text-slate-500');
            }
        });

        if (tab === 'monitoring' && window.adminMap) {
            setTimeout(() => window.adminMap.invalidateSize(), 100);
        }
        if (window.lucide) lucide.createIcons();
    };

    document.addEventListener('DOMContentLoaded', init);

})();
