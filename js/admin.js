/* ============================================================
   admin.js — Sehat Point Admin Command Center Logic
   Features: Real-time Alerting, Master User Database,
             Live Metrics Tracking, and Dispatch Console UI.
   ============================================================ */

(function () {
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    let _cachedPatients = [];
    let _realtimeChannel = null;

    // ─── Initialization ───
    async function init() {
        console.log('[AdminCenter] Initializing Dispatch Console...');
        
        // 1. Check Auth (Simple check for now, can be hardened)
        const isAdmin = await window.Storage._isAdminUser();
        if (!isAdmin && window.location.hostname !== 'localhost') {
            console.warn('[AdminCenter] Unauthorized Access Attempt');
            // window.location.href = 'index.html';
            // return;
        }

        // 2. Initial Data Pull
        await refreshMetrics();
        await renderMasterTable();
        
        // 3. Setup Real-time Listeners
        setupRealtime();

        // 4. Start System Clock
        setInterval(updateSystemTime, 1000);
        updateSystemTime();

        // 5. Initial Icons
        if (window.lucide) lucide.createIcons();
    }

    // ─── Metrics Hub ───
    async function refreshMetrics() {
        const db = window.Storage.db();
        if (!db) return;

        try {
            // Get Total Patients
            const { count: userCount } = await db.from('patients').select('*', { count: 'exact', head: true });
            txt('metric-users', (userCount || 0).toLocaleString());

            // Get Scans Today
            const today = new Date().toISOString().split('T')[0];
            const { count: scanCount } = await db.from('scans')
                .select('*', { count: 'exact', head: true })
                .gte('timestamp', today);
            txt('metric-scans', (scanCount || 0).toLocaleString());
        } catch (err) {
            console.error('[Admin] Metric Refresh Error:', err);
        }
    }

    // ─── Real-time Engine ───
    function setupRealtime() {
        const db = window.Storage.db();
        if (!db) return;

        console.log('[Admin] Establishing Real-time Channel...');

        // Listen for new emergency alerts
        _realtimeChannel = db.channel('admin-dispatch-hub')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, payload => {
                console.log('[Admin] NEW EMERGENCY ALERT:', payload.new);
                pushAlertToFeed(payload.new);
                refreshMetrics();
                playAlertSound();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patients' }, payload => {
                renderMasterTable(); // Refresh table on new user
                refreshMetrics();
            })
            .subscribe();
    }

    function pushAlertToFeed(alert) {
        const container = $('admin-alert-feed');
        if (!container) return;

        // Remove placeholder if exists
        if (container.innerHTML.includes('Waiting for active scans')) {
            container.innerHTML = '';
        }

        const time = new Date(alert.scan_time || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const lat = alert.gps_lat ? alert.gps_lat.toFixed(4) : '--';
        const long = alert.gps_long ? alert.gps_long.toFixed(4) : '--';

        const card = document.createElement('div');
        card.className = 'alert-card urgent';
        card.id = `alert-${alert.id}`;
        card.innerHTML = `
            <div class="alert-meta">
                <span style="color:var(--status-red); font-weight:700;">URGENT</span>
                <span class="alert-coords">${lat}, ${long}</span>
            </div>
            <span class="alert-name">${alert.patient_name || 'Anonymous'}</span>
            <p style="font-size: 0.75rem; color: var(--text-dim); margin-bottom:0.5rem;">
                Emergency scan at ${time}. Auto-sync active.
            </p>
            <div style="display:flex; gap:0.5rem;">
                <button class="ack-btn" onclick="acknowledgeAlert('${alert.id}')">ACKNOWLEDGE</button>
            </div>
        `;

        container.prepend(card);
        if (window.lucide) lucide.createIcons();
    }

    window.acknowledgeAlert = function(id) {
        const card = $(`alert-${id}`);
        if (card) {
            card.classList.remove('urgent');
            card.style.opacity = '0.5';
            card.querySelector('.ack-btn').textContent = 'ACKNOWLEDGED';
            card.querySelector('.ack-btn').disabled = true;
            card.querySelector('.ack-btn').style.background = 'var(--status-green)';
        }
    };

    function playAlertSound() {
        // Option for clinical beep
    }

    // ─── Master Table ───
    async function renderMasterTable() {
        const body = $('admin-table-body');
        if (!body) return;

        const patients = await window.Storage.getAllPatients();
        _cachedPatients = patients;

        body.innerHTML = patients.map(p => {
            const date = new Date(p.createdAt || Date.now()).toLocaleDateString();
            const status = p.conditions ? `<span style="color:var(--status-amber)">Alert Bound</span>` : `<span style="color:var(--status-green)">Stable</span>`;
            
            return `
                <tr>
                    <td style="font-family: monospace; font-size: 11px;">#${(p.id || p.patientId || '').substring(0, 8)}</td>
                    <td style="font-weight: 700; color: white;">${p.fullName}</td>
                    <td><span style="color:var(--status-red); font-weight:700;">${p.bloodGroup || '--'}</span></td>
                    <td>${status}</td>
                    <td style="color: var(--text-dim);">${date}</td>
                    <td>
                        <a href="emergency.html?sid=${p.id || p.patientId}" target="_blank" class="btn-view-pill">VIEW RECORD</a>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ─── Utils ───
    function updateSystemTime() {
        const clock = $('admin-time');
        if (clock) {
            clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);

})();
