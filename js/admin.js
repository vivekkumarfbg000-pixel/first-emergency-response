/* ============================================================
   admin.js — v7-pro Command Center Dispatch Engine
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
            // Total Active Users
            const { count: userCount } = await db.from('patients').select('*', { count: 'exact', head: true });
            txt('metric-users', (userCount || 0).toLocaleString());

            // Scans Today
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

        _realtimeChannel = db.channel('dispatch-incident-reporting')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, payload => {
                console.log('[CommandCenter] INCIDENT DETECTED:', payload.new);
                pushAlertToFeed(payload.new);
                refreshMetrics();
                dropMapMarker(payload.new);
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

        // Clean placeholder
        if (container.innerHTML.includes('Monitoring Frequency')) {
            container.innerHTML = '';
        }

        const time = new Date(alert.scan_time || alert.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isUrgent = true; // Alerts from emergency_alerts are always urgent

        const card = document.createElement('div');
        card.id = `incident-${alert.id}`;
        card.className = `bg-red-500/10 border-l-4 border-red-500 rounded-r-lg p-4 shadow-[0_0_15px_rgba(239,68,68,0.1)] relative animate-pulse-fast`;
        card.innerHTML = `
            <div class="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg tracking-wider">
                JUST NOW
            </div>
            <div class="flex items-start gap-3">
              <div class="bg-red-500 p-2 rounded mt-1">
                <i data-lucide="radio" class="w-4 h-4 text-white animate-pulse"></i>
              </div>
              <div class="flex-1">
                <h3 class="text-red-500 font-bold text-sm mb-1 uppercase tracking-wide">Urgent: Scan Detected</h3>
                <p class="text-sm text-white font-medium mb-1">Patient: ${alert.patient_name || 'ANONYMOUS'} <span class="text-slate-400 text-xs ml-2">BLOOD: ${alert.patient_blood || '--'}</span></p>
                <div class="flex items-center gap-1 text-xs text-slate-300 mb-3 underline cursor-pointer" onclick="panToMarker(${alert.gps_lat}, ${alert.gps_long})">
                  <i data-lucide="map-pin" class="w-3 h-3 text-red-400"></i>
                  Location: ${alert.gps_lat.toFixed(4)}, ${alert.gps_long.toFixed(4)}
                </div>
                <div class="flex gap-2">
                  <button class="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-3 rounded transition-colors" onclick="acknowledgeAlert('${alert.id}')">
                    Acknowledge & Dispatch
                  </button>
                  <a href="emergency.html?sid=${alert.patient_id}" target="_blank" class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-3 py-2 rounded transition-colors">
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                  </a>
                </div>
              </div>
            </div>
        `;

        container.prepend(card);
        if (window.lucide) lucide.createIcons();
    }

    window.acknowledgeAlert = function(id) {
        const card = $(`incident-${id}`);
        if (card) {
            card.className = "bg-slate-800/50 border-l-4 border-slate-600 rounded-r-lg p-4 opacity-75 transition-all duration-500";
            card.innerHTML = `
                <div class="flex items-start gap-3">
                  <div class="bg-slate-700 p-2 rounded mt-1">
                    <i data-lucide="check" class="w-4 h-4 text-slate-300"></i>
                  </div>
                  <div class="flex-1">
                    <h3 class="text-slate-400 font-bold text-sm mb-1 uppercase tracking-wide">Acknowledged & Resolved</h3>
                    <p class="text-sm text-slate-300 font-medium">Handled by Master Admin</p>
                  </div>
                </div>
            `;
            lucide.createIcons();
        }
    };

    // ─── Map Operations ───
    function dropMapMarker(alert) {
        if (!window.adminMap || !alert.gps_lat) return;
        
        const emergencyIcon = L.divIcon({
            className: 'custom-emergency-icon',
            html: `
              <div class="relative">
                <div class="emergency-pulse-ring absolute"></div>
                <div class="emergency-core"></div>
              </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });

        const marker = L.marker([alert.gps_lat, alert.gps_long], { icon: emergencyIcon }).addTo(window.adminMap);
        marker.bindPopup(`<b style="color:#ef4444;">EMERGENCY SCAN</b><br>${alert.patient_name || 'Patient'}<br>Blood: ${alert.patient_blood || '--'}`).openPopup();
        window.adminMap.setView([alert.gps_lat, alert.gps_long], 14);
    }

    window.panToMarker = (lat, lng) => {
        if (window.adminMap) {
            window.adminMap.setView([lat, lng], 16);
        }
    };

    // ─── Master Table ───
    async function renderMasterTable() {
        const body = $('admin-table-body');
        if (!body) return;

        const patients = await window.Storage.getAllPatients();
        _cachedPatients = patients;

        body.innerHTML = patients.map(p => {
            const date = new Date(p.createdAt || p.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            const risk = (p.conditions || p.allergies) ? `<span class="text-red-400 font-semibold text-xs flex items-center gap-1"><i data-lucide="alert-octagon" class="w-3 h-3"></i> Risk Detected</span>` : `<span class="text-emerald-400 font-semibold text-xs">Standard</span>`;
            const bloodColor = p.bloodGroup?.includes('-') ? 'text-red-400' : 'text-blue-400';

            return `
                <tr class="hover:bg-slate-800/50 transition-colors">
                  <td class="px-6 py-4 font-mono text-slate-400 text-xs">#${(p.id || p.patient_id || '').substring(0, 8)}</td>
                  <td class="px-6 py-4 font-semibold text-white">${p.fullName}</td>
                  <td class="px-6 py-4"><span class="bg-slate-900 border border-slate-700 ${bloodColor} px-2 py-1 rounded font-bold">${p.bloodGroup || '--'}</span></td>
                  <td class="px-6 py-4">${risk}</td>
                  <td class="px-6 py-4 text-slate-400 text-xs">${date}</td>
                  <td class="px-6 py-4 text-right">
                    <a href="emergency.html?sid=${p.id || p.patient_id}" target="_blank" class="text-blue-400 hover:text-blue-300 font-semibold text-xs transition-colors">View Record</a>
                  </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    function updateSystemTime() {
        const clock = $('admin-time');
        if (clock) {
            clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
