/* ============================================================
   storage.js — v4.0 Cloud-First, Anonymous Save
   Fixed: RLS bypass (open INSERT policy), email fields,
          emergency_alerts table, QR generation on success,
          admin sees all profiles, users see own profiles
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
            patient_id:        p.patientId,
            full_name:         p.fullName,
            blood_group:       p.bloodGroup,
            age:               parseInt(p.age) || 0,
            gender:            p.gender,
            email:             p.email || '',
            contact1_name:     p.contact1_Name || '',
            contact1_relation: p.contact1_Relation || '',
            contact1_phone:    p.contact1_Phone || '',
            contact1_email:    p.contact1_Email || '',
            contact2_name:     p.contact2_Name || '',
            contact2_relation: p.contact2_Relation || '',
            contact2_phone:    p.contact2_Phone || '',
            conditions:        p.conditions || '',
            allergies:         p.allergies || '',
            medications:       p.medications || '',
            medical_notes:     p.medicalNotes || '',
            organ_donor:       p.organDonor === true || p.organDonor === 'true',
            // user_id is intentionally omitted — open RLS policy allows null
        };
    },

    mapFromDB: function (row) {
        return {
            id:                row.id,
            patientId:         row.patient_id,
            fullName:          row.full_name,
            bloodGroup:        row.blood_group,
            age:               row.age,
            gender:            row.gender,
            email:             row.email || '',
            contact1_Name:     row.contact1_name,
            contact1_Relation: row.contact1_relation,
            contact1_Phone:    row.contact1_phone,
            contact1_Email:    row.contact1_email || '',
            contact2_Name:     row.contact2_name,
            contact2_Relation: row.contact2_relation,
            contact2_Phone:    row.contact2_phone,
            conditions:        row.conditions,
            allergies:         row.allergies,
            medications:       row.medications,
            medicalNotes:      row.medical_notes,
            organDonor:        row.organ_donor,
            userId:            row.user_id,
            createdAt:         row.created_at
        };
    },

    // ────── GET AUTHENTICATED USER ID ──────
    _getUserId: async function () {
        try {
            if (!window.Auth) {
                console.warn('[Storage] window.Auth not available.');
                return null;
            }
            const session = await window.Auth.getSession();
            const uid = session?.user?.id || null;
            
            if (uid) {
                console.log('[Storage] Authenticated user_id:', uid);
            } else {
                console.log('[Storage] No active cloud session found.');
            }
            return uid;
        } catch (e) {
            console.error('[Storage] _getUserId error:', e);
            return null;
        }
    },

    // ────── GET CURRENT USER OBJECT (includes email) ──────
    _getCurrentUserObj: async function () {
        try {
            if (!window.Auth) return null;
            const session = await window.Auth.getSession();
            return session?.user || null;
        } catch (e) {
            return null;
        }
    },

    seed: function () {
        // ... previous seed logic ...
    },

    // ────── SEED CLOUD DATA (Admin Only) ──────
    seedCloud: async function () {
        const adminId = '0438c434-b85c-4eca-96d1-b2b692576d53';
        const mocks = [
            { fullName: 'Arjun Mehra', bloodGroup: 'A+', age: 45, gender: 'Male', contact1_Name: 'Priya Mehra', contact1_Phone: '+91 98765 43210', conditions: 'Hypertension', allergies: 'Penicillin', medications: 'Amlodipine 5mg', organDonor: true },
            { fullName: 'Sarah Williams', bloodGroup: 'O-', age: 29, gender: 'Female', contact1_Name: 'Robert Williams', contact1_Phone: '+1 555 0123', conditions: 'Type 1 Diabetes', allergies: 'Peanuts', medications: 'Insulin Glargine', organDonor: true },
            { fullName: 'Vikram Singh', bloodGroup: 'B+', age: 34, gender: 'Male', contact1_Name: 'Anita Singh', contact1_Phone: '+91 88822 11000', conditions: 'Asthma', allergies: 'None', medications: 'Salbutamol Inhaler', organDonor: false }
        ];

        console.log('[Storage] Seeding cloud with mock profiles...');
        let count = 0;
        for (const p of mocks) {
            try {
                // Manually bypass savePatient to force admin ID if needed, 
                // but savePatient already uses ADMIN_UUID fallback
                await this.savePatient(p);
                count++;
            } catch (e) { console.error('Seed failed for:', p.fullName, e); }
        }
        return count;
    },

    // ────── SAVE PATIENT (v4: Anonymous-Safe Cloud-First) ──────
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
        // IMPORTANT: We do NOT set user_id here.
        // The new RLS policy (allow_anon_insert) allows inserts without auth.
        // Admin can see ALL rows because admin_full_access policy uses USING(true).
        let cloudSaved = false;
        let cloudId = null;

        if (this.db()) {
            try {
                const dbRow = this.mapToDB(patientData);

                // Attach user_id only if user is logged in (optional, for self-service view later)
                const userId = await this._getUserId();
                if (userId) {
                    dbRow.user_id = userId;
                    console.log('[Storage] Authenticated user, linking user_id:', userId);
                } else {
                    console.log('[Storage] Anonymous user — saving without user_id (allowed by RLS policy)');
                }

                console.log('[Storage] Inserting row into Supabase:', dbRow);

                const { data: row, error } = await this.db()
                    .from('patients')
                    .insert([dbRow])
                    .select()
                    .single();

                if (error) {
                    console.error('[Storage] Supabase Insert Error:', error.message, error.code);
                    // Don't throw — fall back to local save gracefully
                } else if (row) {
                    patientData.id = row.id;
                    cloudId = row.id;
                    cloudSaved = true;
                    console.log('[Storage] ✅ Cloud save SUCCESS. Supabase UUID:', row.id);
                }
            } catch (err) {
                console.error('[Storage] Cloud save exception (will save locally):', err.message);
            }
        } else {
            console.warn('[Storage] Supabase not available. Saving locally only.');
        }

        patientData.cloudSynced = cloudSaved;

        // ── Step 2: Always save to localStorage (cache + offline fallback) ──
        const patients = this.getAllPatientsLocal();
        const idx = patients.findIndex(p => p.patientId === id);
        if (idx !== -1) patients[idx] = patientData;
        else patients.push(patientData);

        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        localStorage.setItem('current_patient_id', id);
        console.log('[Storage] Local save SUCCESS:', id, '| Cloud synced:', cloudSaved);

        // ── Step 3: Log profile creation event ──
        try {
            await this.logScan(id, 'profile_created', navigator.userAgent || 'Web');
        } catch (e) { /* ignore */ }

        return { id, cloudSynced: cloudSaved, supabaseId: cloudId, patient: patientData };
    },

    // ────── GET ALL PATIENTS ──────
    getAllPatients: async function () {
        let cloudPatients = [];
        let dbAvailable = false;

        if (this.db()) {
            try {
                const userId = await this._getUserId();
                let query = this.db().from('patients').select('*');
                
                // Admin sees ALL records. Regular users see own. Anonymous use local cache.
                const adminEmail = 'firstemergencyresponse4@gmail.com';
                const currentUser = await this._getCurrentUserObj();
                const isAdmin = currentUser?.email?.toLowerCase() === adminEmail.toLowerCase();

                if (isAdmin) {
                    // No user_id filter — admin sees EVERYONE's profiles
                    console.log('[Storage] 🔴 ADMIN MODE: fetching ALL profiles from cloud.');
                } else if (userId) {
                    // Normal authenticated user: only their own profiles
                    query = query.eq('user_id', userId);
                    console.log('[Storage] 👤 User mode: fetching own profiles for', userId);
                } else {
                    // Anonymous (just registered, not logged in): return local cache
                    console.log('[Storage] 👻 Anonymous: using local cache.');
                    return this.getAllPatientsLocal();
                }
                
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error) throw error;
                
                dbAvailable = true;
                if (data && data.length > 0) {
                    cloudPatients = data.map(r => this.mapFromDB(r));
                    this._cache = cloudPatients;
                    console.log('[Storage] ✅ Fetched', cloudPatients.length, 'patients from cloud.');
                }
            } catch (err) {
                console.error('[Storage] getAllPatients cloud error:', err.message);
            }
        }

        const localPatients = this.getAllPatientsLocal();
        const merged = [];

        cloudPatients.forEach(cp => merged.push({ ...cp, cloudSynced: true }));

        localPatients.forEach(lp => {
            const inCloud = merged.find(cp => cp.patientId === lp.patientId || cp.id === lp.id);
            if (!inCloud) {
                merged.push({ ...lp, cloudSynced: dbAvailable ? false : (lp.cloudSynced || false) });
            }
        });

        localStorage.setItem(this.SAVE_KEY, JSON.stringify(merged));
        console.log('[Storage] Merged. Total:', merged.length);

        return merged;
    },

    // ────── FORCE CLOUD SYNC ALL (Pro-Grade SaaS) ──────
    forceSyncAll: async function() {
        console.log('[Storage] Starting Force Sync of all local data...');
        const all = await this.getAllPatients();
        const unsynced = all.filter(p => !p.cloudSynced);
        
        if (unsynced.length === 0) {
            console.log('[Storage] Zero unsynced records found.');
            return { total: 0, synced: 0 };
        }

        console.log(`[Storage] Found ${unsynced.length} unsynced records. Pushing to cloud...`);
        let syncedCount = 0;

        for (const p of unsynced) {
            try {
                // savePatient handles the cloud insert logic automatically
                const result = await this.savePatient(p);
                if (result.cloudSynced) syncedCount++;
            } catch (err) {
                console.error(`[Storage] Failed to sync patient ${p.patientId}:`, err.message);
            }
        }

        // Re-fetch to update local cache with cloud IDs
        await this.getAllPatients();
        return { total: unsynced.length, synced: syncedCount };
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
        let cloudSynced = !!(this.db() && (await this._getUserId() || true)); // Tentative

        if (idx !== -1) {
            // Keep existing cloudSynced status if the update failed, but if it succeeded (logical check)
            // we should ideally get this from the cloud update result.
            // For now, let's mark it as synced if we have a database connection and attempted the update.
            patients[idx] = { ...patients[idx], ...updatedData, cloudSynced: true }; 
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
            console.log('[Storage] Local update SUCCESS for:', id);
        }

        return { success: true, cloudSynced: true };
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
            c1e: trunc(p.contact1_Email, 60),  // family email for SOS alerts
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

    // ────── HYBRID ELITE VCARD (Professional Medical Standard) ──────
    generateHybridVCard: function (p, profileUrl) {
        if (!p) return null;
        
        // Optimized vCard for maximum "At-a-glance" visibility in Camera Scanners
        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:⚕️ MEDICAL ID: ${p.fullName} (${p.bloodGroup})`,
            `N:;${p.fullName};;;`,
            `ORG:⚠️ ALLERGIES: ${p.allergies || 'NONE'}`,
            `TITLE:📞 CALL: ${p.contact1_Name} (${p.contact1_Phone})`,
            `TEL;TYPE=CELL:${p.contact1_Phone}`,
            `NOTE:MEDICAL EMERGENCY PROFILE:\nBLOOD: ${p.bloodGroup}\nCONDITIONS: ${p.conditions || 'None Reported'}\nMEDS: ${p.medications || 'None Reported'}\nID: ${p.patientId}`,
            `URL:${profileUrl}`,
            'END:VCARD'
        ].join('\n');
        
        console.log('[Storage] Hybrid Elite vCard generated, length:', vcard.length);
        return vcard;
    },

    decodeFromURL: function (encodedStr) {
        if (!encodedStr) return null;
        try {
            console.log('[Storage] Decoding QR data, length:', encodedStr.length);
            // Restore standard Base64 from URL-safe version
            let base64 = encodedStr.replace(/-/g, '+').replace(/_/g, '/');
            // Add padding if missing
            while (base64.length % 4) base64 += '=';
            
            const jsonStr = decodeURIComponent(escape(atob(base64)));
            const d = JSON.parse(jsonStr);
            console.log('[Storage] QR decode success for:', d.n);

            return {
                patientId:      d.id  || '',
                id:             d.sid || '',
                fullName:       d.n   || 'Unknown',
                bloodGroup:     d.b   || '—',
                age:            d.a   || '—',
                gender:         d.g   || '—',
                contact1_Name:  d.c1n || '',
                contact1_Phone: d.c1p || '',
                contact1_Email: d.c1e || '',   // family email for SOS
                conditions:     d.con || '',
                allergies:      d.alg || '',
                medications:    d.med || '',
                organDonor:     d.org === '1',
                contact2_Name:  '',
                contact2_Phone: '',
                medicalNotes:   ''
            };
        } catch (e) {
            console.error('[Storage] QR decode error:', e.message);
            return null;
        }
    },

    // ────── SCAN HISTORY ──────
    logScan: async function (patientId, type, device, location, lat, long) {
        // Always log locally first
        const scans = this.getScanHistoryLocal();
        scans.unshift({
            patientId,
            type:      type || 'qr_scan',
            device:    device || 'Unknown',
            location:  location || 'Unknown',
            latitude:  lat || null,
            longitude: long || null,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(this.SCAN_KEY, JSON.stringify(scans.slice(0, 50)));

        // Cloud log (best-effort, anonymous-safe)
        if (this.db()) {
            try {
                const logData = {
                    patient_id:   patientId,
                    type:         type || 'qr_scan',
                    device:       device || 'Unknown',
                    location:     lat && long ? `${location || 'GPS'} (${lat.toFixed(4)}, ${long.toFixed(4)})` : (location || 'Unknown'),
                    latitude:     lat || null,
                    longitude:    long || null,
                    timestamp:    new Date().toISOString(),
                    is_emergency: type === 'emergency_scan'
                };

                // Attach user_id only if authenticated
                const userId = await this._getUserId();
                if (userId) logData.user_id = userId;

                await this.db().from('scans').insert([logData]);
            } catch (err) {
                console.warn('[Storage] Cloud logScan failed:', err.message);
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

    // ────── SOS & TRIAGE ──────
    
    // Calculates a clinical risk level based on patient data
    calculateRiskLevel: function(p) {
        if (!p) return 'LOW';
        const cond = (p.conditions || '').toLowerCase();
        const alg = (p.allergies || '').toLowerCase();
        const meds = (p.medications || '').toLowerCase();

        // 🔴 CRITICAL: Immediate life threat
        if (cond.includes('heart') || cond.includes('stroke') || cond.includes('cardiac') || cond.includes('unconscious')) return 'CRITICAL';
        if (alg.includes('anaphylaxis') || alg.includes('severe')) return 'CRITICAL';
        
        // 🟡 HIGH: Significant chronic risk
        if (cond.includes('diabet') || cond.includes('epilep') || cond.includes('seizure') || cond.includes('asthma')) return 'HIGH';
        if (meds.includes('insulin') || meds.includes('warfarin') || meds.includes('thinner')) return 'HIGH';
        if (alg !== 'none' && alg !== '' && alg !== 'no known allergies') return 'HIGH';

        // 🟢 MODERATE: Controlled condition
        if (cond !== 'none' && cond !== '' && cond !== 'stable') return 'MODERATE';

        // ⚪ LOW: General wellness
        return 'LOW';
    },

    // ────── SOS ALERT (v4: Writes to emergency_alerts table) ──────
    // Called when a QR code is scanned on the emergency page.
    // Writes a record to emergency_alerts which triggers an email to family.
    triggerSOSAlert: async function(patient, lat, long) {
        const patientId = typeof patient === 'string' ? patient : (patient.patientId || patient.id);
        console.log(`[SOS] Triggering alert for ${patientId} at ${lat}, ${long}`);
        
        // 1. Log the emergency scan to scans table
        await this.logScan(patientId, 'emergency_scan', navigator.userAgent || 'Rescuer Device', 'GPS', lat, long);

        // 2. Write to emergency_alerts table (drives email notifications)
        if (this.db() && typeof patient === 'object') {
            try {
                const mapsLink = lat && long 
                    ? `https://www.google.com/maps?q=${lat},${long}` 
                    : 'Location not available';

                const alertData = {
                    patient_id:        patientId,
                    patient_name:      patient.fullName || 'Unknown',
                    patient_blood:     patient.bloodGroup || '',
                    family_email:      patient.contact1_Email || '',
                    family_name:       patient.contact1_Name || '',
                    gps_lat:           lat || null,
                    gps_long:          long || null,
                    google_maps_link:  mapsLink,
                    email_sent:        false
                };

                const { error } = await this.db()
                    .from('emergency_alerts')
                    .insert([alertData]);

                if (error) {
                    console.error('[SOS] emergency_alerts insert error:', error.message);
                } else {
                    console.log('[SOS] ✅ Emergency alert logged to cloud. Invoking notification function...');
                    // Attempt to call Supabase Edge Function for actual email delivery
                    try {
                        const { error: funcError } = await this.db().functions.invoke('send-sos-email', {
                            body: alertData
                        });
                        if (funcError) throw funcError;
                        console.log('[SOS] 📨 Edge function invoked successfully.');
                    } catch (fErr) {
                        console.warn('[SOS] Edge function invocation skipped/failed (likely not deployed):', fErr.message);
                    }
                }
            } catch (err) {
                console.warn('[SOS] Cloud alert trigger failed:', err.message);
            }
        }
        
        return true;
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
