const Storage = {
    SAVE_KEY: 'ems_patient_data_v2',
    SCAN_KEY: 'ems_scan_history',
    _cache: [],

    // ────── HELPERS ──────
    db: function() {
        return window.supabaseClient;
    },

    mapToDB: function(p) {
        return {
            patient_id: p.patientId,
            full_name: p.fullName,
            blood_group: p.bloodGroup,
            age: parseInt(p.age) || 0,
            gender: p.gender,
            contact1_name: p.contact1_Name,
            contact1_relation: p.contact1_Relation,
            contact1_phone: p.contact1_Phone,
            contact2_name: p.contact2_Name || '',
            contact2_relation: p.contact2_Relation || '',
            contact2_phone: p.contact2_Phone || '',
            conditions: p.conditions || '',
            allergies: p.allergies || '',
            medications: p.medications || '',
            medical_notes: p.medicalNotes || '',
            organ_donor: p.organDonor || false,
            // user_id is handled in the save/update methods
        };
    },

    mapFromDB: function(row) {
        return {
            id: row.id, // Supabase UUID
            patientId: row.patient_id, // EMS-ID
            fullName: row.full_name,
            bloodGroup: row.blood_group,
            age: row.age,
            gender: row.gender,
            contact1_Name: row.contact1_name,
            contact1_Relation: row.contact1_relation,
            contact1_Phone: row.contact1_phone,
            contact2_Name: row.contact2_name,
            contact2_Relation: row.contact2_relation,
            contact2_Phone: row.contact2_phone,
            conditions: row.conditions,
            allergies: row.allergies,
            medications: row.medications,
            medicalNotes: row.medical_notes,
            organDonor: row.organ_donor,
            userId: row.user_id,
            createdAt: row.created_at
        };
    },

    // ────── SEED MOCK DATA ──────
    seed: function() {
        if (this.getAllPatientsLocal().length === 0) {
            const mockPatients = [
                {
                    patientId: 'EMS-7A3F01',
                    fullName: 'Rajiv Malhotra',
                    bloodGroup: 'O+',
                    age: 62,
                    gender: 'Male',
                    contact1_Name: 'Anita Malhotra',
                    contact1_Relation: 'Wife',
                    contact1_Phone: '9876543210',
                    contact2_Name: 'Karan Malhotra',
                    contact2_Relation: 'Son',
                    contact2_Phone: '9876000111',
                    conditions: 'Chronic Hypertension, Type 2 Diabetes, Mild Arrhythmia',
                    allergies: 'Penicillin, Sulfa Drugs',
                    medications: 'Telmisartan 40mg (Morning), Metformin 500mg (Twice Daily), Aspirin 75mg',
                    organDonor: true,
                    medicalNotes: 'Pacemaker fitted in 2023. Avoid MRI scans.',
                    createdAt: new Date(Date.now() - 86400000 * 12).toISOString()
                }
            ];
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(mockPatients));
            localStorage.setItem('current_patient_id', 'EMS-7A3F01');
            this.seedScanHistory();
        }
    },

    seedScanHistory: function() {
        if (this.getScanHistoryLocal().length === 0) {
            const now = Date.now();
            const mockScans = [
                { patientId: 'EMS-7A3F01', type: 'qr_scan', device: 'iPhone 15 / Safari', location: 'Mumbai, MH', timestamp: new Date(now - 3600000 * 2).toISOString() }
            ];
            localStorage.setItem(this.SCAN_KEY, JSON.stringify(mockScans));
        }
    },

    // ────── CRUD ──────
    savePatient: async function(data) {
        const id = 'EMS-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const patientData = {
            ...data,
            patientId: id,
            organDonor: data.organDonor || false,
            createdAt: new Date().toISOString()
        };

        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                const session = await window.Auth.getSession();
                const dbRow = this.mapToDB(patientData);
                dbRow.user_id = user?.id || session?.user?.id;

                const { data: row, error } = await this.db()
                    .from('patients')
                    .insert([dbRow])
                    .select()
                    .single();

                if (error) throw error;
                if (row) patientData.id = row.id;
            } catch (err) {
                console.error('Cloud Sync Error (Save):', err);
                throw new Error('Cloud Sync Failed: ' + (err.message || 'Unknown error'));
            }
        }

        let patients = this.getAllPatientsLocal();
        patients.push(patientData);
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        localStorage.setItem('current_patient_id', id);

        await this.logScan(id, 'profile_created', 'Dashboard');
        return id;
    },

    getAllPatients: async function() {
        let cloudPatients = [];
        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                let query = this.db().from('patients').select('*');
                if (user) query = query.eq('user_id', user.id);
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error) throw error;
                if (data) {
                    cloudPatients = data.map(r => this.mapFromDB(r));
                    this._cache = cloudPatients;
                }
            } catch (err) {
                console.error('Supabase Fetch Error:', err);
            }
        }

        const localPatients = this.getAllPatientsLocal();
        const merged = [...cloudPatients];
        localPatients.forEach(lp => {
            if (!merged.some(cp => cp.patientId === lp.patientId)) {
                merged.push(lp);
            }
        });
        return merged;
    },

    getAllPatientsLocal: function() {
        const data = localStorage.getItem(this.SAVE_KEY);
        return data ? JSON.parse(data) : [];
    },

    getPatientById: async function(id) {
        if (!id) return null;
        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                const queryField = id.length > 20 ? 'id' : 'patient_id';
                let query = this.db().from('patients').select('*').eq(queryField, id);
                if (user) query = query.eq('user_id', user.id);
                const { data, error } = await query.single();
                if (error && error.code !== 'PGRST116') throw error;
                if (data) return this.mapFromDB(data);
            } catch (err) {
                console.error('Supabase Get Error:', err);
            }
        }
        return this.getAllPatientsLocal().find(p => p.patientId === id || p.id === id) || null;
    },

    getCurrentPatient: async function() {
        let id = localStorage.getItem('current_patient_id');
        if (!id) {
            const all = this.getAllPatientsLocal();
            if (all.length > 0) {
                id = all[0].patientId;
                localStorage.setItem('current_patient_id', id);
            }
        }
        return id ? await this.getPatientById(id) : null;
    },

    updatePatient: async function(id, updatedData) {
        if (!id) return false;

        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                const session = await window.Auth.getSession();
                const queryField = id.length > 20 ? 'id' : 'patient_id';
                
                const dbUpdate = this.mapToDB({ ...updatedData, patientId: id });
                delete dbUpdate.patient_id; // Don't update human-readable ID
                dbUpdate.user_id = user?.id || session?.user?.id;

                const { error } = await this.db()
                    .from('patients')
                    .update(dbUpdate)
                    .eq(queryField, id);

                if (error) throw error;
            } catch (err) {
                console.error('Cloud Sync Error (Update):', err);
                throw new Error('Cloud Sync Failed: ' + (err.message || 'Unknown error'));
            }
        }

        let patients = this.getAllPatientsLocal();
        const idx = patients.findIndex(p => p.patientId === id || p.id === id);
        if (idx !== -1) {
            patients[idx] = { ...patients[idx], ...updatedData };
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        }
        return true;
    },

    deletePatient: async function(id) {
        if (this.db()) {
            try {
                const queryField = id.length > 20 ? 'id' : 'patient_id';
                const { error } = await this.db().from('patients').delete().eq(queryField, id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase Delete Error:', err);
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

    // ────── QR DATA ──────
    encodeForQR: function(p) {
        if (!p) return null;
        const qrData = {
            n: p.fullName,
            b: p.bloodGroup,
            a: p.age,
            g: p.gender,
            c1n: p.contact1_Name,
            c1p: p.contact1_Phone,
            con: p.conditions || '',
            alg: p.allergies || '',
            med: p.medications || '',
            org: p.organDonor ? '1' : '0',
            id: p.patientId,
            sid: p.id
        };
        const jsonStr = JSON.stringify(qrData);
        return btoa(unescape(encodeURIComponent(jsonStr)));
    },

    decodeFromURL: function(encodedStr) {
        try {
            const jsonStr = decodeURIComponent(escape(atob(encodedStr)));
            const d = JSON.parse(jsonStr);
            return {
                patientId: d.id,
                id: d.sid,
                fullName: d.n,
                bloodGroup: d.b,
                age: d.a,
                gender: d.g,
                contact1_Name: d.c1n,
                contact1_Phone: d.c1p,
                conditions: d.con,
                allergies: d.alg,
                medications: d.med,
                organDonor: d.org === '1'
            };
        } catch (e) {
            console.error('QR Decode Error:', e);
            return null;
        }
    },

    // ────── SCAN HISTORY ──────
    logScan: async function(patientId, type, device, location) {
        if (this.db()) {
            try {
                const patient = await this.getPatientById(patientId);
                await this.db().from('scans').insert([{
                    patient_uuid: patient?.id,
                    patient_id: patientId,
                    type: type || 'qr_scan',
                    device: device || 'Unknown',
                    location: location || 'Unknown',
                    timestamp: new Date().toISOString()
                }]);
            } catch (err) {}
        }
        const scans = this.getScanHistoryLocal();
        scans.unshift({ patientId, type, device, location, timestamp: new Date().toISOString() });
        localStorage.setItem(this.SCAN_KEY, JSON.stringify(scans.slice(0, 50)));
    },

    getScanHistory: async function(patientId) {
        if (this.db()) {
            try {
                let query = this.db().from('scans').select('*').order('timestamp', { ascending: false });
                if (patientId) query = query.or(`patient_id.eq.${patientId}`);
                const { data } = await query.limit(50);
                if (data) return data.map(s => ({ ...s, patientId: s.patient_id }));
            } catch (err) {}
        }
        return this.getScanHistoryLocal(patientId);
    },

    getScanHistoryLocal: function(patientId) {
        const data = localStorage.getItem(this.SCAN_KEY);
        const scans = data ? JSON.parse(data) : [];
        return patientId ? scans.filter(s => s.patientId === patientId) : scans;
    },

    // ────── UTILS ──────
    getProfileCompletion: function(patient) {
        if (!patient) return 0;
        const fields = ['fullName', 'bloodGroup', 'age', 'gender', 'contact1_Name', 'contact1_Phone', 'conditions', 'allergies', 'medications'];
        const filled = fields.filter(f => patient[f] && String(patient[f]).trim() !== '').length;
        return Math.round((filled / fields.length) * 100);
    },

    getTotalScans: async function() {
        if (this.db()) {
            try {
                const { count } = await this.db().from('scans').select('*', { count: 'exact', head: true }).eq('type', 'qr_scan');
                return count || 0;
            } catch (err) {}
        }
        return this.getScanHistoryLocal().filter(s => s.type === 'qr_scan').length;
    },

    testConnection: async function() {
        if (!this.db()) return { success: false, message: 'Cloud not initialized.' };
        try {
            const user = await window.Auth.getUser();
            if (!user) return { success: false, message: 'No active session.' };
            const { count, error } = await this.db().from('patients').select('*', { count: 'exact', head: true });
            if (error) throw error;
            return { success: true, message: `Cloud verified. RLS active. ${count} profiles accessible.` };
        } catch (err) {
            return { success: false, message: err.message || 'Connection failed.' };
        }
    }
};

Storage.seed();
window.Storage = Storage;
