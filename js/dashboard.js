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
    // ─── Loading Control ───
    function setLoading(isLoading) {
        const loader = $('app-loading');
        if (loader) {
            if (isLoading) {
                loader.classList.remove('fade-out');
                loader.style.display = 'flex';
            } else {
                loader.classList.add('fade-out');
                setTimeout(() => loader.style.display = 'none', 500);
            }
        }
    }

    // ─── Bootstrap UI (Interactive immediately) ───
    function bootstrapUI() {
        // Render initial icons
        if (window.lucide) lucide.createIcons();

        // Mobile sidebar toggle
        const sidebarToggle = $('sidebarToggle');
        const sidebar = $('appSidebar');
        if (sidebarToggle && sidebar) {
            sidebarToggle.onclick = () => sidebar.classList.toggle('open');
        }

        // Sidebar Navigation (Tab Switching)
        const navItems = document.querySelectorAll('.nav-item[data-tab]');
        navItems.forEach(btn => {
            btn.onclick = async () => {
                const tabId = btn.getAttribute('data-tab');
                if (!tabId) return;

                // Sync UI State
                navItems.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                const targetTab = document.getElementById(tabId);
                if (targetTab) targetTab.classList.add('active');

                // Close sidebar on mobile
                if (sidebar) sidebar.classList.remove('open');

                // Lazy load tab-specific data
                if (tabId === 'tab-patients') await renderPatientsList();
                if (tabId === 'tab-activity') await renderFullActivity();
                if (tabId === 'tab-admin') await renderAdminTab();
            };
        });
    }

    // ─── Global Initialization ───
    async function init() {
        setLoading(true);
        try {
            // 1. Parallel Auth & Data Fetching (Fast)
            const [user, isAdmin, initialPatient] = await Promise.all([
                window.Auth.requireAuth(),
                window.Auth.isAdmin(),
                window.Storage.getCurrentPatient()
            ]);

            if (!user) return; // requireAuth handles redirect

            // 2. Admin Visibility
            const adminTab = $('nav-admin');
            if (isAdmin && adminTab) adminTab.style.display = 'flex';

            // 3. Fallback Patient Selection
            currentPatient = initialPatient;
            if (!currentPatient) {
                const all = await window.Storage.getAllPatients();
                if (all.length > 0) {
                    currentPatient = all[0];
                    localStorage.setItem('current_patient_id', currentPatient.patientId);
                } else {
                    window.location.href = 'register.html';
                    return;
                }
            }

            // 4. Initial Render
            await renderAll();
            setupEvents();
            updateClock();
            setInterval(updateClock, 30000);

            showToast('Session Active', 'success');
        } catch (err) {
            console.error('[Dashboard] Init Failure:', err);
            showToast('Connection unstable. Retrying...', 'error');
        } finally {
            setLoading(false);
        }
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

        // Premium Medical ID Card Population (Matched to Image)
        txt('p-premium-name', p.fullName || 'Anonymous Patient');
        
        // Format Date: 4 APRIL 2026
        const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDate = new Date(p.updatedAt || p.createdAt || Date.now())
            .toLocaleDateString('en-GB', dateOptions).toUpperCase();
        txt('p-premium-updated', formattedDate);
        
        txt('p-premium-blood', p.bloodGroup || '--');
        txt('p-premium-condition', p.conditions || 'None Reported');
        txt('p-premium-allergy', p.allergies || 'No Known Allergies');
        txt('p-premium-medication', p.medications || 'No Active Meds');
        txt('p-premium-notes', p.medicalNotes || 'No notes provided.');

        // ─── Automated Risk Assessment ───
        const riskTag = $('p-premium-risk');
        const conditionLower = (p.conditions || '').toLowerCase();
        const isCritical = conditionLower.includes('heart') || 
                           conditionLower.includes('diabetes') || 
                           conditionLower.includes('hypertension') ||
                           conditionLower.includes('critical');

        if (riskTag) {
            if (isCritical) {
                riskTag.style.display = 'inline-flex';
                riskTag.textContent = 'CRITICAL RISK';
            } else {
                riskTag.style.display = 'none';
            }
        }

        // Family Call Button
        const familyBtn = $('p-premium-btn-family');
        if (familyBtn && p.contact1_Phone) {
            familyBtn.href = `tel:${p.contact1_Phone}`;
            familyBtn.style.display = 'inline-flex';
        } else if (familyBtn) {
            familyBtn.style.display = 'none';
        }

        // ─── Render Contextual Tabs (Summary Stats) ───
        const condBadge = $('sum-conditions')?.closest('.info-badge');
        const medBadge = $('sum-medications')?.closest('.info-badge');
        const allergyBadge = $('sum-allergies')?.closest('.info-badge');

        if (condBadge) {
            condBadge.className = 'info-badge ' + (isCritical ? 'theme-red' : 'theme-amber');
            txt('sum-conditions', p.conditions || 'Stable');
        }
        if (medBadge) {
            medBadge.className = 'info-badge theme-green';
            txt('sum-medications', p.medications || 'None');
        }
        if (allergyBadge) {
            const hasAllergies = p.allergies && p.allergies.toLowerCase() !== 'none';
            allergyBadge.className = 'info-badge ' + (hasAllergies ? 'theme-red' : 'theme-blue');
            txt('sum-allergies', p.allergies || 'No known allergies');
        }

        // Clinical Health Summary
        const healthSummary = `Clinical data for ${p.fullName} (${p.bloodGroup}). ` + 
                             (p.conditions ? `Conditions: ${p.conditions}. ` : 'Stable clinical history. ') +
                             (p.allergies ? `WARNING: Hypersensitivity to ${p.allergies}.` : 'No allergic hazards detected.');
        txt('sum-health-report', healthSummary);
        if (healthSummaryCard) {
            healthSummaryCard.classList.add('card-theme-blue');
            const healthReport = `Clinical data for ${p.fullName} (${p.bloodGroup}). ` + 
                               (p.conditions ? `Conditions: ${p.conditions}. ` : 'Stable clinical history. ') +
                               (p.allergies ? `WARNING: Hypersensitivity to ${p.allergies}.` : 'No allergic hazards detected.');
            txt('sum-health-report', healthReport);
        }

        // Medical Notes
        const notesCard = $('notes-card');
        if (p.medicalNotes && p.medicalNotes.trim()) {
            if (notesCard) {
                notesCard.style.display = 'block';
                txt('sum-notes', p.medicalNotes);
            }
        } else {
            if (notesCard) notesCard.style.display = 'none';
        }

        // Sidebar badge & Switcher & QR
        if (isAdmin) {
            const navAdmin = $('nav-admin');
            if (navAdmin) navAdmin.style.display = 'flex';
        }
        
        await renderSwitcher();
        generateQR();
        await renderRecentActivity();
        if (window.lucide) lucide.createIcons();
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
        const sidToUse = currentPatient.id || currentPatient.patientId;
        const profileUrl = `${baseUrl}emergency.html?sid=${sidToUse}`;
        
        // Use DIRECT URL for 100% redirection reliability on all scanners
        console.log('[Dashboard] Generating Redirect QR for:', profileUrl);

        QRCode.toCanvas(profileUrl, {
            width: 210,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'H' // High recovery for physical damage
        }, (err, canvas) => {
            if (err) { console.error('[Dashboard] QR Error:', err); return; }
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
        // Support both possible container IDs
        const logEl = $('full-activity-log') || $('recentActivityList');
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
    // ─── Secondary Events (Requires Data) ───
    function setupEvents() {
        // Patient Switcher
        const switcher = $('patientSwitcher');
        if (switcher) {
            switcher.onchange = async (e) => {
                setLoading(true);
                const p = await window.Storage.getPatientById(e.target.value);
                if (p) {
                    currentPatient = p;
                    localStorage.setItem('current_patient_id', p.patientId);
                    await renderAll();
                    showToast(`Switched to ${p.fullName}`, 'info');
                }
                setLoading(false);
            };
        }

        // Real-time Scan Alerts
        if (window.supabaseClient) {
            window.supabaseClient
                .channel('emergency-alerts')
                .on('postgres_changes', { event: 'INSERT', table: 'scans' }, async (payload) => {
                    await renderAll();
                    if (payload.new && payload.new.is_emergency) {
                        showToast('🆘 EMERGENCY SCAN LOGGED!', 'error');
                    }
                })
                .on('postgres_changes', { event: 'INSERT', table: 'patients' }, async (payload) => {
                    showToast(`✨ NEW PROFILE: ${payload.new.full_name}`, 'success');
                    await window.Storage.getAllPatients(); 
                    await renderAll();
                })
                .on('postgres_changes', { event: 'INSERT', table: 'emergency_alerts' }, async (payload) => {
                    showToast(`📧 ALERT SENT: ${payload.new.family_email.toUpperCase()}`, 'error');
                })
                .subscribe();
        }

        // Global Admin Search
        const adminSearch = $('adminSearch');
        if (adminSearch) {
            adminSearch.addEventListener('input', async () => {
                await renderAdminTab(adminSearch.value.trim().toLowerCase());
            });
        }

        // QR Actions
        const dlBtn = $('downloadQR');
        if (dlBtn) {
            dlBtn.addEventListener('click', async () => {
                if (!qrCanvas) return;
                const link = document.createElement('a');
                link.download = `EMS_QR_${currentPatient.fullName.replace(/\s+/g, '_')}.png`;
                link.href = qrCanvas.toDataURL();
                link.click();
                await window.Storage.logScan(currentPatient.patientId, 'qr_download', 'Dashboard');
                showToast('QR Image Downloaded');
            });
        }

        const wpBtn = $('setWallpaper');
        if (wpBtn) {
            wpBtn.addEventListener('click', () => {
                if (!qrCanvas) return;
                createWallpaper(qrCanvas, currentPatient);
                showToast('Emergency Wallpaper Generated');
            });
        }

        // Management Actions
        const btnEdit = $('btn-edit-main');
        if (btnEdit) btnEdit.addEventListener('click', openEditModal);

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
                    }
                } catch (err) {
                    showToast('❌ Printing Failed', 'error');
                } finally {
                    btnPrint.disabled = false;
                    btnPrint.innerHTML = originalContent;
                }
            });
        }

        const btnDelete = $('btn-delete');
        if (btnDelete) btnDelete.addEventListener('click', deleteCurrent);

        const btnExport = $('btn-export');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                alert('Cloud backup is active. Local export disabled.');
            });
        }

        // Edit Form
        const editForm = $('editForm');
        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await saveChanges();
            });
        }

        // Settings Actions
        const settingsReset = $('settings-reset');
        if (settingsReset) {
            settingsReset.addEventListener('click', () => {
                if (confirm('⚠️ This will permanently delete ALL local and cloud profiles. Are you sure?')) {
                    localStorage.clear();
                    showToast('Data reset requested. Reloading...', 'info');
                    setTimeout(() => window.location.reload(), 1000);
                }
            });
        }

        const btnTestCloud = $('btn-test-cloud');
        if (btnTestCloud) {
            btnTestCloud.addEventListener('click', testCloudConnection);
        }

        const btnSeedCloud = $('btn-seed-cloud');
        if (btnSeedCloud) {
            btnSeedCloud.addEventListener('click', async () => {
                if (!confirm('This will create 3 mock profiles in Supabase. Proceed?')) return;
                btnSeedCloud.disabled = true;
                try {
                    const count = await window.Storage.seedCloud();
                    showToast(`Successfully seeded ${count} cloud records!`, 'success');
                    await renderAdminTab();
                } catch (e) {
                    showToast('Cloud seeding failed: ' + e.message, 'error');
                } finally {
                    btnSeedCloud.disabled = false;
                }
            });
        }

        const patientSearch = $('patientSearch');
        if (patientSearch) {
            patientSearch.addEventListener('input', async () => {
                await renderPatientsList(patientSearch.value.trim().toLowerCase());
            });
        }
    }

    async function syncPatient(id) {
        const p = await window.Storage.getPatientById(id);
        if (!p) return;
        
        showToast(`Attempting to sync ${p.fullName}...`, 'info');
        try {
            // Re-saving a patient without current ID will attempt cloud insert
            const result = await window.Storage.savePatient(p);
            if (result.cloudSynced) {
                showToast('✅ Cloud Sync Successful', 'success');
                // Persist the status by re-fetching all
                await window.Storage.getAllPatients(); 
                await renderAll();
                if (document.getElementById('tab-patients').style.display !== 'none') {
                    await renderPatientsList();
                }
            } else {
                showToast('❌ Sync Failed. Check login/connection.', 'error');
            }
        } catch (err) {
            showToast('Sync Error: ' + err.message, 'error');
        }
    }
    window.syncPatient = syncPatient;

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
        // Force Sync Button (Settings Tab)
        const btnForceSync = $('btn-force-sync');
        if (btnForceSync) {
            btnForceSync.addEventListener('click', async () => {
                const count = (await window.Storage.getAllPatients()).filter(p => !p.cloudSynced).length;
                if (count === 0) {
                    showToast('Everything is already in the cloud! ☁️', 'success');
                    return;
                }

                if (!confirm(`Found ${count} unsynced records. Force push to the cloud?`)) return;

                const progress = $('sync-progress');
                const bar = $('sync-bar');
                const text = $('sync-count');
                
                btnForceSync.disabled = true;
                if (progress) progress.style.display = 'block';

                try {
                    const result = await window.Storage.forceSyncAll();
                    showToast(`✅ Successfully synced ${result.synced}/${result.total} records!`, 'success');
                    await renderAll();
                } catch (e) {
                    showToast('Sync process failed: ' + e.message, 'error');
                } finally {
                    btnForceSync.disabled = false;
                    setTimeout(() => { if (progress) progress.style.display = 'none'; }, 2000);
                }
            });
        }
    }

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

    // ─── Patients List & Render (WhatsApp Style) ───
    async function renderPatientsList(filter = '') {
        const container = $('patientsTableWrap');
        if (!container) return;

        const all = await window.Storage.getAllPatients();
        txt('profiles-count-text', `${all.length} PROFILES`);

        if (all.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);">No profiles found</div>';
            return;
        }

        container.innerHTML = '';
        all.forEach(p => {
            const row = document.createElement('div');
            row.className = 'glass-card animate-slide';
            row.style.padding = '1rem';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.cursor = 'pointer';
            row.onclick = async () => {
                localStorage.setItem('current_patient_id', p.patientId);
                currentPatient = await window.Storage.getCurrentPatient();
                showToast(`Switched to ${p.fullName}`);
                // Switch to home tab
                document.querySelector('.nav-btn[data-tab="overview"]').click();
                renderAll();
            };

            const risk = window.Storage.calculateRiskLevel(p);
            const riskColors = { 'CRITICAL': '#e11d48', 'HIGH': '#f59e0b', 'MODERATE': '#2563eb', 'LOW': '#059669' };

            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.05); border:1px solid ${riskColors[risk]}; display:flex; align-items:center; justify-content:center; color:${riskColors[risk]}; font-weight:900;">
                        ${p.bloodGroup}
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:0.9375rem;">${p.fullName}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); display:flex; align-items:center; gap:0.5rem;">
                            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${riskColors[risk]};"></span>
                            ${risk} RISK • ${p.age}Y ${p.gender}
                        </div>
                    </div>
                </div>
                <i data-lucide="chevron-right" style="width:16px; color:var(--text-muted);"></i>
            `;
            container.appendChild(row);
        });
        lucide.createIcons();
    }

    async function switchTo(id) {
        const p = await window.Storage.getPatientById(id);
        if (p) {
            currentPatient = p;
            localStorage.setItem('current_patient_id', id);
            await renderAll();

            // Switch to overview tab using the unified system
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            const overviewTab = document.querySelector('[data-tab="tab-overview"]');
            if (overviewTab) overviewTab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const overviewContent = $('tab-overview');
            if (overviewContent) overviewContent.classList.add('active');

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
    // Theme Toggle Logic
    const themeBtn = $('theme-toggle');
    if (themeBtn) {
        themeBtn.onclick = () => {
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
            const icon = themeBtn.querySelector('i');
            icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
            lucide.createIcons();
            localStorage.setItem('sehat_theme', isDark ? 'light' : 'dark');
        };
        // Load saved theme
        const saved = localStorage.getItem('sehat_theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
            if (saved === 'light') themeBtn.querySelector('i').setAttribute('data-lucide', 'sun');
        }
    }

    window.Dashboard = {
        init,
        bootstrapUI,
        renderAll,
        renderPatientsList,
        renderRecentActivity
    };

    // Run Bootstrap immediately
    bootstrapUI();
    init();
})();
