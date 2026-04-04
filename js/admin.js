/* ============================================================
   admin.js — v6-pro Command Center Dispatch Engine
   Features: Real-time Alerting, Global Clinical Registry,
             Live Metrics Tracking, and Triage Workflow.
   ============================================================ */

(function () {
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    let _cachedPatients = [];
    let _realtimeChannel = null;

    // ─── Initialization ───
    async function init() {
        console.log('[CommandCenter] Initializing Tactical Dispatch Console...');
        
        // 1. Auth Check (Clinical Personnel only)
        const isAdmin = await window.Storage._isAdminUser();
        if (!isAdmin && window.location.hostname !== 'localhost') {
            console.warn('[CommandCenter] Unauthorized Dispatch Access Attempt');
            // Logic for redirect if needed
        }

        // 2. Initial Data Load
        await refreshMetrics();
        await renderMasterTable();
        
        // 3. Setup Real-time Hub
        setupRealtime();

        // 4. Operational Clock
        setInterval(updateSystemTime, 1000);
        updateSystemTime();

        // 5. Lucide Init
        if (window.lucide) lucide.createIcons();
    }

    // ─── Metrics Tracking ───
    async function refreshMetrics() {
        const db = window.Storage.db();
        if (!db) return;

        try {
            // Total Active Users (Patients)
            const { count: userCount } = await db.from('patients').select('*', { count: 'exact', head: true });
            txt('metric-users', (userCount || 0).toLocaleString());

            // Scans Today (Operational Triage)
            const today = new Date().toISOString().split('T')[0];
            const { count: scanCount } = await db.from('scans')
                .select('*', { count: 'exact', head: true })
                .gte('timestamp', today);
            txt('metric-scans', (scanCount || 0).toLocaleString());
        } catch (err) {
            console.error('[CommandCenter] Metric Synchronization Failure:', err);
        }
    }

    // ─── Real-time Alerting ───
    function setupRealtime() {
        const db = window.Storage.db();
        if (!db) return;

        console.log('[CommandCenter] Real-time Frequency: ONLINE');

        // Listen for new emergency alerts (SOS triggers)
        _realtimeChannel = db.channel('dispatch-incident-reporting')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, payload => {
                console.log('[CommandCenter] INCIDENT DETECTED:', payload.new);
                pushAlertToFeed(payload.new);
                refreshMetrics();
                triggerAlertPulse();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patients' }, payload => {
                renderMasterTable(); 
                refreshMetrics();
            })
            .subscribe();
    }

    function pushAlertToFeed(alert) {
        const container = $('admin-alert-feed');
        if (!container) return;

        // Clean placeholder on first real alert
        if (container.innerHTML.includes('Monitoring Frequency')) {
            container.innerHTML = '';
        }

        const time = new Date(alert.scan_time || alert.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const lat = alert.gps_lat ? alert.gps_lat.toFixed(6) : 'COORD_PENDING';
        const long = alert.gps_long ? alert.gps_long.toFixed(6) : 'COORD_PENDING';

        const card = document.createElement('div');
        card.className = 'alert-card urgent';
        card.id = `incident-${alert.id}`;
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 bg-dispatch-red rounded-full animate-ping"></span>
                    <span class="text-[9px] font-black tracking-widest text-dispatch-red uppercase">URGENT: DISPATCH_REQUIRED</span>
                </div>
                <span class="mono text-[8px] text-dispatch-muted">${time}</span>
            </div>
            <span class="alert-name">${alert.patient_name || 'ANONYMOUS_PATIENT'}</span>
            <div class="flex flex-col gap-1 mb-4">
                <span class="mono text-[9px] text-dispatch-muted">LOC_DATA: ${lat}, ${long}</span>
                <span class="text-[9px] font-bold text-dispatch-amber">STATUS: EMERGENCY_SCAN_DETECTED</span>
            </div>
            <div class="flex gap-2">
                <button class="ack-btn" onclick="acknowledgeIncident('${alert.id}')">ACKNOWLEDGE INCIDENT</button>
                <a href="https://www.google.com/maps?q=${alert.gps_lat},${alert.gps_long}" target="_blank" class="ack-btn px-4 bg-dispatch-slate-900 border-none flex items-center gap-1">
                    <i data-lucide="map-pin" class="w-3 h-3"></i> MAP
                </a>
            </div>
        `;

        container.prepend(card);
        if (window.lucide) lucide.createIcons();
    }

    window.acknowledgeIncident = function(id) {
        const card = $(`incident-${id}`);
        if (card) {
            card.classList.remove('urgent');
            card.classList.add('stable');
            card.style.opacity = '0.6';
            const btn = card.querySelector('button');
            if (btn) {
                btn.textContent = 'INCIDENT_ACKNOWLEDGED';
                btn.disabled = true;
                btn.style.background = 'var(--dispatch-green)';
            }
        }
    };

    function triggerAlertPulse() {
        // Aesthetic pulse for the map zone header
    }

    // ─── Master Clinical Database ───
    async function renderMasterTable() {
        const body = $('admin-table-body');
        if (!body) return;

        const patients = await window.Storage.getAllPatients();
        _cachedPatients = patients;

        if (patients.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center opacity-30 text-[10px] font-black uppercase">No Database Records Found</td></tr>`;
            return;
        }

        body.innerHTML = patients.map(p => {
            const date = new Date(p.createdAt || p.created_at || Date.now()).toLocaleDateString('en-GB');
            const status = p.conditions ? `<span class="text-dispatch-amber">Alert Bound</span>` : `<span class="text-dispatch-green">Stable</span>`;
            const truncId = (p.id || p.patient_id || '').substring(0, 12);

            return `
                <tr class="border-b border-dispatch-border/30 hover:bg-slate-800/30 transition-colors">
                    <td class="px-6 py-4 text-dispatch-muted uppercase tracking-tighter">#${truncId}...</td>
                    <td class="px-6 py-4 text-dispatch-text font-bold uppercase tracking-tight">${p.fullName}</td>
                    <td class="px-6 py-4">
                        <span class="bg-red-900/20 text-dispatch-red px-2 py-0.5 rounded border border-dispatch-red/30 font-black">${p.bloodGroup || '--'}</span>
                    </td>
                    <td class="px-6 py-4 font-bold">${status}</td>
                    <td class="px-6 py-4 text-dispatch-muted">${date}</td>
                    <td class="px-6 py-4 text-right">
                        <a href="emergency.html?sid=${p.id || p.patient_id}" target="_blank" class="btn-view-pill transition-transform active:scale-95 inline-flex items-center gap-1.5">
                            <i data-lucide="external-link" class="w-3 h-3"></i> VIEW RECORD
                        </a>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    // ─── UTILS ───
    function updateSystemTime() {
        const clock = $('admin-time');
        if (clock) {
            clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }) + ' UTC';
        }
    }

    // Start Operations
    document.addEventListener('DOMContentLoaded', init);

})();
