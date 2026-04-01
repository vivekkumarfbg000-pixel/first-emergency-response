/* ============================================================
   register.js — v2.0 Multi-Step Wizard with Live Preview
   ============================================================ */

(function() {
    'use strict';

    // ─── Auth Guard ───
    // No auth required for public registration
    // All profiles are linked to the master admin account

    let currentStep = 1;
    const totalSteps = 3;

    // ─── Wizard Navigation ───
    window.wizardNext = function(step) {
        // Validate current step
        if (!validateStep(step)) return;

        if (step < totalSteps) {
            setStep(step + 1);
        }
    };

    window.wizardBack = function(step) {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    function setStep(n) {
        currentStep = n;

        // Hide all panels
        document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`step${n}`).classList.add('active');

        // Update step indicators
        document.querySelectorAll('.wizard-step').forEach(s => {
            const sn = parseInt(s.dataset.step);
            s.classList.remove('active', 'completed');
            if (sn === n) s.classList.add('active');
            if (sn < n) s.classList.add('completed');
        });

        // Re-init icons for new step
        lucide.createIcons();
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── Validation ───
    function validateStep(step) {
        let valid = true;
        const panel = document.getElementById(`step${step}`);
        const requiredInputs = panel.querySelectorAll('[required]');

        requiredInputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add('invalid');
                input.classList.remove('valid');
                valid = false;

                // Shake animation
                input.style.animation = 'none';
                input.offsetHeight; // trigger reflow
                input.style.animation = 'headShake 0.5s ease';
            } else {
                input.classList.remove('invalid');
                input.classList.add('valid');
            }
        });

        if (!valid) {
            showMiniToast('Please fill all required fields');
        }

        return valid;
    }

    function showMiniToast(msg) {
        const existing = document.querySelector('.mini-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'mini-toast';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
            padding: 0.75rem 1.5rem; background: rgba(15,20,35,0.95); color: #ef4444;
            border: 1px solid rgba(239,68,68,0.3); border-radius: 99px;
            font-size: 0.8125rem; font-weight: 600; z-index: 9999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            animation: fadeSlideIn 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
    }

    // ─── Live Preview Card ───
    function updatePreview() {
        const name = document.getElementById('fullName').value || 'Your Name';
        const age = document.getElementById('age').value;
        const gender = document.getElementById('gender').value;
        const blood = document.getElementById('bloodGroup').value;

        document.getElementById('prevName').textContent = name;
        document.getElementById('prevAvatar').textContent = name.charAt(0).toUpperCase() || '?';

        const metaParts = [];
        if (age) metaParts.push(`${age}Y`);
        if (gender) metaParts.push(gender);
        if (blood) metaParts.push(blood);
        document.getElementById('prevMeta').textContent = metaParts.length > 0 ? metaParts.join(' • ') : 'Age • Gender • Blood Group';

        // Tags
        const tagsEl = document.getElementById('prevTags');
        tagsEl.innerHTML = '';

        if (blood) {
            tagsEl.innerHTML += `<span class="badge badge-red">${blood}</span>`;
        }

        const conditions = document.getElementById('conditions');
        if (conditions && conditions.value.trim()) {
            tagsEl.innerHTML += `<span class="badge badge-yellow">Has Conditions</span>`;
        }

        const allergies = document.getElementById('allergies');
        if (allergies && allergies.value.trim() && allergies.value.toLowerCase() !== 'none') {
            tagsEl.innerHTML += `<span class="badge badge-red">⚠ Allergies</span>`;
        }

        const organDonor = document.getElementById('organDonor');
        if (organDonor && organDonor.checked) {
            tagsEl.innerHTML += `<span class="badge badge-green">🫀 Organ Donor</span>`;
        }
    }

    // Bind live preview to all inputs
    document.querySelectorAll('#registerForm input, #registerForm select, #registerForm textarea').forEach(input => {
        input.addEventListener('input', updatePreview);
        input.addEventListener('change', updatePreview);
        
        // Remove invalid state on focus
        input.addEventListener('focus', () => {
            input.classList.remove('invalid');
            input.style.animation = '';
        });
    });

    // ─── Form Submission ───
    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!validateStep(3)) return;

        const patientData = {
            fullName: document.getElementById('fullName').value.trim(),
            bloodGroup: document.getElementById('bloodGroup').value,
            age: document.getElementById('age').value,
            gender: document.getElementById('gender').value,
            contact1_Name: document.getElementById('contact1_Name').value.trim(),
            contact1_Relation: document.getElementById('contact1_Relation').value.trim(),
            contact1_Phone: document.getElementById('contact1_Phone').value.trim(),
            contact2_Name: (document.getElementById('contact2_Name').value || '').trim(),
            contact2_Relation: (document.getElementById('contact2_Relation').value || '').trim(),
            contact2_Phone: (document.getElementById('contact2_Phone').value || '').trim(),
            conditions: document.getElementById('conditions').value.trim(),
            allergies: document.getElementById('allergies').value.trim(),
            medications: document.getElementById('medications').value.trim(),
            medicalNotes: document.getElementById('medicalNotes').value.trim(),
            organDonor: document.getElementById('organDonor').checked
        };

        if (window.Storage) {
            const btn = document.getElementById('submitBtn');
            btn.innerHTML = '<span style="display:flex;align-items:center;gap:0.5rem;"><i data-lucide="loader" style="width:16px;" class="animate-pulse"></i> Securing Profile in Cloud...</span>';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            lucide.createIcons();

            try {
                const result = await window.Storage.savePatient(patientData);
                if (result && result.id) {
                    if (result.cloudSaved) {
                        showMiniToast('✅ Profile Secured & Synced with Global Dashboard!');
                    } else {
                        showMiniToast('⚠️ Saved Locally (Sync Pending)');
                    }
                    
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                }
            } catch (err) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerHTML = '<i data-lucide="shield-check"></i> Try Again';
                showMiniToast('❌ Critical Error: ' + err.message);
                lucide.createIcons();
            }
        }
    });

    // Add CSS animation inline
    const style = document.createElement('style');
    style.textContent = `
        @keyframes headShake {
            0% { transform: translateX(0); }
            15% { transform: translateX(-6px); }
            30% { transform: translateX(5px); }
            45% { transform: translateX(-3px); }
            60% { transform: translateX(2px); }
            75% { transform: translateX(-1px); }
            100% { transform: translateX(0); }
        }
    `;
    document.head.appendChild(style);

})();
