import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS Handling
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, password, patientId, fullName } = await req.json()

    // 1. Create the Auth User
    const { data: userData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    })

    if (authError) throw authError

    const userId = userData.user.id

    // 2. Link the Clinical Profile
    // Try UUID first, then patient_id
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(patientId)
    const queryField = isUUID ? 'id' : 'patient_id'

    const { error: dbError } = await supabase
      .from('patients')
      .update({ user_id: userId })
      .eq(queryField, patientId)

    if (dbError) throw dbError

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
