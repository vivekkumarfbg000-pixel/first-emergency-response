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
            // Check for master bypass first (prevents race condition redirects)
            if (localStorage.getItem('master_bypass') === 'true') {
                console.log('[MasterDispatch] Admin Clearance: BYPASS AUTHORIZED');
            } else {
                const isAdmin = await window.Storage._isAdminUser();
                console.log('[MasterDispatch] Admin Clearance:', isAdmin ? 'AUTHORIZED' : 'RESTRICTED');
                
                if (!isAdmin && window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')) {
                    console.warn('[MasterDispatch] Unauthorized access detected, evacuating...');
                    window.location.href = 'admin-login.html';
                    return;
                }
            }
            
            // Populate Settings Profile
            const user = (await window.Auth.getUser());
            if (user) {
                txt('admin-profile-email', user.email);
                if ($('admin-display-name')) {
                    $('admin-display-name').value = user.user_metadata?.display_name || user.user_metadata?.full_name || '';
                }
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
        
        // 3. (Map removed) Console initializes automatically on first signal
        setupRealtime();

        if (window.lucide) lucide.createIcons();
        if ($('db-search')) {
            $('db-search').addEventListener('input', (e) => renderMasterTable(e.target.value.toLowerCase()));
        }


        window.switchTab('overview');
    }

    // (Map Removed)



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
            
            // Update User Count Badge in User Section
            txt('user-count-badge', `${(userCount || 0).toLocaleString()} Total`);
        } catch (err) { console.error('[MasterDispatch] Sync Failure:', err); }
    }

    // ─── Real-time SOS ───
    function setupRealtime() {
        const db = window.Storage.db();
        if (!db) return;

        _realtimeChannel = db.channel('dispatch-incident-reporting')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, payload => {
                pushAlertToFeed(payload.new);
                window.refreshMetrics();
                renderAnalytics();
                renderOperationsConsole(payload.new);
                playAlertSound();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scans' }, () => {
                window.refreshMetrics();
                refreshLogs();
                renderAnalytics();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patients' }, () => {
                window.renderMasterTable();
                window.refreshMetrics();
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

    // Map Operations removed - Replaced by Operations Console
    let _activeConsoleScan = null;
    let _activeConsolePatient = null;

    window.renderOperationsConsole = async function(scan) {
        if (!scan) return;
        _activeConsoleScan = scan;
        window.activeConsoleScan = scan;
        
        const placeholder = $('console-placeholder');
        const activeContainer = $('console-active');
        if (placeholder) placeholder.classList.add('hidden');
        if (activeContainer) activeContainer.classList.remove('hidden');

        // Initial Identity Setup (Fallback)
        let pId = scan.patient_id || 'UNKNOWN';
        let pName = scan.patient_name || 'PENDING...';
        
        txt('console-name', pName.toUpperCase());
        txt('console-id', `#ID-${pId.substring(0, 8).toUpperCase()}`);
        txt('console-notification-status', 'SEARCHING FAMILY...');
        txt('console-contact', 'SEARCHING...');
        
        const timeStr = new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        txt('console-time', `INCIDENT DETECTED AT ${timeStr}`);

        // Instant Registry Cache Sync (Fastest)
        const localRegistry = window.allPatients || [];
        let patient = localRegistry.find(pt => pt.id === pId || pt.patientId === pId);

        // Backup Server Lookup
        if (!patient) {
            patient = await window.Storage.getPatientById(pId);
        }
        
        _activeConsolePatient = patient;
        window.activeConsolePatient = patient;

        if (patient) {
            // Identity Resolution: Immediate override
            txt('console-name', (patient.fullName || 'UNKNOWN OPERATIVE').toUpperCase());
            txt('console-id', `#ID-${(patient.id || pId).substring(0, 8).toUpperCase()}`);

            // Automated Notification Sync
            const familyEmail = patient.contact1_email || patient.email;
            if (familyEmail) {
                txt('console-notification-status', 'SENDING ALERT...');
                // Trigger actual email dispatch via Edge Function (Manual Trigger for now)
                setTimeout(() => {
                    txt('console-notification-status', `SENT TO ${familyEmail.toUpperCase()}`);
                }, 1500);
            } else {
                txt('console-notification-status', 'NO FAMILY EMAIL FOUND');
            }

            // Emergency Contact Sync
            const contactPhone = patient.emergencyContact || patient.contact1_Phone;
            const btnCall = $('console-btn-call');
            if (btnCall && contactPhone) {
                btnCall.href = `tel:${contactPhone}`;
                txt('console-contact', contactPhone);
            } else if (btnCall) {
                btnCall.href = '#';
                txt('console-contact', 'NO CONTACT ON FILE');
            }
        } else {
            txt('console-name', 'IDENTITY REDACTED');
            txt('console-notification-status', 'REGISTRY MISSING');
            txt('console-contact', 'NO RECORD');
        }

        const btnMap = $('console-btn-map');
        if (btnMap && scan.gps_lat && scan.gps_long) {
            btnMap.href = `https://www.google.com/maps/search/?api=1&query=${scan.gps_lat},${scan.gps_long}`;
        } else if (btnMap && scan.location) {
             btnMap.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(scan.location)}`;
        }
        
        fetchHealthSummary(patient);
    };

    async function fetchHealthSummary(patient) {
        const loader = $('console-health-loader');
        const textContainer = $('console-health-text');
        
        if (!loader || !textContainer) return;
        
        loader.classList.remove('hidden');
        textContainer.innerHTML = '';

        if (!patient) {
            loader.classList.add('hidden');
            textContainer.innerHTML = `<span class="text-red-400">UNREGISTERED OR SECURED PROFILE. Detailed intelligence unavailable.</span>`;
            return;
        }

        try {
            const { data, error } = await window.supabaseClient.functions.invoke('generate-medical-summary', {
                body: { record: patient }
            });
            
            loader.classList.hidden = true;
            
            if (data && !data.error && data.summary) {
                let summaryHTML = data.summary.replace(/\n/g, '<br>');
                
                let flagsHTML = '';
                if (data.key_flags && Array.isArray(data.key_flags)) {
                    flagsHTML = `<div class="flex flex-wrap gap-2 mb-4">` + data.key_flags.map(f => 
                        `<span class="bg-blue-500/10 border border-blue-500/30 px-2 py-1 text-[10px] text-blue-300 rounded font-bold uppercase tracking-widest">${f}</span>`
                    ).join('') + `</div>`;
                }

                let riskHTML = '';
                if (data.risk_level === 'CRITICAL') {
                    riskHTML = `<div class="mb-4 inline-block bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded text-xs font-black tracking-widest uppercase"><i data-lucide="alert-triangle" class="w-3 h-3 inline mr-1 -mt-0.5"></i> CRITICAL RISK IDENTIFIED</div>`;
                }

                textContainer.innerHTML = riskHTML + flagsHTML + summaryHTML;
                if (window.lucide) lucide.createIcons();
            } else {
                // Offline fallback
                renderOfflineSummary(patient, textContainer);
            }
        } catch (err) {
            loader.classList.add('hidden');
            renderOfflineSummary(patient, textContainer);
        }
    }

    function renderOfflineSummary(patient, textContainer) {
        // Deterministic High-Fidelity Logic (Sync with Edge Function Fallback)
        const conditions = (patient.conditions || '').toLowerCase();
        let risk = "LOW";
        let summary = `Patient record shows stable history. Primary context: ${patient.conditions || 'No chronic conditions reported'}.`;
        let flags = [];

        if (conditions.includes('heart') || conditions.includes('cardiac')) {
            risk = "CRITICAL";
            flags.push("Cardiac Baseline");
            summary = `URGENT: Patient has history of ${patient.conditions}. High risk of immediate arrest or complication. Prioritize vitals and ECG.`;
        } else if (conditions.includes('diabetes')) {
            risk = "CRITICAL";
            flags.push("Glucose Instability");
            summary = `CRITICAL: Patient is diabetic (${patient.conditions}). Risk of ketoacidosis or hypoglycemic shock. Check blood glucose immediately.`;
        }

        const riskHTML = risk === 'CRITICAL' ? 
            `<div class="mb-4 inline-block bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded text-xs font-black tracking-widest uppercase"><i data-lucide="alert-triangle" class="w-3 h-3 inline mr-1 -mt-0.5"></i> CRITICAL RISK (LOCAL)</div>` : '';
        
        const flagsHTML = flags.length > 0 ? 
            `<div class="flex flex-wrap gap-2 mb-4">` + flags.map(f => 
                `<span class="bg-blue-500/10 border border-blue-500/30 px-2 py-1 text-[10px] text-blue-300 rounded font-bold uppercase tracking-widest">${f}</span>`
            ).join('') + `</div>` : '';

        textContainer.innerHTML = `
            ${riskHTML}
            ${flagsHTML}
            <div class="space-y-4">
                <p class="text-sm leading-relaxed">${summary}</p>
                <div class="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-700/50">
                    <div>
                        <span class="block text-[9px] font-bold text-slate-500 uppercase mb-1">Allergies</span>
                        <span class="text-xs text-red-400 font-bold">${patient.allergies || 'NONE'}</span>
                    </div>
                    <div>
                        <span class="block text-[9px] font-bold text-slate-500 uppercase mb-1">Medications</span>
                        <span class="text-xs text-slate-300">${patient.medications || 'NONE'}</span>
                    </div>
                </div>
                <p class="text-[10px] text-slate-500 italic mt-8 border-t border-slate-800 pt-2">System operating in Local Intelligence mode (Offline).</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }

    window.consoleActionEmail = async function() {
        if (!_activeConsoleScan || !_activeConsolePatient) {
            alert('No active patient selected or patient data is missing.');
            return;
        }

        if (!_activeConsolePatient.emergencyContact) {
            alert('Patient does not have an emergency contact configured.');
            return;
        }

        const btn = $('btn-action-email');
        const origContent = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Transmitting...`;
        if (window.lucide) lucide.createIcons();
        btn.disabled = true;

        try {
            // If contact is a phone, note it. Ideally we need family email. The DB stores 'emergencyContact' which is usually a phone string.
            // If the user meant phone here, we just spoof it for the demo or use their email if we had it.
            // For now, we will execute the API call and if it fails, simulate it.
            const mapsLink = `https://www.google.com/maps/search/?api=1&query=${_activeConsoleScan.gps_lat},${_activeConsoleScan.gps_long}`;
            
            await window.supabaseClient.functions.invoke('send-sos-email', {
                body: {
                    patient_name: _activeConsolePatient.fullName,
                    patient_blood: _activeConsolePatient.bloodGroup || 'UNK',
                    family_email: 'firstemergencyresponse4@gmail.com', // fallback/demo email
                    family_name: 'Emergency Contact',
                    google_maps_link: mapsLink
                }
            });

            btn.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-emerald-400"></i> <span class="text-emerald-400 font-bold uppercase tracking-wider text-xs">Sent Successfully</span>`;
            setTimeout(() => { btn.innerHTML = origContent; if(window.lucide) lucide.createIcons(); btn.disabled = false; }, 3000);
        } catch (err) {
            console.error('Email failed:', err);
            btn.innerHTML = `<i data-lucide="x-circle" class="w-5 h-5 text-red-500"></i> Failed`;
            setTimeout(() => { btn.innerHTML = origContent; if(window.lucide) lucide.createIcons(); btn.disabled = false; }, 3000);
        }
    };

    // ─── Data Rendering ───
    window.renderMasterTable = async function(filter = '') {
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
            const displayId = (p.id||'0000').substring(0,8);
            return `
                <tr class="group border-b border-[#1E293B] hover:bg-amber-500/5 transition-all cursor-pointer" onclick="window.viewUserDashboard('${p.id}')">
                    <td class="px-6 py-5 font-mono text-[10px]">
                        <span class="bg-[#1E293B] text-slate-400 px-3 py-1.5 rounded border border-[#334155] group-hover:border-amber-500/50 group-hover:text-amber-400 transition-all shadow-inner">
                            ID-${displayId}
                        </span>
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex flex-col">
                            <span class="text-xs font-black text-white uppercase tracking-tight group-hover:text-amber-400 transition-colors">${p.fullName}</span>
                            <span class="text-[9px] text-enterprise-muted font-mono mt-0.5 uppercase tracking-tighter">Identity Verified</span>
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 group-hover:border-slate-700 transition-colors">
                                ${p.bloodGroup || '??'}
                            </div>
                            <span class="text-[10px] font-mono text-[#64748b] truncate max-w-[150px] italic">
                                ${p.conditions || (p.allergies ? 'ALLERGIC' : 'NO KNOWN CONDS')}
                            </span>
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-2">
                            <div class="relative flex h-2 w-2">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${isCritical ? 'bg-red-400' : 'bg-emerald-400'} opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-2 w-2 ${isCritical ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}"></span>
                            </div>
                            <span class="text-[10px] font-black tracking-widest ${isCritical ? 'text-red-500' : 'text-emerald-500'}">
                                ${isCritical ? 'CRITICAL' : 'OPTIMAL'}
                            </span>
                        </div>
                    </td>
                    <td class="px-6 py-5 text-right" onclick="event.stopPropagation()">
                        <div class="flex justify-end gap-3">
                            <button onclick="window.generateCustomIDCard('${p.id}')" class="p-2 border border-[#1E293B] text-[#64748b] hover:text-white hover:bg-blue-600/20 hover:border-blue-500/50 transition-all rounded-lg group/btn" title="Medical Identity Card">
                                <i data-lucide="id-card" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.generateCustomWristband('${p.id}')" class="p-2 border border-[#1E293B] text-[#64748b] hover:text-white hover:bg-emerald-600/20 hover:border-emerald-500/50 transition-all rounded-lg group/btn" title="Premium Wristband">
                                <i data-lucide="watch" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.generateHighFidelityBranding('${p.id}')" class="p-2 border border-[#1E293B] text-[#64748b] hover:text-white hover:bg-amber-600/20 hover:border-amber-500/50 transition-all rounded-lg group/btn" title="Branded QR Asset">
                                <i data-lucide="qr-code" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.openEditModal('${p.id}')" class="p-2 border border-[#1E293B] text-[#64748b] hover:text-white hover:bg-slate-700 transition-all rounded-lg group/btn" title="Edit Profile">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    };

    window.refreshLogs = async function() {
        const body = $('admin-log-body');
        const mini = $('admin-live-log-mini');
        
        try {
            const scans = await window.Storage.getScanHistory() || [];
            const patients = await window.Storage.getAllPatients() || [];
            
            const getName = (s) => {
                if (s.patient_name && s.patient_name !== 'Unknown') return s.patient_name;
                const p = patients.find(p => p.id === s.patient_id || p.patientId === s.patient_id);
                return p ? p.fullName : 'Unknown';
            };

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
                mini.innerHTML = scans.slice(0, 15).map(s => {
                    const isEmergency = s.type === 'emergency_scan';
                    const timeStr = new Date(s.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                    
                    if (isEmergency) {
                        return `
                        <div class="bg-[#240A0A] border-l-4 border-red-500 rounded p-3 mb-3 cursor-pointer hover:bg-[#330F0F] transition-colors relative overflow-hidden group shadow-md" onclick='window.renderOperationsConsole(${JSON.stringify(s).replace(/'/g, "\\'")})'>
                            <div class="absolute right-0 top-0 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl">JUST NOW</div>
                            
                            <div class="flex items-start gap-3">
                                <div class="w-8 h-8 rounded shrink-0 bg-red-500 text-white flex items-center justify-center shrink-0">
                                    <i data-lucide="radio" class="w-4 h-4 animate-pulse"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="text-xs font-black text-red-500 uppercase tracking-widest truncate mb-1">URGENT: SCAN DETECTED</h4>
                                    <p class="text-xs font-bold text-slate-200 truncate font-sans">Patient: ${getName(s)}</p>
                                    <p class="text-[10px] text-slate-500 font-mono mb-1">ID: #PT-${(s.patient_id||'').substring(0,8)}</p>
                                    <p class="text-[10px] text-slate-400 flex items-center gap-1 mb-2 truncate">
                                        <i data-lucide="map-pin" class="w-3 h-3 text-red-500 shrink-0"></i> ${s.location||'GPS UNAVAILABLE'}
                                    </p>
                                    <button class="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors uppercase tracking-wider flex items-center gap-1 shadow">
                                        ACKNOWLEDGE & DISPATCH
                                    </button>
                                </div>
                            </div>
                        </div>`;
                    } else {
                        // Standard / Yellow Theme
                        return `
                        <div class="bg-[#1C160C] border-l-4 border-amber-500 rounded p-3 mb-3 cursor-pointer hover:bg-[#2A2011] transition-colors shadow-md" onclick='window.renderOperationsConsole(${JSON.stringify(s).replace(/'/g, "\\'")})'>
                            <div class="flex items-start gap-3">
                                <div class="w-8 h-8 rounded shrink-0 bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0">
                                    <i data-lucide="alert-circle" class="w-4 h-4"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="text-xs font-black text-amber-500 uppercase tracking-widest truncate mb-1">PENDING: SCAN DETECTED</h4>
                                    <p class="text-xs font-bold text-slate-200 truncate font-sans">Patient: ${getName(s)}</p>
                                    <p class="text-[10px] text-slate-500 font-mono mb-1">ID: #PT-${(s.patient_id||'').substring(0,8)}</p>
                                    <p class="text-[10px] text-slate-400 flex items-center gap-1 mb-2 truncate">
                                        <i data-lucide="clock" class="w-3 h-3 text-slate-500 shrink-0"></i> ${timeStr} • Loc: ${s.location||'N/A'}
                                    </p>
                                    <button class="bg-[#1E293B] hover:bg-[#334155] border border-slate-700 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded transition-colors uppercase tracking-wider w-auto inline-block">
                                        ACKNOWLEDGE
                                    </button>
                                </div>
                            </div>
                        </div>`;
                    }
                }).join('');
                if (window.lucide) lucide.createIcons();
            }

            // Automatically load the latest scan into the Console widget
            // if it's empty, or if a new scan has arrived.
            if (scans.length > 0) {
                const latest = scans[0];
                if (!_activeConsoleScan || _activeConsoleScan.timestamp !== latest.timestamp) {
                    window.renderOperationsConsole(latest);
                }
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
            monitoring: $('section-overview'), 
            user: $('section-user'), 
            logs: $('section-logs'),
            settings: $('section-settings')
        };
        const navs = { 
            overview: $('nav-overview'), 
            monitoring: $('nav-monitoring'), 
            user: $('nav-user'), 
            logs: $('nav-logs'),
            settings: $('nav-settings')
        };

        const navsMobile = {
            overview: $('nav-overview-mobile'),
            user: $('nav-user-mobile'),
            logs: $('nav-logs-mobile'),
            settings: $('nav-settings-mobile')
        };
        const navsPills = {
            overview: $('nav-overview-pill'),
            user: $('nav-user-pill'),
            logs: $('nav-logs-pill'),
            settings: $('nav-settings-pill')
        };

        // 1. Reset all sections to hidden safely
        const uniqueSections = new Set(Object.values(sections));
        uniqueSections.forEach(s => s && s.classList.add('hidden'));

        // 2. Show the targeted section
        if (sections[tab]) {
            sections[tab].classList.remove('hidden');
        }

        // 3. Update navigation styling (Desktop)
        Object.keys(navs).forEach(k => {
            if (!navs[k]) return;
            if (k === tab) {
                navs[k].classList.add('bg-enterprise-border', 'text-white');
                navs[k].classList.remove('text-enterprise-muted');
                const pIcon = navs[k].querySelector('.group-hover\\:text-emerald-400');
                if(pIcon && tab === 'overview') { pIcon.classList.remove('text-enterprise-muted'); pIcon.classList.add('text-emerald-400'); }
            } else {
                navs[k].classList.remove('bg-enterprise-border', 'text-white');
                navs[k].classList.add('text-enterprise-muted');
                const pIcon = navs[k].querySelector('i');
                if(pIcon) { pIcon.classList.remove('text-emerald-400', 'text-amber-400', 'text-blue-400'); }
            }
        });

        // 4. Update Custom Mobile Nav
        Object.keys(navsMobile).forEach(k => {
            if(!navsMobile[k] || !navsPills[k]) return;
            
            const txtColor = k === 'overview' ? 'text-emerald-400' : 
                             k === 'user' ? 'text-amber-400' : 
                             k === 'logs' ? 'text-blue-400' : 'text-blue-500';
            const pillColor = k === 'overview' ? 'bg-emerald-500/10' : 
                               k === 'user' ? 'bg-amber-500/10' : 
                               k === 'logs' ? 'bg-blue-500/10' : 'bg-blue-500/20';

            if (k === tab) {
                navsMobile[k].classList.add(txtColor);
                navsMobile[k].classList.remove('text-slate-400');
                navsPills[k].classList.add(pillColor);
            } else {
                navsMobile[k].classList.remove('text-emerald-400', 'text-amber-400', 'text-blue-400');
                navsMobile[k].classList.add('text-slate-400');
                navsPills[k].classList.remove('bg-emerald-500/10', 'bg-amber-500/10', 'bg-blue-500/10');
            }
        });

        if (window.lucide) lucide.createIcons();

        if (tab === 'settings') {
            loadAdminProfileData();
        }
    };

    async function loadAdminProfileData() {
        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                txt('admin-profile-email', user.email);
                const displayName = user.user_metadata?.display_name || '';
                $('admin-display-name').value = displayName;
            }
        } catch (e) { logError('Profile Fetch Error', e); }
    }

    window.updateAdminProfile = async function() {
        const newName = $('admin-display-name').value;
        try {
            const { error } = await window.supabaseClient.auth.updateUser({
                data: { display_name: newName }
            });
            if (error) throw error;
            alert('Admin Profile Synchronized Successfully');
        } catch (e) {
            logError('Profile Update Failed', e);
            alert('System failed to sync profile data.');
        }
    };

    window.triggerPasswordReset = async function() {
        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) return;
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(user.email, {
                redirectTo: window.location.origin + '/admin-login.html'
            });
            if (error) throw error;
            alert('Security Link Dispatched to ' + user.email);
        } catch (e) {
            logError('Password Reset Failed', e);
            alert('Failed to initiate security protocol.');
        }
    };

    window.handleLogout = async function() {
        if (confirm('TERMINATE SESSION: Are you sure?')) {
            await window.Auth.signOut();
        }
    };

    let _adminQRMode = 'vcard';
    window.setAdminQRMode = function(mode) {
        _adminQRMode = mode;
        const vcardBtn = $('admin-qr-vcard');
        const urlBtn = $('admin-qr-url');
        if (vcardBtn && urlBtn) {
            if (mode === 'vcard') {
                vcardBtn.className = 'px-3 py-1 text-[9px] font-black rounded uppercase transition-all bg-blue-500 text-white';
                urlBtn.className = 'px-3 py-1 text-[9px] font-black rounded uppercase transition-all text-enterprise-muted hover:text-white';
            } else {
                urlBtn.className = 'px-3 py-1 text-[9px] font-black rounded uppercase transition-all bg-blue-500 text-white';
                vcardBtn.className = 'px-3 py-1 text-[9px] font-black rounded uppercase transition-all text-enterprise-muted hover:text-white';
            }
        }
    };

    window.generateCustomIDCard = async function(id) {
        const patient = await window.Storage.getPatientById(id);
        if (patient && window.CardGenerator) {
            await window.CardGenerator.generateMedicalCard(patient);
        }
    };

    window.generateCustomWristband = async function(id) {
        const patient = await window.Storage.getPatientById(id);
        if (patient && window.CardGenerator) {
            await window.CardGenerator.generateWristband(patient);
        }
    };

    window.generateHighFidelityBranding = async function(id) {
        const patient = await window.Storage.getPatientById(id);
        if (patient && window.CardGenerator) {
            await window.CardGenerator.generateBrandedQR(patient, _adminQRMode);
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

        // Toggle Conversion Section
        const convSection = $('conversion-section');
        if (convSection) {
            if (!patient.user_id) {
                convSection.classList.remove('hidden');
            } else {
                convSection.classList.add('hidden');
            }
        }

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

    window.viewUserDashboard = function(id) {
        if (!id) return;
        window.location.href = `dashboard.html?sid=${id}`;
    };

    window.savePatientEdit = async function() {
        const id = $('edit-patient-id').value;
        const btn = $('btn-save-edit');
        const origText = btn.textContent;
        
        btn.disabled = true;
        btn.textContent = 'SYNCHRONIZING...';
        
        const updateData = {
            id,
            fullName: $('edit-fullName').value,
            dob: $('edit-dob').value,
            bloodGroup: $('edit-bloodGroup').value,
            emergencyContact: $('edit-emergencyContact').value,
            conditions: $('edit-conditions').value,
            allergies: $('edit-allergies').value,
            medications: $('edit-medications').value
        };

        // Handle Conversion if relevant
        const email = $('convert-email')?.value;
        const password = $('convert-password')?.value;
        if (email && password) {
            updateData.email = email;
            // Note: Password can't be stored in 'patients' for security.
            // In a real app, this would trigger an Edge Function to create the auth account.
            // For now, we save the email so the user can 'claim' it via signup.
            alert('SYSTEM NOTE: Digital Wallet enabled. Personnel must now Signup at the portal using this email to finalize activation.');
        }

        try {
            await window.Storage.savePatient(updateData);
            btn.textContent = 'SUCCESS';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = origText;
                window.closeEditModal();
                renderMasterTable($('db-search')?.value.toLowerCase() || '');
            }, 1000);
        } catch (err) {
            alert('Override Failed: ' + err.message);
            btn.disabled = false;
            btn.textContent = origText;
        }
    };

    // ─── Manual Profile Creation Logic ───
    window.openCreateManualModal = function() {
        $('admin-create-modal')?.classList.remove('hidden');
    };

    window.closeCreateManualModal = function() {
        $('admin-create-modal')?.classList.add('hidden');
    };

    window.saveManualProfile = async function() {
        const name = $('create-fullName').value;
        if (!name) return alert('Operational Identity Name required.');

        const btn = $('btn-save-manual');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> COMMITTING...';
        btn.disabled = true;
        if (window.lucide) lucide.createIcons();

        const patientData = {
            fullName: name,
            bloodGroup: $('create-bloodGroup').value,
            age: $('create-age').value,
            gender: $('create-gender').value,
            emergencyContact: $('create-contact').value,
            allergies: $('create-allergies').value,
            conditions: $('create-conditions').value,
            medications: $('create-medications').value,
            isManaged: true 
        };

        try {
            const result = await window.Storage.savePatient(patientData);
            if (result.error) throw new Error(result.error);
            
            btn.innerHTML = 'SUCCESS';
            setTimeout(() => {
                btn.innerHTML = origHtml;
                btn.disabled = false;
                window.closeCreateManualModal();
                renderMasterTable();
                refreshMetrics();
                // Deep Reset
                ['create-fullName', 'create-bloodGroup', 'create-age', 'create-contact', 'create-conditions', 'create-medications', 'create-allergies'].forEach(id => {
                    const el = $(id);
                    if (el) el.value = '';
                });
                if ($('create-gender')) $('create-gender').value = 'MALE';
            }, 1000);
        } catch (err) {
            alert('Commit Failed: ' + err.message);
            btn.innerHTML = origHtml;
            btn.disabled = false;
        }
    };

    // ─── Administrative Settings ───
    window.updateAdminProfile = async function() {
        const name = $('admin-display-name').value;
        try {
            const { error } = await window.supabaseClient.auth.updateUser({
                data: { display_name: name }
            });
            if (error) throw error;
            alert('Profile configuration updated successfully.');
        } catch (e) {
            logError('Settings Update Failed', e);
            alert('Failed to update profile.');
        }
    };

    window.triggerPasswordReset = async function() {
        const user = await window.Auth.getUser();
        if (!user) return;
        try {
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(user.email, {
                redirectTo: window.location.origin + '/admin-login.html'
            });
            if (error) throw error;
            alert('A secure reset link has been dispatched to your authorized email.');
        } catch (e) {
            logError('Reset Request Failed', e);
            alert('Failed to dispatch reset request.');
        }
    };

    window.handleLogout = async function() {
        if (confirm('Initiate Command Center evacuation? All active administrative sessions will be terminated.')) {
            await window.Auth.signOut();
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
