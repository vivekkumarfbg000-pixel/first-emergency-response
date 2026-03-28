const Storage = {
    SAVE_KEY: 'ems_patient_data_v2',
    SCAN_KEY: 'ems_scan_history',
    _cache: [],

    // ────── HELPERS ──────
    db: function() {
        return window.supabaseClient;
    },

    mapToDB: function(p) {
        const row = {
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
            organ_donor: p.organDonor || false
        };
        // Only include user_id if it has a value
        if (p.userId) row.user_id = p.userId;
        return row;
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
            userId: row.user_id, // Added for SaaS multi-tenancy
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
                },
                {
                    patientId: 'EMS-9B2E02',
                    fullName: 'Priya Verma',
                    bloodGroup: 'B-',
                    age: 24,
                    gender: 'Female',
                    contact1_Name: 'Vikram Verma',
                    contact1_Relation: 'Father',
                    contact1_Phone: '9123456789',
                    contact2_Name: 'Sneha Verma',
                    contact2_Relation: 'Mother',
                    contact2_Phone: '9123456700',
                    conditions: 'Severe Asthma (Grade 4)',
                    allergies: 'Latex, Peanuts, Ibuprofen',
                    medications: 'Salbutamol Inhaler (PRN), Montelukast 10mg (Nightly), Budesonide 200mcg',
                    organDonor: false,
                    medicalNotes: 'Carries EpiPen at all times. Asthma triggered by cold air and exercise.',
                    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
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
                { patientId: 'EMS-7A3F01', type: 'qr_scan', device: 'iPhone 15 / Safari', location: 'Mumbai, MH', timestamp: new Date(now - 3600000 * 2).toISOString() },
                { patientId: 'EMS-9B2E02', type: 'qr_scan', device: 'Android / Chrome', location: 'Delhi, DL', timestamp: new Date(now - 86400000 * 2).toISOString() },
            ];
            localStorage.setItem(this.SCAN_KEY, JSON.stringify(mockScans));
        }
    },

    // ────── CRUD (Async Supabase + Sync Fallback) ──────
    savePatient: async function(data) {
        const id = 'EMS-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const patientData = {
            ...data,
            patientId: id,
            organDonor: data.organDonor || false,
            createdAt: new Date().toISOString()
        };

        // 1. Save to Supabase
        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                if (user) {
                    patientData.userId = user.id;
                }

                const dbRow = this.mapToDB(patientData);
                if (user) {
                    dbRow.user_id = user.id;
                }

                const { data: inserted, error } = await this.db()
                    .from('patients')
                    .insert([dbRow])
                    .select();
                
                if (error) throw error;
                if (inserted && inserted[0]) {
                    patientData.id = inserted[0].id; // Assign Supabase UUID
                }
            } catch (err) {
                console.error('Supabase Save Error:', err.message, err.details, err.hint, err);
                // We still continue to save locally as fallback
            }
        }

        // 2. Save to Local (Cache)
        let patients = this.getAllPatientsLocal();
        patients.push(patientData);
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        localStorage.setItem('current_patient_id', id);

        // 3. Log the creation
        await this.logScan(id, 'profile_created', 'Dashboard');
        return id;
    },

    getAllPatients: async function() {
        let cloudPatients = [];
        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                let query = this.db().from('patients').select('*');
                
                if (user) {
                    query = query.eq('user_id', user.id);
                }

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

        // Merge Strategy: Prioritize cloud, but include local-only records (like those just created)
        const localPatients = this.getAllPatientsLocal();
        const merged = [...cloudPatients];
        
        localPatients.forEach(lp => {
            const existsInCloud = cloudPatients.some(cp => cp.patientId === lp.patientId);
            if (!existsInCloud) {
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
        // Try Supabase first (UUID or patientId)
        if (this.db()) {
            try {
                const user = await window.Auth.getUser();
                const queryField = id.length > 20 ? 'id' : 'patient_id';
                let query = this.db().from('patients').select('*').eq(queryField, id);
                
                // For privacy, only owners or admins should see full details via this method 
                // (Unless it's the public emergency view, which uses decodeFromURL)
                if (user) {
                    query = query.eq('user_id', user.id);
                }

                const { data, error } = await query.single();
                
                if (error && error.code !== 'PGRST116') throw error;
                if (data) return this.mapFromDB(data);
            } catch (err) {
                console.error('Supabase Get Error:', err);
            }
        }
        // Fallback to local
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
        // 1. Update Supabase
        if (this.db()) {
            try {
                const queryField = id.length > 20 ? 'id' : 'patient_id';
                const { error } = await this.db()
                    .from('patients')
                    .update(this.mapToDB({ ...updatedData, patientId: id }))
                    .eq(queryField, id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase Update Error:', err);
            }
        }

        // 2. Update Local
        let patients = this.getAllPatientsLocal();
        const index = patients.findIndex(p => p.patientId === id || p.id === id);
        if (index !== -1) {
            patients[index] = { ...patients[index], ...updatedData };
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
            await this.logScan(id, 'profile_edit', 'Dashboard Admin');
            return true;
        }
        return false;
    },

    deletePatient: async function(id) {
        // 1. Delete from Supabase
        if (this.db()) {
            try {
                const queryField = id.length > 20 ? 'id' : 'patient_id';
                const { error } = await this.db()
                    .from('patients')
                    .delete()
                    .eq(queryField, id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase Delete Error:', err);
            }
        }

        // 2. Delete from Local
        let patients = this.getAllPatientsLocal();
        patients = patients.filter(p => p.patientId !== id && p.id !== id);
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(patients));
        if (localStorage.getItem('current_patient_id') === id) {
            localStorage.removeItem('current_patient_id');
        }
        return true;
    },

    // ────── QR DATA ENCODING/DECODING ──────
    encodeForQR: function(p) {
        if (!p) return null;

        const qrData = {
            n: p.fullName,
            b: p.bloodGroup,
            a: p.age,
            g: p.gender,
            c1n: p.contact1_Name,
            c1r: p.contact1_Relation || '',
            c1p: p.contact1_Phone,
            c2n: p.contact2_Name || '',
            c2r: p.contact2_Relation || '',
            c2p: p.contact2_Phone || '',
            con: p.conditions || '',
            alg: p.allergies || '',
            med: p.medications || '',
            org: p.organDonor ? '1' : '0',
            mnt: p.medicalNotes || '',
            id: p.patientId,
            sid: p.id // Supabase ID
        };

        const jsonStr = JSON.stringify(qrData);
        return btoa(unescape(encodeURIComponent(jsonStr)));
    },

    decodeFromURL: function(encodedStr) {
        try {
            const jsonStr = decodeURIComponent(escape(atob(encodedStr)));
            const d = JSON.parse(jsonStr);
            return {
                patientId: d.id || 'UNKNOWN',
                id: d.sid || null,
                fullName: d.n || 'Unknown Patient',
                bloodGroup: d.b || '?',
                age: d.a || '?',
                gender: d.g || '?',
                contact1_Name: d.c1n || '',
                contact1_Relation: d.c1r || '',
                contact1_Phone: d.c1p || '',
                contact2_Name: d.c2n || '',
                contact2_Relation: d.c2r || '',
                contact2_Phone: d.c2p || '',
                conditions: d.con || 'None reported',
                allergies: d.alg || 'None',
                medications: d.med || 'None',
                organDonor: d.org === '1',
                medicalNotes: d.mnt || ''
            };
        } catch (e) {
            console.error('Failed to decode QR data:', e);
            return null;
        }
    },

    // ────── SCAN HISTORY ──────
    logScan: async function(patientId, type, device, location) {
        // Log to Supabase if possible
        if (this.db()) {
            try {
                // Find patient UUID first for foreign key
                const patient = await this.getPatientById(patientId);
                const { error } = await this.db()
                    .from('scans')
                    .insert([{
                        patient_uuid: patient ? patient.id : null,
                        patient_id: patientId,
                        type: type || 'qr_scan',
                        device: device || 'Unknown Device',
                        location: location || 'Unknown',
                        timestamp: new Date().toISOString()
                    }]);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase Log Error:', err);
            }
        }

        const scans = this.getScanHistoryLocal();
        scans.unshift({
            patientId,
            type: type || 'qr_scan',
            device: device || 'Unknown Device',
            location: location || 'Unknown',
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(this.SCAN_KEY, JSON.stringify(scans.slice(0, 50)));
    },

    getScanHistory: async function(patientId) {
        if (this.db()) {
            try {
                let query = this.db().from('scans').select('*').order('timestamp', { ascending: false });
                if (patientId) {
                    // Try by patientId (denormalized) or patient_uuid
                    query = query.or(`patient_id.eq.${patientId}`);
                }
                const { data, error } = await query.limit(50);
                if (error) throw error;
                if (data) return data.map(s => ({
                    ...s,
                    patientId: s.patient_id,
                    timestamp: s.timestamp
                }));
            } catch (err) {
                console.error('Supabase Get Scans Error:', err);
            }
        }
        return this.getScanHistoryLocal(patientId);
    },

    getScanHistoryLocal: function(patientId) {
        const data = localStorage.getItem(this.SCAN_KEY);
        const scans = data ? JSON.parse(data) : [];
        if (patientId) return scans.filter(s => s.patientId === patientId);
        return scans;
    },

    // ────── UTILITIES ──────
    getProfileCompletion: function(patient) {
        if (!patient) return 0;
        const fields = ['fullName', 'bloodGroup', 'age', 'gender', 'contact1_Name', 'contact1_Phone', 'conditions', 'allergies', 'medications', 'medicalNotes'];
        const filled = fields.filter(f => patient[f] && String(patient[f]).length > 0 && String(patient[f]).toLowerCase() !== 'none' && String(patient[f]).toLowerCase() !== 'none reported').length;
        return Math.round((filled / fields.length) * 100);
    },

    getTotalScans: async function() {
        if (this.db()) {
            try {
                const { count, error } = await this.db()
                    .from('scans')
                    .select('*', { count: 'exact', head: true })
                    .eq('type', 'qr_scan');
                if (!error) return count;
            } catch (err) {}
        }
        return this.getScanHistoryLocal().filter(s => s.type === 'qr_scan').length;
    }
};

Storage.seed();
window.Storage = Storage;
