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
    let _errorLogs = [];

    // ─── Diagnostic HUD ───
    function logError(msg, err) {
        const errorMsg = `[Tactical Error] ${msg}: ${err?.message || err}`;
        console.error(errorMsg);
        _errorLogs.push(errorMsg);
        const hud = $('admin-debug-log');
        if (hud) {
            hud.innerHTML += `<div class="mb-1 text-red-100"># ${errorMsg}</div>`;
            hud.scrollTop = hud.scrollHeight;
        }
    }

    window.onerror = function(msg, url, line) {
        logError(`Runtime Error at ${line}`, msg);
        return false;
    };

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'd') {
            const hud = $('admin-debug-log');
            if (hud) hud.classList.toggle('hidden');
        }
    });

    // ─── Initialization ───
    async function init() {
        console.log('[MasterDispatch] v12.3 Stability Mode: Recovering HUD...');
        
        // 1. Dependency Waiter (Harden to wait for Supabase Cloud)
        let retries = 0;
        while ((!window.Storage || !window.Auth || !window.supabaseClient) && retries < 15) {
            console.log(`[MasterDispatch] Waiting for Tactical Cloud (${retries}/15)...`);
            await new Promise(r => setTimeout(r, 500));
            retries++;
        }

        if (!window.Storage || !window.Auth || !window.supabaseClient) {
            logError('Cloud Failure', 'Supabase Client failed to mobilize. Check network/CDN.');
            return;
        }

        try {
            const isAdmin = await window.Storage._isAdminUser();
            console.log('[MasterDispatch] Admin Clearance:', isAdmin ? 'AUTHORIZED' : 'RESTRICTED');
            if (!isAdmin && window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')) {
                window.location.href = 'login.html';
                return;
            }
        } catch (e) { logError('Clearance Protocol Error', e); }

        updateConnectionStatus('connected');
        
        try {
            await refreshMetrics();
            await renderMasterTable();
            await refreshLogs();
            await renderAnalytics();
            logError('INFO', 'Data loading phase complete.');
        } catch (e) {
            logError('Data Load Failure', e);
        }
        
        // 3. Initialize Tactical Map (Increase delay to ensure CSS hydration)
        setTimeout(() => {
            try {
                initMap();
            } catch (e) {
                console.error('[MasterDispatch] Map initialization deferred/failed:', e);
            }
        }, 1000);
        
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
        if (!container) { logError('UI Error', 'Map container missing'); return; }
        
        logError('INFO', `Map container size: ${container.offsetWidth}x${container.offsetHeight}`);
        
        // Ensure container has height
        if (container.offsetHeight === 0) {
            container.style.height = '400px';
            logError('WARNING', 'Zero-height map container detected. Forcing 400px.');
        }

        try {
            window.adminMap = L.map('admin-live-map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(window.adminMap);
            logError('INFO', 'Tactical Map Initialized.');
        } catch (err) {
            logError('Leaflet Crash', err);
            container.innerHTML = `<div class="h-full flex items-center justify-center text-slate-500 text-[10px] uppercase font-black tracking-widest gap-2 bg-slate-900/50">
                <i data-lucide="map-pin" class="w-4 h-4 text-red-500"></i> Local Grid Map Offline
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
            txt('metric-profiles-count', (userCount || 0).toLocaleString());

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
            html: `<div class="w-2.5 h-2.5 bg-red-500 rounded-full border border-[#0B1120] shadow-[0_0_0_2px_rgba(239,68,68,0.2)]"></div>`,
            iconSize: [10, 10], iconAnchor: [5, 5]
        });
        L.marker([alert.gps_lat, alert.gps_long], { icon }).addTo(window.adminMap).bindPopup(`<b>${alert.patient_name}</b>`).openPopup();
        window.adminMap.setView([alert.gps_lat, alert.gps_long], 15);
    }

    // ─── Data Rendering ───
    async function renderMasterTable(filter = '') {
        const body = $('admin-table-body');
        if (!body) return;

        const all = await window.Storage.getAllPatients() || [];
        const filtered = filter ? all.filter(p => p.fullName?.toLowerCase().includes(filter)) : all;
 
        if (filtered.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="py-20 text-center opacity-30 text-[10px] uppercase font-black tracking-[0.3em]">No Personnel Records Detected</td></tr>`;
            return;
        }

        body.innerHTML = filtered.map(p => {
            const isCritical = (p.conditions||'').toLowerCase().includes('heart') || (p.allergies||'').length > 5;
            return `
                <tr class="group border-b border-[#1E293B] hover:bg-[#0B1120] transition-colors">
                    <td class="px-4 py-3 font-mono text-[10px] text-[#64748b]">ID-${(p.id||'0000').substring(0,8)}</td>
                    <td class="px-4 py-3 text-xs text-white uppercase">${p.fullName}</td>
                    <td class="px-4 py-3">
                        <span class="text-xs font-mono text-[#64748b]">${p.bloodGroup || 'UNK'}</span>
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <span class="w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-red-500' : 'bg-emerald-500'}"></span>
                            <span class="text-[10px] font-mono ${isCritical ? 'text-red-500' : 'text-emerald-500'}">
                                ${isCritical ? 'CRIT' : 'OK'}
                            </span>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex justify-end gap-2">
                            <button onclick="window.generateAdminAssets('${p.id}')" class="text-[10px] font-mono border border-[#1E293B] text-[#64748b] px-2 py-1 hover:text-white hover:bg-[#1E293B] transition-colors">PRNT</button>
                            <button onclick="window.openEditModal('${p.id}')" class="text-[10px] font-mono border border-[#1E293B] text-[#64748b] px-2 py-1 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/50 transition-colors">EDIT</button>
                            <button onclick="window.deletePatientProfile('${p.id}')" class="text-[10px] font-mono border border-[#1E293B] text-[#64748b] px-2 py-1 hover:text-red-500 hover:border-red-500/50 transition-colors">DEL</button>
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
            const scans = await window.Storage.getScanHistory() || [];
            if (scans.length === 0) {
                if(mini) mini.innerHTML = `<div class="py-6 text-center opacity-20 text-[8px] uppercase font-black tracking-widest">Awaiting Scanner Signals...</div>`;
                return;
            }
 
            const html = scans.map(s => {
                const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isEmergency = s.type === 'emergency_scan';
                return `
                    <tr class="border-b border-[#1E293B] hover:bg-[#0B1120]">
                        <td class="px-4 py-3">${time}</td>
                        <td class="px-4 py-3">
                            <span class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full ${isEmergency?'bg-red-500':'bg-[#64748b]'}"></span>
                                ${isEmergency?'EMRG':'RTN'}
                            </span>
                        </td>
                        <td class="px-4 py-3">ID-${(s.patient_id||'').substring(0,8)}</td>
                        <td class="px-4 py-3 text-[#64748b]">${s.location||'UNKNOWN'}</td>
                    </tr>
                `;
            }).join('');
            if(body) body.innerHTML = html;

            if(mini) {
                mini.innerHTML = scans.slice(0, 5).map(s => `
                    <div class="p-2 border border-[#1E293B] bg-[#0B1120] border-l-2 ${s.type === 'emergency_scan' ? 'border-l-red-500' : 'border-l-[#1E293B]'} flex justify-between items-start mb-2">
                        <div class="flex flex-col gap-1">
                            <span class="text-[10px] text-[#64748b] uppercase font-mono">${s.type === 'emergency_scan' ? 'EMERGENCY' : 'STANDARD'}</span>
                            <span class="text-xs text-white font-mono">ID: ${(s.patient_id||'').substring(0,8)}</span>
                            <span class="text-[10px] text-[#64748b]">${s.location||'UNKNOWN'}</span>
                        </div>
                        <div class="flex flex-col items-end gap-2">
                            <span class="text-[10px] font-mono text-[#64748b]">${new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            <button class="text-[9px] border border-[#1E293B] text-[#64748b] px-2 py-0.5 hover:text-white hover:bg-[#1E293B] transition-colors">ACK</button>
                        </div>
                    </div>
                `).join('');
                if (window.lucide) lucide.createIcons();
            }
        } catch (e) { console.error('[MasterDispatch] Log Sync Failure:', e); }
    };

    async function renderAnalytics() {
        try {
            const patients = await window.Storage.getAllPatients() || [];
            const scans = await window.Storage.getScanHistory() || [];
 
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
                const seed = [15, 25, 10, 35, 45, 30, ((scans.length || 0) % 50) + 20];
                chart.innerHTML = seed.map(c => `
                    <div class="flex-1 rounded-t-sm transition-all duration-1000 ${c > 40 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-800'}" style="height: ${c}%"></div>
                `).join('');
            }
        } catch (e) { logError('Analytics Failed', e); }
    }

    window.switchTab = function(tab) {
        console.log('[MasterDispatch] Activating Sector:', tab);
        _activeSection = tab;
        const sections = { 
            overview: $('section-overview'), 
            monitoring: $('section-overview'), // Map stays visible
            registry: $('section-registry'), 
            logs: $('section-logs') 
        };
        const navs = { 
            overview: $('nav-overview'), 
            monitoring: $('nav-monitoring'), 
            registry: $('nav-registry'), 
            logs: $('nav-logs') 
        };

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

    window.openEditModal = async function(id) {
        const patient = await window.Storage.getPatientById(id);
        if(!patient) return;
        
        $('edit-patient-id').value = patient.id;
        $('edit-fullName').value = patient.fullName || '';
        $('edit-dob').value = patient.dob || '';
        $('edit-bloodGroup').value = patient.bloodGroup || '';
        $('edit-emergencyContact').value = patient.emergencyContact || '';
        $('edit-conditions').value = patient.conditions || '';
        $('edit-allergies').value = patient.allergies || '';
        $('edit-medications').value = patient.medications || '';
        
        const modal = $('admin-edit-modal');
        if(modal) modal.classList.remove('hidden');

        // Groq AI Profile Intelligence Fetch
        const aiWrapper = $('ai-profile-insights');
        if(aiWrapper) {
            aiWrapper.classList.remove('hidden');
            $('ai-modal-loading').classList.remove('hidden');
            $('ai-modal-content').classList.add('hidden');
            $('ai-modal-risk').classList.add('hidden');
            $('ai-modal-flags').innerHTML = '';
            
            try {
                const { data, error } = await window.supabaseClient.functions.invoke('generate-medical-summary', {
                    body: { record: patient }
                });
                
                $('ai-modal-loading').classList.add('hidden');
                
                if (data && !data.error && data.summary) {
                    $('ai-modal-content').classList.remove('hidden');
                    $('ai-modal-summary').innerHTML = data.summary.replace(/\n/g, '<br>');
                    
                    if (data.risk_level) {
                        const riskEl = $('ai-modal-risk');
                        riskEl.textContent = data.risk_level + " RISK";
                        riskEl.classList.remove('hidden');
                        
                        // Theme Strip
                        const strip = $('ai-modal-strip');
                        
                        if (data.risk_level === 'CRITICAL') {
                            riskEl.className = 'ml-auto text-[9px] px-2 py-0.5 font-mono border border-red-500 text-red-500 bg-red-500/10 rounded tracking-widest';
                            strip.className = 'absolute left-0 top-0 bottom-0 w-1 bg-red-500 shadow-[0_0_10px_#ef4444]';
                            aiWrapper.className = 'bg-red-500/5 border border-red-500/30 p-4 shadow-[0_0_15px_rgba(239,68,68,0.1)] relative overflow-hidden mb-4';
                        } else {
                            // Moderate or Low
                            riskEl.className = 'ml-auto text-[9px] px-2 py-0.5 font-mono border border-blue-500 text-blue-500 bg-blue-500/10 rounded tracking-widest';
                            strip.className = 'absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_#3b82f6]';
                            aiWrapper.className = 'bg-[#0B1120] border border-blue-500/30 p-4 shadow-[0_0_10px_rgba(59,130,246,0.05)] relative overflow-hidden mb-4';
                        }
                    }

                    if (data.key_flags && Array.isArray(data.key_flags)) {
                        $('ai-modal-flags').innerHTML = data.key_flags.map(f => 
                            `<span class="bg-white/5 border border-white/10 px-2 py-1 text-[9px] text-white rounded font-mono uppercase tracking-widest">${f}</span>`
                        ).join('');
                    }
                } else if (data?.error || error) {
                     // Offline or missing key
                     $('ai-modal-loading').classList.add('hidden');
                     $('ai-modal-content').classList.remove('hidden');
                     $('ai-modal-summary').innerHTML = `<span class="text-slate-500 italic">Groq Intelligence Engine Offline. Verify API Keys in Supabase interface.</span>`;
                }
            } catch (err) {
                // Network fail
                $('ai-modal-loading').classList.add('hidden');
                $('ai-modal-content').classList.remove('hidden');
                $('ai-modal-summary').innerHTML = `<span class="text-slate-500 italic">Network disconnected. AI services suspended.</span>`;
            }
        }
    };

    window.closeEditModal = function() {
        const modal = $('admin-edit-modal');
        if(modal) modal.classList.add('hidden');
    };

    window.savePatientEdit = async function() {
        const id = $('edit-patient-id').value;
        if(!id) return;
        
        const updates = {
            fullName: $('edit-fullName').value,
            dob: $('edit-dob').value,
            bloodGroup: $('edit-bloodGroup').value,
            emergencyContact: $('edit-emergencyContact').value,
            conditions: $('edit-conditions').value,
            allergies: $('edit-allergies').value,
            medications: $('edit-medications').value,
            updatedAt: new Date().toISOString()
        };
        
        const db = window.Storage.db();
        if(db) {
            try {
                const { error } = await db.from('patients').update(updates).eq('id', id);
                if(error) throw error;
                window.closeEditModal();
                await renderMasterTable();
                await renderAnalytics();
            } catch(e) {
                logError('Edit Save Failed', e);
                alert('Failed to save profile changes. Check console for details.');
            }
        }
    };

    // ─── Entry Point Stabilization ───
    function bootstrap() {
        console.log('[MasterDispatch] Initializing Stability Mode v12.4...');
        init().then(() => {
            console.log('[MasterDispatch] System Ready. All tactical features functional.');
        }).catch(err => {
            logError('Boot Failure', err);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

})();
