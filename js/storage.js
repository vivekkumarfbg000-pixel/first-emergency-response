/* ============================================================
   storage.js — v4.1 Clinical-Grade Storage & SOS Data Layer
   Features: Cloud-First Sync, Local Fallback, Real-time Activity,
             Automated SOS Triggering, and Admin Data Visibility.
   ============================================================ */

const Storage = {
    SAVE_KEY: 'ems_patient_data_v2',
    SCAN_KEY: 'ems_scan_history',
    _cache: [],
    MASTER_ADMIN_EMAIL: 'firstemergencyresponse4@gmail.com',
    MASTER_ADMIN_UUID: '0438c434-b85c-4eca-96d1-b2b692576d53',

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
            emergencyContact:  p.emergencyContact || '',
            conditions:        p.conditions || '',
            allergies:         p.allergies || '',
            medications:       p.medications || '',
            medical_notes:     p.medicalNotes || '',
            organ_donor:       p.organDonor === true || p.organDonor === 'true',
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
            emergencyContact:  row.emergencyContact,
            conditions:        row.conditions,
            allergies:         row.allergies,
            medications:       row.medications,
            medicalNotes:      row.medical_notes,
            organDonor:        row.organ_donor,
            userId:            row.user_id,
            createdAt:         row.created_at,
            updatedAt:         row.updated_at
        };
    },

    _getUserId: async function () {
        try {
            if (!window.Auth) return null;
            const session = await window.Auth.getSession();
            return session?.user?.id || null;
        } catch (e) { return null; }
    },

    _getCurrentUserObj: async function () {
        try {
            if (!window.Auth) return null;
            const session = await window.Auth.getSession();
            return session?.user || null;
        } catch (e) { return null; }
    },

    _isAdminUser: async function () {
        // Check for master bypass first (for session persistence)
        if (localStorage.getItem('master_bypass') === 'true') return true;
        
        const user = await this._getCurrentUserObj();
        if (!user) return false;
        
        // 1. Direct Email Match
        const email = (user.email || '').trim().toLowerCase();
        if (email === this.MASTER_ADMIN_EMAIL.toLowerCase()) return true;

        // 2. Database Check (Fallback)
        if (this.db()) {
            try {
                const { data, error } = await this.db()
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', user.id)
                    .single();
                if (!error && data?.role === 'admin') return true;
            } catch (e) {}
        }
        return false;
    },

    _getAssignedOwnerId: async function () {
        const userId = await this._getUserId();
        return userId || this.MASTER_ADMIN_UUID;
    },

    buildEmergencyUrl: function (patient) {
        if (!patient) return '';
        const origin = window.location.origin;
        const identifier = patient.id || patient.patientId;
        if (identifier) {
            return `${origin}/emergency.html?sid=${encodeURIComponent(identifier)}`;
        } else {
            const encoded = this.encodeForQR(patient);
            if (encoded) return `${origin}/emergency.html?d=${encoded}`;
            return `${origin}/emergency.html`;
        }
    },

    buildQRPayload: function (patient) {
        if (!patient) return '';
        const url = this.buildEmergencyUrl(patient);
        const name = patient.fullName || 'Emergency Profile';
        const phone = patient.emergencyContact || patient.contact1_Phone || patient.contact1_phone || '';
        const note = `Blood: ${patient.bloodGroup || 'Unspecified'}\\nAllergies: ${patient.allergies || 'None listed'}`;
        
        return `BEGIN:VCARD
VERSION:3.0
N:${name};;;
FN:${name} (Medical Emergency)
TEL;TYPE=CELL,VOICE:${phone}
URL:${url}
NOTE:${note}
END:VCARD`;
    },

    seed: function () {
        // Initial setup if needed
    },

    savePatient: async function (data) {
        const id = data.patientId || ('EMS-' + Math.random().toString(36).substr(2, 6).toUpperCase());
        const patientData = {
            ...data,
            patientId:  id,
            organDonor: data.organDonor === true || data.organDonor === 'true',
            createdAt:  data.createdAt || new Date().toISOString(),
            updatedAt:  new Date().toISOString()
        };

        let cloudSaved = false;
        let cloudId = null;
        let cloudError = null;

        if (this.db()) {
            try {
                const dbRow = this.mapToDB(patientData);
                // Only assign current user if this is a self-service registration
                if (!patientData.isManaged) {
                    dbRow.user_id = await this._getAssignedOwnerId();
                } else {
                    dbRow.user_id = null; // Unassigned, admin-managed
                }
                const { data: row, error } = await this.db().from('patients').insert([dbRow]).select().single();
                if (error) {
                    cloudError = error.message;
                } else if (row) {
                    patientData.id = row.id;
                    cloudId = row.id;
                    cloudSaved = true;
                }
            } catch (err) { cloudError = err.message; }
        }

        patientData.cloudSynced = cloudSaved;
        const patients = this.getAllPatientsLocal();
        const idx = patients.findIndex(p => p.patientId === id || p.id === patientData.id);
        if (idx !== -1) patients[idx] = patientData;
        else patients.push(patientData);

        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        localStorage.setItem('current_patient_id', id);
        
        try {
            const name = patientData.fullName || 'New Profile';
            await this.logScan(id, 'profile_created', navigator.userAgent || 'Web', null, null, null, name);
        } catch (e) { }

        return { id, cloudSynced: cloudSaved, supabaseId: cloudId, patient: patientData, cloudError };
    },

    getAllPatients: async function () {
        let cloudPatients = [];
        let dbAvailable = false;
        if (this.db()) {
            try {
                const userId = await this._getUserId();
                let query = this.db().from('patients').select('*');
                const isAdmin = await this._isAdminUser();

                if (isAdmin) {
                    // Admin sees all
                } else if (userId) {
                    query = query.eq('user_id', userId);
                } else {
                    return this.getAllPatientsLocal();
                }
                
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error) throw error;
                dbAvailable = true;
                if (data) {
                    cloudPatients = data.map(r => this.mapFromDB(r));
                    this._cache = cloudPatients;
                }
            } catch (err) { console.error('[Storage] GetPatients Error:', err.message); }
        }

        const localPatients = this.getAllPatientsLocal();
        const merged = [];
        cloudPatients.forEach(cp => merged.push({ ...cp, cloudSynced: true }));
        localPatients.forEach(lp => {
            const inCloud = merged.find(cp => cp.patientId === lp.patientId || cp.id === lp.id);
            if (!inCloud) merged.push({ ...lp, cloudSynced: dbAvailable ? false : (lp.cloudSynced || false) });
        });

        localStorage.setItem(this.SAVE_KEY, JSON.stringify(merged));
        return merged;
    },

    getAllPatientsLocal: function () {
        try {
            const data = localStorage.getItem(this.SAVE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    },

    getPatientById: async function (id) {
        if (!id) return null;
        if (this.db()) {
            try {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
                const { data, error } = await this.db().from('patients').select('*').eq(isUUID ? 'id' : 'patient_id', id).single();
                if (data) return this.mapFromDB(data);
            } catch (err) { }
        }
        return this.getAllPatientsLocal().find(p => p.patientId === id || p.id === id) || null;
    },

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
        let cloudSynced = false;
        if (this.db()) {
            try {
                const userId = await this._getUserId();
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
                const queryField = isUUID ? 'id' : 'patient_id';
                const dbUpdate = {};
                const mapping = {
                    fullName: 'full_name', bloodGroup: 'blood_group', age: 'age', gender: 'gender',
                    contact1_Name: 'contact1_name', contact1_Relation: 'contact1_relation', contact1_Phone: 'contact1_phone', contact1_Email: 'contact1_email',
                    emergencyContact: 'emergencyContact',
                    conditions: 'conditions', allergies: 'allergies', medications: 'medications', medicalNotes: 'medical_notes', organDonor: 'organ_donor'
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
                    const { error } = await this.db().from('patients').update(dbUpdate).eq(queryField, id);
                    if (error && (error.code === '42501' || error.status === 403)) {
                        if (userId) {
                            await this.db().from('patients').update({ user_id: userId }).eq(queryField, id);
                            const { error: retryError } = await this.db().from('patients').update(dbUpdate).eq(queryField, id);
                            cloudSynced = !retryError;
                        }
                    } else { cloudSynced = !error; }
                }
            } catch (err) { }
        }

        const patients = this.getAllPatientsLocal();
        const idx = patients.findIndex(p => p.patientId === id || p.id === id);
        if (idx !== -1) {
            patients[idx] = { ...patients[idx], ...updatedData, cloudSynced: cloudSynced || !!patients[idx].cloudSynced };
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        }
        return { success: true, cloudSynced };
    },

    deletePatient: async function (id) {
        let cloudSynced = false;
        let lastError = null;
        if (this.db()) {
            try {
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
                const { error } = await this.db().from('patients').delete().eq(isUUID ? 'id' : 'patient_id', id);
                if (error) lastError = error;
                cloudSynced = !error;
            } catch (err) { lastError = err; }
        }
        
        // Optimistic UI/Local deletion still occurs if desired, 
        // but we'll report the cloud state to the caller
        let patients = this.getAllPatientsLocal().filter(p => p.patientId !== id && p.id !== id);
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        if (this._cache) this._cache = this._cache.filter(p => p.patientId !== id && p.id !== id);
        if (localStorage.getItem('current_patient_id') === id) localStorage.removeItem('current_patient_id');
        
        return { success: cloudSynced, error: lastError };
    },

    _getAssignedOwnerId: async function () {
        try {
            const uid = await this._getUserId();
            return uid; // returns null for anon
        } catch (e) { return null; }
    },

    claimProfile: async function(patientId) {
        if (!this.db()) return { success: false, error: 'Cloud Unavailable' };
        try {
            const userId = await this._getUserId();
            if (!userId) return { success: false, error: 'Not Logged In' };

            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(patientId);
            const queryField = isUUID ? 'id' : 'patient_id';

            // Only update if currently NULL (security policy check)
            const { error } = await this.db()
                .from('patients')
                .update({ user_id: userId })
                .eq(queryField, patientId)
                .is('user_id', null);

            return { success: !error, error };
        } catch (err) {
            return { success: false, error: err };
        }
    },

    setPendingPatientId: function(id) {
        localStorage.setItem('pending_patient_id', id);
    },

    getPendingPatientId: function() {
        return localStorage.getItem('pending_patient_id');
    },

    clearPendingPatientId: function() {
        localStorage.removeItem('pending_patient_id');
    },

    encodeForQR: function (p) {
        if (!p) return null;
        const trunc = (str, max) => String(str || '').length > max ? str.substring(0, max) : String(str || '');
        const qrData = {
            n: trunc(p.fullName, 40), b: p.bloodGroup || '', a: p.age || '', g: p.gender || '',
            c1n: trunc(p.contact1_Name, 30), c1p: trunc(p.contact1_Phone, 15), c1e: trunc(p.contact1_Email, 60),
            con: trunc(p.conditions, 80), alg: trunc(p.allergies, 60), med: trunc(p.medications, 60),
            org: p.organDonor ? '1' : '0', id: p.patientId || '', sid: p.id || ''
        };
        try {
            let encoded = btoa(unescape(encodeURIComponent(JSON.stringify(qrData))));
            return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) { return null; }
    },

    decodeFromURL: function (encodedStr) {
        if (!encodedStr) return null;
        try {
            let base64 = encodedStr.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const d = JSON.parse(decodeURIComponent(escape(atob(base64))));
            return {
                patientId: d.id, id: d.sid, fullName: d.n, bloodGroup: d.b, age: d.a, gender: d.g,
                contact1_Name: d.c1n, contact1_Phone: d.c1p, contact1_Email: d.c1e,
                conditions: d.con, allergies: d.alg, medications: d.med, organDonor: d.org === '1'
            };
        } catch (e) { return null; }
    },

    logScan: async function (patientId, type, device, location, lat, long, patientName) {
        const timestamp = new Date().toISOString();
        const scans = this.getScanHistoryLocal();
        scans.unshift({ patientId, patient_name: patientName, type, device, location, latitude: lat, longitude: long, timestamp });
        localStorage.setItem(this.SCAN_KEY, JSON.stringify(scans.slice(0, 50)));

        console.log(`[Storage] Logging event: ${type} for ${patientId} (${patientName || 'Unknown'})`);

        if (this.db()) {
            try {
                const logData = { 
                    patient_id: patientId, 
                    patient_name: patientName || null,
                    type: type || 'qr_scan', 
                    device: device || 'Unknown', 
                    location: lat && long ? `${location || 'GPS'} (${lat.toFixed(4)}, ${long.toFixed(4)})` : (location || 'Global Search'),
                    latitude: lat || null, 
                    longitude: long || null, 
                    timestamp: timestamp 
                };
                
                const { error } = await this.db().from('scans').insert([logData]);
                if (error) console.error('[Storage] Scan Log DB Error:', error.message);
            } catch (err) { console.error('[Storage] Scan Log Exception:', err); }
        }
    },

    getScanHistory: async function (patientId) {
        if (this.db()) {
            try {
                let query = this.db().from('scans').select('*').order('timestamp', { ascending: false }).limit(50);
                if (patientId) query = query.eq('patient_id', patientId);
                const { data } = await query;
                if (data) return data.map(s => ({ ...s, patientId: s.patient_id }));
            } catch (err) { }
        }
        return this.getScanHistoryLocal(patientId);
    },

    getScanHistoryLocal: function (patientId) {
        try {
            const data = localStorage.getItem(this.SCAN_KEY);
            const scans = data ? JSON.parse(data) : [];
            return patientId ? scans.filter(s => s.patientId === patientId) : scans;
        } catch (e) { return []; }
    },

    triggerSOSAlert: async function(patient, lat, long) {
        const patientId = typeof patient === 'string' ? patient : (patient.id || patient.patientId);
        const patientName = typeof patient === 'object' ? patient.fullName : null;
        const safeLat = typeof lat === 'number' ? lat : null;
        const safeLong = typeof long === 'number' ? long : null;
        
        console.log(`[Storage] Triggering SOS for ${patientId} at`, lat, long);

        await this.logScan(patientId, 'emergency_scan', navigator.userAgent || 'Rescuer Device', safeLat ? 'GPS' : 'Restricted', safeLat, safeLong, patientName);
        
        if (this.db() && typeof patient === 'object') {
            try {
                const alertData = {
                    patient_id: patientId, 
                    patient_name: patient.fullName || 'Unknown', 
                    patient_blood: patient.bloodGroup || 'N/A',
                    family_email: patient.contact1_Email || patient.contact1_email || '', 
                    family_name: patient.contact1_Name || 'Next of Kin',
                    gps_lat: safeLat, 
                    gps_long: safeLong, 
                    google_maps_link: safeLat ? `https://www.google.com/maps?q=${safeLat},${safeLong}` : '', 
                    email_sent: false
                };

                const { error: insertError } = await this.db().from('emergency_alerts').insert([alertData]);
                
                if (insertError) {
                    console.error('[Storage] Emergency Alert Insert Failed:', insertError.message);
                } else {
                    console.log('[Storage] Emergency Alert Registered in DB (Real-time trigger fired)');
                    try {
                        const { data, error: funcError } = await this.db().functions.invoke('send-sos-email', { body: alertData });
                        if (funcError) throw funcError;
                        console.log('[Storage] Edge Function email success:', data);
                    } catch (e) {
                         console.warn('[Storage] Email Service Unavailable. (Requires Supabase Edge Function "send-sos-email" to be deployed)');
                    }
                }
            } catch (err) { console.error('[Storage] SOS Alert Exception:', err); }
        }
        return true;
    },

    getProfileCompletion: function (patient) {
        if (!patient) return 0;
        const fields = ['fullName', 'bloodGroup', 'age', 'gender', 'contact1_Name', 'contact1_Phone', 'conditions', 'allergies', 'medications'];
        const filled = fields.filter(f => patient[f] && String(patient[f]).trim() !== '').length;
        return Math.round((filled / fields.length) * 100);
    },

    getTotalScans: async function () {
        if (this.db()) {
            try {
                const { count } = await this.db().from('scans').select('*', { count: 'exact', head: true });
                return count || 0;
            } catch (err) { }
        }
        return this.getScanHistoryLocal().length;
    },

    getScanCount: async function() {
        return await this.getTotalScans();
    }
};

Storage.seed();
window.Storage = Storage;
