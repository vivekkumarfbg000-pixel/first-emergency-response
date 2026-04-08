# Project Presentation Summary: First Emergency Response (Sehat Point)

This document provides a slide-by-slide summary of the application architecture, design choices, and technical implementation. This is optimized for conversion into a PowerPoint (PPT) presentation.

---

## Slide 1: Mission & Overview
**Title**: Sehat Point: Tactical Emergency Response
- **Goal**: Provide instant, life-saving medical data to first responders via high-fidelity QR codes.
- **Problem**: In emergencies, critical data (allergies, blood group, medications) is often unavailable.
- **Solution**: A PWA (Progressive Web App) that syncs data across a Master Dispatch Console and personal profiles.

---

## Slide 2: Tech Stack (The Frontend)
**Title**: Modern, Resilient Frontend
- **Languages**: HTML5, Vanilla JavaScript (ES6+), CSS3.
- **Frameworks**: Tailwind CSS (Emergency UI), Lucide Icons (Visual Hierarchy).
- **Key Libraries**: 
    - `QRCode.js`: For high-fidelity diagnostic QR generation.
    - `Leaflet.js`: (Optional/Admin) For tactical GPS mapping.
- **UX Design**: 
    - **User Dashboard**: High-contrast, accessibility-first design.
    - **Admin Console**: Glassmorphism/Dark mode for reduced eye strain in dispatch centers.

---

## Slide 3: Tech Stack (The Backend)
**Title**: Cloud-Native Backend Architecture
- **Provider**: Supabase (PostgreSQL as a Service).
- **Core Database Features**:
    - **PostgreSQL**: Relational storage for patients, scans, and alerts.
    - **Supabase Auth**: Secure JWT-based session management.
    - **Realtime (CDC)**: Postgres Change Data Capture for live-streaming scan alerts.
    - **Edge Functions**: (Deno) For server-side tasks like medical summarization.

---

## Slide 4: Database Schema Design
**Title**: Relational Data Intelligence
- **Patients Table**: Stores demographic and medical records (Blood Group, Allergies, Emergency Contacts).
- **Scans Table**: Logs every QR interaction (Timestamp, GPS Coords, Device Type).
- **Emergency Alerts Table**: Specific data for the Admin Feed to trigger tactical responses.
- **User Roles Table**: Maps users to 'Admin' or 'User' roles for permission gating.

---

## Slide 5: Security & Data Isolation (RLS)
**Title**: Clinical-Grade Privacy (Row Level Security)
- **Problem**: Prevent "Data Leakage" where users might see each other's records.
- **Solution**: Row Level Security (RLS) policies in PostgreSQL:
    - `owner_access`: Restricts records to `auth.uid() = user_id`.
    - `admin_bypass`: Grants `is_admin()` access to all global records.
    - `responder_access`: Allows anonymous READ-ONLY access to QR profiles during rescue operations.

---

## Slide 6: The Emergency Workflow
**Title**: From QR Scan to Life Saved
1. **Trigger**: First Responder scans the patient's QR code.
2. **Identification**: `emergency.html` fetches record via `sid` (ID) or `d` (Encoded Offline Data).
3. **Transmission**: Device acquires GPS signal and logs a scan in the cloud.
4. **Alerting**: Admin Dashboard receives a real-time "POSTGRES_CHANGE" event.
5. **Action**: Dispatcher sees the patient location and medical profile instantly.

---

## Slide 7: Maintenance & System Integrity
**Title**: Automated Disaster Recovery & Integrity
- **Cascading Deletes**: SQL Triggers automatically purge scan history when a profile is terminated.
- **Encryption**: Medical data is gated via JWT; QR URLs are encoded to prevent trivial guessing.
- **Sync Logic**: `storage.js` manages offline-first LocalStorage with "Best-Effort" cloud synchronization.

---

## Slide 8: Future Extensions
**Title**: Scalability Roadmap
- **AI Triage**: Expansion of Edge Functions to provide "Crash-Cart" medical insights.
- **IoT Integration**: Supporting wearable devices as alternative SOS triggers.
- **Multilingual Support**: Hindi/English localization fully implemented for rescuer accessibility.

---

> [!TIP]
> **To fix mismanagement in the future**: 
> - Always run the `final_security_harden.sql` script after schema changes.
> - Ensure `js/storage.js` remains the "Single Source of Truth" for all data fetching to prevent permission errors.
