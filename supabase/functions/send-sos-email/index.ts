import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  try {
    const body = await req.json()
    const { patient_name, family_email, family_name, patient_blood, google_maps_link } = body

    if (!family_email) throw new Error('No family email provided')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')

    console.log(`Sending SOS for ${patient_name} to ${family_email}`)

    // ─── SEND EMAIL VIA RESEND ───
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Sehat Point <sos@sehatpoint.com>',
        to: [family_email],
        subject: `⚠️ EMERGENCY: SOS Alert for ${patient_name}`,
        html: `
          <div style="font-family: sans-serif; border: 2px solid #e11d48; padding: 20px; border-radius: 12px; max-width: 500px;">
            <h1 style="color: #e11d48; margin-top: 0;">⚠️ Emergency SOS Alert</h1>
            <p>Hello <strong>${family_name}</strong>,</p>
            <p>This is an automated emergency alert from <strong>Sehat Point</strong>. The medical QR code for <strong>${patient_name}</strong> has just been scanned by a rescuer.</p>
            
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #991b1b;">PATIENT DETAILS:</p>
              <ul style="color: #991b1b; padding-left: 20px;">
                <li>Name: ${patient_name}</li>
                <li>Blood Group: ${patient_blood}</li>
              </ul>
            </div>
            
            <p><strong>CURRENT LOCATION:</strong></p>
            <p><a href="${google_maps_link}" style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px;">View on Google Maps</a></p>
            
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.8rem; color: #64748b;">Please try to contact ${patient_name} immediately or reach out to local emergency services.</p>
          </div>
        `,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.message || 'Failed to send SOS email')
    }

    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})

/*
─── SETUP INSTRUCTIONS ───
1. Install Supabase CLI: npm install supabase --save-dev
2. Login: npx supabase login
3. Create function: npx supabase functions new send-sos-email
4. Paste this code into index.ts
5. Set secret: npx supabase secrets set RESEND_API_KEY=your_key_here
6. Deploy: npx supabase functions deploy send-sos-email
*/
