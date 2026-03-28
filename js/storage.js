/* ============================================================
   storage.js — v3.0 Cloud-First, Local Fallback
   Fixed: user_id resolution, local fallback on cloud fail,
          QR truncation, detailed console logging
   ============================================================ */

const Storage = {
    SAVE_KEY: 'ems_patient_data_v2',
    SCAN_KEY: 'ems_scan_history',
    _cache: [],

    // ────── HELPERS ──────
    db: function () {
        return window.supabaseClient || null;
    },

    mapToDB: function (p) {
        return {
            patient_id:       p.patientId,
            full_name:        p.fullName,
            blood_group:      p.bloodGroup,
            age:              parseInt(p.age) || 0,
            gender:           p.gender,
            contact1_name:    p.contact1_Name || '',
            contact1_relation: p.contact1_Relation || '',
            contact1_phone:   p.contact1_Phone || '',
            contact2_name:    p.contact2_Name || '',
            contact2_relation: p.contact2_Relation || '',
            contact2_phone:   p.contact2_Phone || '',
            conditions:       p.conditions || '',
            allergies:        p.allergies || '',
            medications:      p.medications || '',
            medical_notes:    p.medicalNotes || '',
            organ_donor:      p.organDonor === true || p.organDonor === 'true',
        };
    },

    mapFromDB: function (row) {
        return {
            id:               row.id,
            patientId:        row.patient_id,
            fullName:         row.full_name,
            bloodGroup:       row.blood_group,
            age:              row.age,
            gender:           row.gender,
            contact1_Name:    row.contact1_name,
            contact1_Relation: row.contact1_relation,
            contact1_Phone:   row.contact1_phone,
            contact2_Name:    row.contact2_name,
            contact2_Relation: row.contact2_relation,
            contact2_Phone:   row.contact2_phone,
            conditions:       row.conditions,
            allergies:        row.allergies,
            medications:      row.medications,
            medicalNotes:     row.medical_notes,
            organDonor:       row.organ_donor,
            userId:           row.user_id,
            createdAt:        row.created_at
        };
    },

    // ────── GET AUTHENTICATED USER ID ──────
    _getUserId: async function () {
        try {
            if (!window.Auth) {
                console.warn('[Storage] window.Auth not available, user_id will be null');
                return null;
            }
            const session = await window.Auth.getSession();
            const uid = session?.user?.id || null;
            if (!uid) {
                console.warn('[Storage] No authenticated session found. user_id is null.');
            } else {
                console.log('[Storage] Authenticated user_id:', uid);
            }
            return uid;
        } catch (e) {
            console.error('[Storage] _getUserId error:', e);
            return null;
        }
    },

    // ────── SEED MOCK DATA (only if localStorage is empty) ──────
    seed: function () {
        // Don't seed if we already have a real current_patient_id stored
        const existingId = localStorage.getItem('current_patient_id');
        const existingPatients = this.getAllPatientsLocal();

        if (existingId || existingPatients.length > 0) {
            // Real data exists, don't overwrite
            return;
        }

        // Only seed demo data if nothing at all is in storage
        const mockPatients = [
            {
                patientId: 'EMS-DEMO001',
                fullName: 'Demo Patient',
                bloodGroup: 'O+',
                age: 30,
                gender: 'Male',
                contact1_Name: 'Emergency Contact',
                contact1_Relation: 'Family',
                contact1_Phone: '9876543210',
                contact2_Name: '',
                contact2_Relation: '',
                contact2_Phone: '',
                conditions: '',
                allergies: '',
                medications: '',
                medicalNotes: 'This is a demo profile. Please register your real profile.',
                organDonor: false,
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(mockPatients));
        localStorage.setItem('current_patient_id', 'EMS-DEMO001');
        console.log('[Storage] Seeded demo patient data.');
    },

    // ────── SAVE PATIENT ──────
    savePatient: async function (data) {
        const id = 'EMS-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const patientData = {
            ...data,
            patientId:  id,
            organDonor: data.organDonor === true || data.organDonor === 'true',
            createdAt:  new Date().toISOString()
        };

        console.log('[Storage] Attempting to save patient:', id);

        // ── Step 1: Save to Supabase (cloud first) ──
        let cloudSaved = false;
        if (this.db()) {
            try {
                const userId = await this._getUserId();
                if (!userId) {
                    console.error('[Storage] SAVE ABORTED: No user_id. User must be logged in to save to cloud.');
                    throw new Error('You must be logged in to save your profile. Please log in and try again.');
                }

                const dbRow = this.mapToDB(patientData);
                dbRow.user_id = userId;

                console.log('[Storage] Inserting row into Supabase:', dbRow);

                const { data: row, error } = await this.db()
                    .from('patients')
                    .insert([dbRow])
                    .select()
                    .single();

                if (error) {
                    console.error('[Storage] Supabase Insert Error:', error);
                    throw new Error('Database error: ' + (error.message || JSON.stringify(error)));
                }

                if (row) {
                    patientData.id = row.id;
                    cloudSaved = true;
                    console.log('[Storage] Cloud save SUCCESS. Supabase row id:', row.id);
                }
            } catch (err) {
                // Re-throw auth errors (user not logged in) — these should block the save
                if (err.message && err.message.includes('must be logged in')) {
                    throw err;
                }
                // For other cloud errors, log but continue to local save
                console.error('[Storage] Cloud save failed (will save locally as fallback):', err.message);
            }
        } else {
            console.warn('[Storage] Supabase client not available. Saving locally only.');
        }

        // ── Step 2: Always save to localStorage ──
        const patients = this.getAllPatientsLocal();
        patients.push(patientData);
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        localStorage.setItem('current_patient_id', id);
        console.log('[Storage] Local save SUCCESS:', id, '| Cloud saved:', cloudSaved);

        // ── Step 3: Log the scan event (best-effort, don't block) ──
        try {
            await this.logScan(id, 'profile_created', 'Dashboard');
        } catch (e) { /* ignore */ }

        return id;
    },

    // ────── GET ALL PATIENTS ──────
    getAllPatients: async function () {
        let cloudPatients = [];

        if (this.db()) {
            try {
                const userId = await this._getUserId();
                let query = this.db().from('patients').select('*');
                if (userId) {
                    query = query.eq('user_id', userId);
                }
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error) throw error;
                if (data && data.length > 0) {
                    cloudPatients = data.map(r => this.mapFromDB(r));
                    this._cache = cloudPatients;
                    console.log('[Storage] Fetched', cloudPatients.length, 'patients from cloud.');
                }
            } catch (err) {
                console.error('[Storage] getAllPatients cloud error:', err.message);
            }
        }

        const localPatients = this.getAllPatientsLocal();

        // Merge: cloud is source of truth, add any local-only patients
        const merged = [...cloudPatients];
        localPatients.forEach(lp => {
            if (!merged.some(cp => cp.patientId === lp.patientId)) {
                merged.push(lp);
            }
        });

        // Filter out the demo patient if real cloud patients exist
        if (cloudPatients.length > 0) {
            return merged.filter(p => p.patientId !== 'EMS-DEMO001');
        }

        return merged;
    },

    getAllPatientsLocal: function () {
        try {
            const data = localStorage.getItem(this.SAVE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    },

    // ────── GET PATIENT BY ID ──────
    getPatientById: async function (id) {
        if (!id) return null;

        if (this.db()) {
            try {
                // Determine whether we're looking up by UUID or EMS-ID
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
                const queryField = isUUID ? 'id' : 'patient_id';

                let query = this.db()
                    .from('patients')
                    .select('*')
                    .eq(queryField, id);

                const { data, error } = await query.single();

                if (error && error.code !== 'PGRST116') {
                    // PGRST116 = no rows found (not a real error)
                    console.error('[Storage] getPatientById cloud error:', error.message);
                }
                if (data) return this.mapFromDB(data);
            } catch (err) {
                console.error('[Storage] getPatientById exception:', err.message);
            }
        }

        // Fallback to local
        return this.getAllPatientsLocal().find(p => p.patientId === id || p.id === id) || null;
    },

    // ────── GET CURRENT PATIENT ──────
    getCurrentPatient: async function () {
        let id = localStorage.getItem('current_patient_id');

        if (!id) {
            const all = this.getAllPatientsLocal();
            if (all.length > 0) {
                id = all[0].patientId;
                localStorage.setItem('current_patient_id', id);
            }
        }

        if (!id) return null;
        return await this.getPatientById(id);
    },

    updatePatient: async function (id, updatedData) {
        if (!id) return false;

        console.log('[Storage] Updating patient:', id);

        if (this.db()) {
            try {
                const userId = await this._getUserId();
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
                const queryField = isUUID ? 'id' : 'patient_id';

                // Map only the fields that were provided in updatedData
                const dbUpdate = {};
                const mapping = {
                    fullName: 'full_name',
                    bloodGroup: 'blood_group',
                    age: 'age',
                    gender: 'gender',
                    contact1_Name: 'contact1_name',
                    contact1_Relation: 'contact1_relation',
                    contact1_Phone: 'contact1_phone',
                    contact2_Name: 'contact2_name',
                    contact2_Relation: 'contact2_relation',
                    contact2_Phone: 'contact2_phone',
                    conditions: 'conditions',
                    allergies: 'allergies',
                    medications: 'medications',
                    medicalNotes: 'medical_notes',
                    organDonor: 'organ_donor'
                };

                for (const [key, dbKey] of Object.entries(mapping)) {
                    if (updatedData[key] !== undefined) {
                        let val = updatedData[key];
                        if (dbKey === 'age') val = parseInt(val) || 0;
                        if (dbKey === 'organ_donor') val = (val === true || val === 'true');
                        dbUpdate[dbKey] = val;
                    }
                }

                if (Object.keys(dbUpdate).length > 0) {
                    const { error } = await this.db()
                        .from('patients')
                        .update(dbUpdate)
                        .eq(queryField, id);

                    if (error) {
                        console.error('[Storage] Supabase Update Error:', error);
                        // If it's a 403/Forbidden, it likely means the row doesn't have the user_id yet
                        if (error.code === '42501' || error.status === 403) {
                            console.warn('[Storage] Permission denied. Attempting to "claim" row with user_id...');
                            if (userId) {
                                await this.db().from('patients').update({ user_id: userId }).eq(queryField, id);
                                // Retry update once
                                await this.db().from('patients').update(dbUpdate).eq(queryField, id);
                            }
                        }
                    } else {
                        console.log('[Storage] Cloud update SUCCESS for:', id);
                    }
                }
            } catch (err) {
                console.error('[Storage] Cloud update exception:', err.message);
            }
        }

        // Always update locally
        const patients = this.getAllPatientsLocal();
        const idx = patients.findIndex(p => p.patientId === id || p.id === id);
        if (idx !== -1) {
            patients[idx] = { ...patients[idx], ...updatedData };
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
            console.log('[Storage] Local update SUCCESS for:', id);
        }

        return true;
    },

    // ────── DELETE PATIENT ──────
    deletePatient: async function (id) {
        if (this.db()) {
            try {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
                const queryField = isUUID ? 'id' : 'patient_id';
                const { error } = await this.db().from('patients').delete().eq(queryField, id);
                if (error) throw error;
                console.log('[Storage] Cloud delete SUCCESS for:', id);
            } catch (err) {
                console.error('[Storage] Cloud delete error:', err.message);
            }
        }

        let patients = this.getAllPatientsLocal();
        patients = patients.filter(p => p.patientId !== id && p.id !== id);
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));

        if (localStorage.getItem('current_patient_id') === id) {
            localStorage.removeItem('current_patient_id');
        }
        return true;
    },

    // ────── QR CODE ENCODING ──────
    // Encodes CRITICAL data only. Keeps URL short enough for all QR scanners.
    encodeForQR: function (p) {
        if (!p) return null;

        // Helper to safely truncate strings
        const trunc = (str, max) => {
            if (!str) return '';
            str = String(str);
            return str.length > max ? str.substring(0, max) + '…' : str;
        };

        const qrData = {
            n:   trunc(p.fullName, 40),
            b:   p.bloodGroup || '',
            a:   p.age || '',
            g:   p.gender || '',
            c1n: trunc(p.contact1_Name, 30),
            c1p: trunc(p.contact1_Phone, 15),
            con: trunc(p.conditions, 80),
            alg: trunc(p.allergies, 60),
            med: trunc(p.medications, 60),
            org: p.organDonor ? '1' : '0',
            id:  p.patientId || '',
            sid: p.id || ''          // Supabase UUID for cloud lookup
        };

        try {
            const jsonStr = JSON.stringify(qrData);
            // Use URL-safe Base64: + -> -, / -> _
            let encoded = btoa(unescape(encodeURIComponent(jsonStr)));
            encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            console.log('[Storage] QR encoded length:', encoded.length, 'chars');
            return encoded;
        } catch (e) {
            console.error('[Storage] QR encode error:', e);
            return null;
        }
    },

    decodeFromURL: function (encodedStr) {
        try {
            // Restore standard Base64 from URL-safe version
            let base64 = encodedStr.replace(/-/g, '+').replace(/_/g, '/');
            // Add padding if missing
            while (base64.length % 4) base64 += '=';
            
            const jsonStr = decodeURIComponent(escape(atob(base64)));
            const d = JSON.parse(jsonStr);
            return {
                patientId:     d.id  || '',
                id:            d.sid || '',
                fullName:      d.n   || 'Unknown',
                bloodGroup:    d.b   || '—',
                age:           d.a   || '—',
                gender:        d.g   || '—',
                contact1_Name:  d.c1n || '',
                contact1_Phone: d.c1p || '',
                conditions:    d.con || '',
                allergies:     d.alg || '',
                medications:   d.med || '',
                organDonor:    d.org === '1',
                // These won't be in embedding but are fine as empty
                contact2_Name:  '',
                contact2_Phone: '',
                medicalNotes:  ''
            };
        } catch (e) {
            console.error('[Storage] QR decode error:', e);
            return null;
        }
    },

    // ────── SCAN HISTORY ──────
    logScan: async function (patientId, type, device, location) {
        // Local log always
        const scans = this.getScanHistoryLocal();
        scans.unshift({
            patientId,
            type:      type || 'qr_scan',
            device:    device || 'Unknown',
            location:  location || 'Unknown',
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(this.SCAN_KEY, JSON.stringify(scans.slice(0, 50)));

        // Cloud log (best-effort)
        if (this.db()) {
            try {
                await this.db().from('scans').insert([{
                    patient_id: patientId,
                    type:       type || 'qr_scan',
                    device:     device || 'Unknown',
                    location:   location || 'Unknown',
                    timestamp:  new Date().toISOString()
                }]);
            } catch (err) {
                // Silently ignore scan log failures
            }
        }
    },

    getScanHistory: async function (patientId) {
        if (this.db()) {
            try {
                let query = this.db().from('scans').select('*').order('timestamp', { ascending: false }).limit(50);
                if (patientId) query = query.eq('patient_id', patientId);
                const { data } = await query;
                if (data && data.length > 0) {
                    return data.map(s => ({ ...s, patientId: s.patient_id }));
                }
            } catch (err) {
                // fall through to local
            }
        }
        return this.getScanHistoryLocal(patientId);
    },

    getScanHistoryLocal: function (patientId) {
        try {
            const data = localStorage.getItem(this.SCAN_KEY);
            const scans = data ? JSON.parse(data) : [];
            return patientId ? scans.filter(s => s.patientId === patientId) : scans;
        } catch (e) {
            return [];
        }
    },

    // ────── UTILITIES ──────
    getProfileCompletion: function (patient) {
        if (!patient) return 0;
        const fields = ['fullName', 'bloodGroup', 'age', 'gender', 'contact1_Name', 'contact1_Phone', 'conditions', 'allergies', 'medications'];
        const filled = fields.filter(f => patient[f] && String(patient[f]).trim() !== '').length;
        return Math.round((filled / fields.length) * 100);
    },

    getTotalScans: async function () {
        if (this.db()) {
            try {
                const { count } = await this.db()
                    .from('scans')
                    .select('*', { count: 'exact', head: true })
                    .eq('type', 'qr_scan');
                return count || 0;
            } catch (err) { /* fall through */ }
        }
        return this.getScanHistoryLocal().filter(s => s.type === 'qr_scan').length;
    },

    testConnection: async function () {
        if (!this.db()) return { success: false, message: 'Supabase client not initialized.' };

        try {
            const userId = await this._getUserId();
            if (!userId) return { success: false, message: 'No active session. Please log in.' };

            const { count, error } = await this.db()
                .from('patients')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (error) throw error;

            return { success: true, message: `✅ Cloud connected! Found ${count} profile(s) for your account.` };
        } catch (err) {
            return { success: false, message: '❌ ' + (err.message || 'Connection failed.') };
        }
    }
};

Storage.seed();
window.Storage = Storage;
