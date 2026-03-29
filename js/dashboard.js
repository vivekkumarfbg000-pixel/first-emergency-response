/* ============================================================
   dashboard.js — v2.0 Fully Functional Dashboard
   Tabs, Switcher, QR with data encoding, Edit, Search,
   Activity Log, Settings, Toast, Living Clock
   ============================================================ */

(function () {
    "use strict";

    // ─── State ───
    let currentPatient = null;
    let qrCanvas = null;

    // ─── Helpers ───
    const $ = (id) => document.getElementById(id);
    const txt = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    // ─── Toast System ───
    function showToast(msg, type = 'success') {
        const container = $('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
        toast.innerHTML = `<span>${icons[type] || '✅'}</span><span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('leaving');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ─── Live Clock ───
    function updateClock() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        txt('dash-time', now.toLocaleDateString('en-IN', options));
    }

    // ─── Init ───
    async function init() {
        // 1. Force Auth
        const user = await window.Auth.requireAuth();
        if (!user) return;

        lucide.createIcons();

        // 2. Admin Check
        const isAdmin = await window.Auth.isAdmin();
        const adminTab = $('nav-admin');
        if (isAdmin && adminTab) {
            adminTab.style.display = 'flex';
        }

        // 3. Load Data
        currentPatient = await window.Storage.getCurrentPatient();

        if (!currentPatient) {
            const all = await window.Storage.getAllPatients();
            if (all.length > 0) {
                currentPatient = all[0];
                localStorage.setItem('current_patient_id', currentPatient.patientId);
            } else {
                // If authenticated but no profile, redirect to register
                window.location.href = 'register.html';
                return;
            }
        }

        await renderAll();
        setupEvents();
        updateClock();
        setInterval(updateClock, 30000);
        showToast('Secure SaaS Session Active', 'success');
    }

    // ─── Render Everything ───
    async function renderAll() {
        if (!currentPatient) return;
        const p = currentPatient;

        // Header
        const isAdmin = await window.Auth.isAdmin();
        if (isAdmin) {
            txt('welcome-msg', `Master Admin Panel | ${p.fullName}`);
        } else {
            txt('welcome-msg', `Records for ${p.fullName.split(' ')[0]}`);
        }

        // Stats
        txt('stat-blood', p.bloodGroup);

        const pct = window.Storage.getProfileCompletion(p);
        txt('stat-completion', `${pct}%`);
        $('progress-bar').style.width = `${pct}%`;

        const totalScans = await window.Storage.getTotalScans();
        txt('stat-scans', totalScans.toString());

        const allPatients = await window.Storage.getAllPatients();
        txt('stat-profiles', allPatients.length.toString());

        // Medical ID Card
        txt('id-name', p.fullName);
        txt('id-meta', `${p.patientId} • ${p.age}Y / ${p.gender}`);
        txt('id-blood', p.bloodGroup);
        txt('id-phone', p.contact1_Phone);
        txt('id-avatar', p.fullName.charAt(0).toUpperCase());

        // Organ Donor
        const donorWrap = $('id-donor-wrap');
        if (donorWrap) {
            donorWrap.style.display = p.organDonor ? 'block' : 'none';
        }

        // Medical Summaries
        txt('sum-conditions', p.conditions || 'None reported');
        txt('sum-medications', p.medications || 'No ongoing medications');

        // Allergies
        const allergyText = p.allergies || 'No reported allergies';
        txt('sum-allergies', allergyText);
        const allergyCard = $('allergy-card');
        if (p.allergies && p.allergies.toLowerCase() !== 'none' && p.allergies.trim() !== '') {
            $('sum-allergies').style.color = '#ef4444';
            allergyCard.style.borderLeftColor = '#ef4444';
            allergyCard.style.animation = 'borderPulse 2s ease infinite';
        } else {
            $('sum-allergies').style.color = '#f59e0b';
            allergyCard.style.borderLeftColor = '#f59e0b';
            allergyCard.style.animation = 'none';
        }

        // Medical Notes
        const notesCard = $('notes-card');
        if (p.medicalNotes && p.medicalNotes.trim()) {
            notesCard.style.display = 'block';
            txt('sum-notes', p.medicalNotes);
        } else {
            notesCard.style.display = 'none';
        }

        // Sidebar badge & Switcher & QR
        if (isAdmin) {
            const navAdmin = $('nav-admin');
            if (navAdmin) navAdmin.style.display = 'flex';
        }
        
        await renderSwitcher();
        generateQR();
        await renderRecentActivity();
        lucide.createIcons();
    }

    async function renderSwitcher() {
        const all = await window.Storage.getAllPatients();
        const sel = $('patientSwitcher');
        if (!sel) return;
        sel.innerHTML = all.map(p =>
            `<option value="${p.patientId}" ${p.patientId === currentPatient.patientId ? 'selected' : ''}>${p.fullName}</option>`
        ).join('');
    }

    // ─── QR with Data Encoding ───
    function generateQR() {
        const container = $('qrcode-canvas-container');
        if (!container) return;
        container.innerHTML = '';

        const encodedData = window.Storage.encodeForQR(currentPatient);
        if (!encodedData) return;

        const baseUrl = window.location.href.split('dashboard.html')[0];
        const idToUse = currentPatient.id || currentPatient.patientId;
        const profileUrl = `${baseUrl}emergency.html?id=${idToUse}`;
        
        // Generate Hybrid vCard with "Clean URL" to ensure it's instantly fast to scan
        const vcardPayload = window.Storage.generateHybridVCard(currentPatient, profileUrl);

        console.log('[Dashboard] QR URL length:', profileUrl.length, 'chars');
        console.log('[Dashboard] QR vCard length:', vcardPayload.length, 'chars');

        QRCode.toCanvas(vcardPayload, {
            width: 200,
            margin: 1,
            color: { dark: '#0b0e14', light: '#ffffff' },
            errorCorrectionLevel: 'L'
        }, (err, canvas) => {
            if (err) { console.error('[Dashboard] QR generation error:', err); return; }
            qrCanvas = canvas;
            container.appendChild(canvas);
        });
    }

    // ─── Recent Activity (Sidebar) ───
    async function renderRecentActivity() {
        const scans = (await window.Storage.getScanHistory(currentPatient.patientId)).slice(0, 3);
        const logEl = $('activity-log');
        if (!logEl) return;

        if (scans.length === 0) {
            logEl.innerHTML = '<p style="font-size:0.8125rem; color:var(--text-muted); text-align:center; padding:1rem;">No activity yet</p>';
            return;
        }

        logEl.innerHTML = scans.map(s => {
            const { icon, color, bg, label } = getScanMeta(s.type);
            const timeAgo = getTimeAgo(s.timestamp);
            return `
                <div class="activity-item animate-slide-in">
                    <div class="activity-icon" style="background:${bg}; color:${color};">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div class="activity-text">${label}</div>
                        <div class="activity-time">${timeAgo} • ${s.device}</div>
                        ${s.latitude && s.longitude ? `
                        <a href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" class="activity-map-link">
                            <i data-lucide="map-pin"></i> View on Map
                        </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
    }

    // ─── Full Activity Tab ───
    async function renderFullActivity() {
        const scans = await window.Storage.getScanHistory();
        const logEl = $('full-activity-log');
        if (!logEl) return;

        if (scans.length === 0) {
            logEl.innerHTML = '<p style="padding:2rem; text-align:center; color:var(--text-muted);">No scan activity recorded yet.</p>';
            return;
        }

        // Pre-fetch all patients for names
        const allPatients = await window.Storage.getAllPatients();
        const patientMap = {};
        allPatients.forEach(p => patientMap[p.patientId] = p.fullName);

        logEl.innerHTML = scans.map(s => {
            const { icon, color, bg, label } = getScanMeta(s.type);
            const timeAgo = getTimeAgo(s.timestamp);
            const name = patientMap[s.patientId] || s.patientId;

            return `
                <div class="activity-full-item">
                    <div class="activity-icon" style="background:${bg}; color:${color};">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <div class="activity-text">${label}</div>
                                <div class="activity-time">${name} • ${s.device}</div>
                                ${s.latitude && s.longitude ? `
                                <a href="https://www.google.com/maps?q=${s.latitude},${s.longitude}" target="_blank" class="activity-map-link">
                                    <i data-lucide="map-pin"></i> Open Coordinates (Lat: ${s.latitude}, Long: ${s.longitude})
                                </a>
                                ` : ''}
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${timeAgo}</div>
                                <div style="font-size:0.6875rem; color:var(--text-muted);">${s.location || ''}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
    }

    function getScanMeta(type) {
        const map = {
            'qr_scan': { icon: 'scan-line', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'QR Code Scanned' },
            'profile_edit': { icon: 'edit-3', color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Profile Updated' },
            'profile_created': { icon: 'user-plus', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: 'Profile Created' },
            'qr_download': { icon: 'download', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'QR Downloaded' },
        };
        return map[type] || { icon: 'activity', color: '#64748b', bg: 'rgba(100,116,139,0.12)', label: type };
    }

    function getTimeAgo(timestamp) {
        const diff = Date.now() - new Date(timestamp).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    // ─── Events ───
    function setupEvents() {
        // Patient Switcher
        $('patientSwitcher').addEventListener('change', async (e) => {
            const p = await window.Storage.getPatientById(e.target.value);
            if (p) {
                currentPatient = p;
                localStorage.setItem('current_patient_id', p.patientId);
                await renderAll();
                showToast(`Switched to ${p.fullName}`, 'info');
            }
        });

        // Real-time Scan Alerts (Optimized with Status Tracking)
        if (window.supabaseClient) {
            const statusPill = $('realtime-status-pill');
            const instructions = $('realtime-instructions');

            const channel = window.supabaseClient
                .channel('emergency-alerts')
                .on('postgres_changes', { event: 'INSERT', table: 'scans' }, (payload) => {
                    console.log('[Dashboard] REALTIME SCAN DETECTED:', payload);
                    showToast('🚨 NEW EMERGENCY SCAN DETECTED!', 'error');
                    renderAll(); 
                })
                .subscribe((status) => {
                    console.log('[Dashboard] Real-time Channel Status:', status);
                    if (statusPill) {
                        if (status === 'SUBSCRIBED') {
                            statusPill.style.color = '#10b981';
                            statusPill.style.background = 'rgba(16,185,129,0.1)';
                            statusPill.innerHTML = '<span class="pulse-dot animate-pulse-green" style="width:8px; height:8px; background:currentColor; margin-right:4px;"></span> Live Sync Active';
                            if (instructions) instructions.style.display = 'none';
                        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                            statusPill.style.color = '#f59e0b';
                            statusPill.style.background = 'rgba(245,158,11,0.1)';
                            statusPill.innerHTML = '⚠️ Replication Pending';
                            if (instructions) instructions.style.display = 'block';
                        }
                    }
                });
        }

        // Sidebar Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', async () => {
                const tab = item.dataset.tab;

                if (!tab) {
                    if (item.id === 'btn-live-view') {
                        const encoded = window.Storage.encodeForQR(currentPatient);
                        const baseUrl = window.location.href.split('dashboard.html')[0];
                        const idToUse = currentPatient.id || currentPatient.patientId;
                        window.open(`${baseUrl}emergency.html?id=${idToUse}&data=${encoded}`, '_blank');
                    }
                    return;
                }

                // Switch tabs
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                $(`tab-${tab}`).style.display = 'block';

                if (tab === 'patients') await renderPatientsList();
                if (tab === 'activity') await renderFullActivity();
                if (tab === 'admin') await renderAdminTab();

                // Close sidebar on mobile
                $('sidebar').classList.remove('open');
            });
        });

        // Global Admin Search
        const adminSearch = $('adminSearch');
        if (adminSearch) {
            adminSearch.addEventListener('input', async () => {
                await renderAdminTab(adminSearch.value.trim().toLowerCase());
            });
        }

        // Mobile hamburger
        const hamburger = $('hamburgerBtn');
        if (hamburger) {
            hamburger.addEventListener('click', () => {
                $('sidebar').classList.toggle('open');
            });
        }

        // QR Actions
        $('downloadQR').addEventListener('click', async () => {
            if (!qrCanvas) return;
            const link = document.createElement('a');
            link.download = `EMS_QR_${currentPatient.fullName.replace(/\s+/g, '_')}.png`;
            link.href = qrCanvas.toDataURL();
            link.click();
            await window.Storage.logScan(currentPatient.patientId, 'qr_download', 'Dashboard');
            showToast('QR Image Downloaded');
        });

        $('setWallpaper').addEventListener('click', () => {
            if (!qrCanvas) return;
            createWallpaper(qrCanvas, currentPatient);
            showToast('Emergency Wallpaper Generated');
        });

        // Management
        $('btn-edit-main').addEventListener('click', openEditModal);
        const btnPrint = $('btn-print');
        if (btnPrint) {
            btnPrint.addEventListener('click', async () => {
                const originalContent = btnPrint.innerHTML;
                btnPrint.disabled = true;
                btnPrint.innerHTML = '<i class="animate-spin-slow"></i> Generating...';
                
                try {
                    if (!window.CardGenerator) throw new Error('Card Generator not loaded');
                    const dataUrl = await window.CardGenerator.generate(currentPatient);
                    
                    if (dataUrl) {
                        const link = document.createElement('a');
                        link.download = `EMS_CARD_${currentPatient.fullName.replace(/\s+/g, '_')}.png`;
                        link.href = dataUrl;
                        link.click();
                        showToast('✅ Medical ID Card Ready', 'success');
                    } else {
                        throw new Error('Canvas render failed');
                    }
                } catch (err) {
                    console.error('[Dashboard] Print error:', err);
                    showToast('❌ Printing Failed: Check console', 'error');
                } finally {
                    btnPrint.disabled = false;
                    btnPrint.innerHTML = originalContent;
                }
            });
        }
        $('btn-delete').addEventListener('click', deleteCurrent);
        $('btn-export').addEventListener('click', () => {
            // Simplified export for this version
            alert('Cloud backup is active. Local export disabled.');
        });

        // Edit Form
        $('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveChanges();
        });

        // Settings
        const settingsReset = $('settings-reset');
        if (settingsReset) {
            settingsReset.addEventListener('click', () => {
                if (confirm('⚠️ This will permanently delete ALL local and cloud profiles. Are you sure?')) {
                    // Actual cleanup would require more logic for cloud
                    localStorage.clear();
                    showToast('Data reset requested. Reloading...', 'info');
                }
            });
        }

        // Cloud Test
        const btnTestCloud = $('btn-test-cloud');
        if (btnTestCloud) {
            btnTestCloud.addEventListener('click', testCloudConnection);
        }

        // Seed Cloud (Admin Only)
        const btnSeedCloud = $('btn-seed-cloud');
        if (btnSeedCloud) {
            btnSeedCloud.addEventListener('click', async () => {
                if (!confirm('This will create 3 mock profiles in Supabase. Proceed?')) return;
                btnSeedCloud.disabled = true;
                btnSeedCloud.textContent = 'Seeding...';
                try {
                    const count = await window.Storage.seedCloud();
                    showToast(`Successfully seeded ${count} cloud records!`, 'success');
                    await renderAdminTab();
                } catch (e) {
                    showToast('Cloud seeding failed: ' + e.message, 'error');
                } finally {
                    btnSeedCloud.disabled = false;
                    btnSeedCloud.innerHTML = '<i data-lucide="database-zap"></i> Seed Cloud Mock Data';
                    if (window.lucide) lucide.createIcons();
                }
            });
        }

        // Search in patients tab
        const searchInput = $('patientSearch');
        if (searchInput) {
            searchInput.addEventListener('input', async () => {
                await renderPatientsList(searchInput.value.trim().toLowerCase());
            });
        }
    }

    // ─── Edit Modal ───
    function openEditModal() {
        const p = currentPatient;
        $('edit_fullName').value = p.fullName;
        $('edit_bloodGroup').value = p.bloodGroup;
        $('edit_age').value = p.age;
        $('edit_gender').value = p.gender;
        $('edit_contactName').value = p.contact1_Name;
        $('edit_contactPhone').value = p.contact1_Phone;
        $('edit_contact2Name').value = p.contact2_Name || '';
        $('edit_contact2Phone').value = p.contact2_Phone || '';
        $('edit_conditions').value = p.conditions || '';
        $('edit_allergies').value = p.allergies || '';
        $('edit_medications').value = p.medications || '';
        $('edit_medicalNotes').value = p.medicalNotes || '';
        $('editModal').style.display = 'flex';
        lucide.createIcons();
    }

    window.closeModal = () => { $('editModal').style.display = 'none'; };

    async function saveChanges() {
        const btn = document.querySelector('#editForm button[type="submit"]');
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="animate-spin" data-lucide="loader"></i> Saving...';
            if (window.lucide) lucide.createIcons();

            const updated = {
                fullName: $('edit_fullName').value,
                bloodGroup: $('edit_bloodGroup').value,
                age: $('edit_age').value,
                gender: $('edit_gender').value,
                contact1_Name: $('edit_contactName').value,
                contact1_Phone: $('edit_contactPhone').value,
                contact2_Name: $('edit_contact2Name').value,
                contact2_Phone: $('edit_contact2Phone').value,
                conditions: $('edit_conditions').value,
                allergies: $('edit_allergies').value,
                medications: $('edit_medications').value,
                medicalNotes: $('edit_medicalNotes').value
            };

            await window.Storage.updatePatient(currentPatient.patientId, updated);
            
            currentPatient = await window.Storage.getPatientById(currentPatient.patientId);
            await renderAll();
            closeModal();
            showToast('Profile Updated Successfully', 'success');
        } catch (err) {
            console.error('Update Error:', err);
            showToast(err.message || 'Cloud Sync Failed', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    async function testCloudConnection() {
        const btn = $('btn-test-cloud');
        const pill = $('connection-status-pill');
        const details = $('connection-details');
        
        btn.disabled = true;
        btn.textContent = 'Testing...';
        pill.style.display = 'none';
        details.style.display = 'none';

        try {
            const result = await window.Storage.testConnection();
            
            pill.style.display = 'inline-block';
            pill.textContent = result.success ? 'Success' : 'Failed';
            pill.style.background = result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
            pill.style.color = result.success ? '#22c55e' : '#ef4444';
            
            details.style.display = 'block';
            details.textContent = result.message;
            
            showToast(result.success ? 'Cloud Connection Verified' : 'Connection Failed', result.success ? 'success' : 'error');
        } catch (err) {
            details.style.display = 'block';
            details.textContent = 'Error: ' + err.message;
            showToast('Test Failed', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Test Cloud Connection';
        }
    }

    async function deleteCurrent() {
        if (confirm(`⚠️ Permanently delete ${currentPatient.fullName}'s profile?\nThis cannot be undone.`)) {
            const idToUse = currentPatient.id || currentPatient.patientId;
            await window.Storage.deletePatient(idToUse);
            showToast('Profile deleted', 'error');
            setTimeout(() => window.location.reload(), 1000);
        }
    }

    // ─── Patients List ───
    async function renderPatientsList(filter = '') {
        let all = await window.Storage.getAllPatients();

        if (filter) {
            all = all.filter(p =>
                p.fullName.toLowerCase().includes(filter) ||
                p.bloodGroup.toLowerCase().includes(filter) ||
                (p.conditions || '').toLowerCase().includes(filter)
            );
        }

        const countEl = $('profiles-count-text');
        if (countEl) countEl.textContent = `${all.length} profile${all.length !== 1 ? 's' : ''} ${filter ? 'found' : 'registered'}`;

        const wrap = $('patientsTableWrap');
        if (!wrap) return;

        if (all.length === 0) {
            wrap.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">
                <i data-lucide="search-x" style="width:40px; height:40px; margin-bottom:1rem; opacity:0.3;"></i>
                <p style="font-size:0.9375rem;">No patients found</p>
            </div>`;
            lucide.createIcons();
            return;
        }

        wrap.innerHTML = `
            <table class="patients-table">
                <thead>
                    <tr>
                        <th>Patient</th>
                        <th>Blood</th>
                        <th>Age</th>
                        <th>Allergies</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${all.map(p => {
                        const completion = window.Storage.getProfileCompletion(p);
                        const hasAllergies = p.allergies && p.allergies.toLowerCase() !== 'none' && p.allergies.trim();
                        return `
                        <tr>
                            <td>
                                <div class="patient-row-name">
                                    <div class="patient-row-avatar">${p.fullName.charAt(0)}</div>
                                    <div>
                                        <div style="font-weight:600;">${p.fullName}</div>
                                        <div style="font-size:0.6875rem; color:var(--text-muted);">${p.patientId}</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="badge badge-red">${p.bloodGroup}</span></td>
                            <td>${p.age}Y / ${p.gender}</td>
                            <td>${hasAllergies ? `<span class="badge badge-yellow">⚠ Yes</span>` : '<span style="color:var(--text-muted);">None</span>'}</td>
                            <td><span class="badge badge-green">${completion}% Complete</span></td>
                            <td>
                                <button class="btn btn-ghost btn-sm" onclick="switchTo('${p.patientId}')">
                                    <i data-lucide="eye" style="width:14px;"></i>
                                    View
                                </button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;

        lucide.createIcons();
    }

    async function switchTo(id) {
        const p = await window.Storage.getPatientById(id);
        if (p) {
            currentPatient = p;
            localStorage.setItem('current_patient_id', id);
            await renderAll();

            // Switch to overview tab
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            const overviewTab = document.querySelector('[data-tab="overview"]');
            if (overviewTab) overviewTab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            const overviewContent = $('tab-overview');
            if (overviewContent) overviewContent.style.display = 'block';

            showToast(`Viewing ${p.fullName}'s profile`, 'info');
        }
    }
    // Make global for onclick
    window.switchTo = switchTo;

    // ─── Wallpaper Generator ───
    function createWallpaper(qrCanvas, patient) {
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        c.width = 1080; c.height = 1920;

        // Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
        bgGrad.addColorStop(0, '#060910');
        bgGrad.addColorStop(1, '#0f1629');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1920);

        // Red glow
        const glowGrad = ctx.createRadialGradient(540, 800, 0, 540, 800, 500);
        glowGrad.addColorStop(0, 'rgba(255, 59, 59, 0.08)');
        glowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 300, 1080, 1000);

        // Top text
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3b3b';
        ctx.font = 'bold 48px Inter, system-ui';
        ctx.fillText('⚕ IN CASE OF EMERGENCY', 540, 220);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '28px Inter, system-ui';
        ctx.fillText('SCAN QR TO VIEW MEDICAL PROFILE', 540, 280);

        // QR
        const qrSize = 500;
        const qrX = (1080 - qrSize) / 2;
        // Draw white background for QR
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrX - 20, 380, qrSize + 40, qrSize + 40);
        ctx.drawImage(qrCanvas, qrX, 400, qrSize, qrSize);

        // Name
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 64px Inter, system-ui';
        ctx.fillText(patient.fullName.toUpperCase(), 540, 1050);

        // Blood
        ctx.fillStyle = '#ff3b3b';
        ctx.font = '900 120px Inter, system-ui';
        ctx.fillText(`BLOOD: ${patient.bloodGroup}`, 540, 1200);

        // Allergies
        if (patient.allergies && patient.allergies.toLowerCase() !== 'none') {
            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 36px Inter, system-ui';
            ctx.fillText(`⚠ ALLERGIES: ${patient.allergies.toUpperCase()}`, 540, 1320);
        }

        // Contact
        ctx.fillStyle = '#94a3b8';
        ctx.font = '32px Inter, system-ui';
        ctx.fillText(`CALL: ${patient.contact1_Name} — ${patient.contact1_Phone}`, 540, 1440);

        // Footer
        ctx.fillStyle = '#475569';
        ctx.font = '24px Inter, system-ui';
        ctx.fillText('EMS Response • First Emergency Response System', 540, 1800);

        const link = document.createElement('a');
        link.download = `EMS_Wallpaper_${patient.fullName.replace(/\s+/g, '_')}.png`;
        link.href = c.toDataURL();
        link.click();
    }


    // ─── Admin Master Tab ───
    async function renderAdminTab(filter = '') {
        const wrap = $('adminPatientsTableWrap');
        if (!wrap) return;

        // Fetch ALL patients (RLS will allow this if current user is admin)
        let all = await window.Storage.getAllPatients();
        
        // Fetch Global Stats
        txt('admin-total-users', 'Multi'); 
        txt('admin-total-profiles', all.length.toString());
        const totalScans = await window.Storage.getTotalScans();
        txt('admin-total-scans', totalScans.toString());

        if (filter) {
            all = all.filter(p => 
                p.fullName.toLowerCase().includes(filter) || 
                p.patientId.toLowerCase().includes(filter) ||
                (p.conditions || '').toLowerCase().includes(filter)
            );
        }

        if (all.length === 0) {
            wrap.innerHTML = '<p style="text-align:center; padding:3rem; opacity:0.5;">No global records found.</p>';
            return;
        }

        wrap.innerHTML = `
            <table class="patients-table">
                <thead>
                    <tr>
                        <th>Master Record</th>
                        <th>Owner ID</th>
                        <th>Blood</th>
                        <th>Registered</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${all.map(p => `
                    <tr>
                        <td>
                            <div style="font-weight:600;">${p.fullName}</div>
                            <div style="font-size:0.6875rem; color:var(--text-muted);">${p.patientId}</div>
                        </td>
                        <td style="font-family:monospace; font-size:0.6875rem; color:var(--text-muted);">${p.userId ? p.userId.split('-')[0] + '...' : 'System'}</td>
                        <td><span style="background:rgba(239,68,68,0.1); color:#ef4444; font-size:0.625rem; padding:2px 8px; border-radius:99px; font-weight:800;">${p.bloodGroup}</span></td>
                        <td>${new Date(p.createdAt).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-ghost btn-sm" onclick="switchTo('${p.patientId}')">
                                <i data-lucide="settings-2" style="width:14px;"></i> Manage
                            </button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        `;
        lucide.createIcons();
    }
    window.renderAdminTab = renderAdminTab;

    // ─── Run ───
    init();

})();
