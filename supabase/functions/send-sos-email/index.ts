// ─── Supabase Edge Function: send-sos-email ───
// Deployment: supabase functions deploy send-sos-email

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  const { body } = await req.json()
  const { patient_name, patient_blood, family_email, family_name, google_maps_link } = body

  console.log(`Sending SOS for ${patient_name} to ${family_email}`)

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500 })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Sehat Point SOS <sos@sehatpoint.com>',
      to: [family_email],
      subject: `🚨 EMERGENCY: SOS Alert for ${patient_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 2px solid #ef4444; border-radius: 12px;">
          <h1 style="color: #ef4444;">Emergency Alert</h1>
          <p>Dear ${family_name},</p>
          <p>This is an automated emergency notification from <strong>Sehat Point</strong>.</p>
          <p>Your family member <strong>${patient_name}</strong> (Blood Group: ${patient_blood}) has just had their emergency QR code scanned.</p>
          
          ${google_maps_link ? `
            <div style="margin: 20px 0; padding: 15px; background: #fef2f2; border-radius: 8px;">
              <strong>Live Location Detected:</strong><br>
              <a href="${google_maps_link}" style="color: #3b82f6; font-weight: bold;">View on Google Maps</a>
            </div>
          ` : '<p><em>Note: GPS location was not available at the time of scan.</em></p>'}
          
          <p style="font-size: 12px; color: #64748b; margin-top: 30px;">
            Please try to contact them immediately. This alert was triggered by a rescuer scanning their medical ID.
          </p>
        </div>
      `,
    }),
  })

  const data = await res.json()
  return new Response(JSON.stringify(data), { status: res.status })
})
