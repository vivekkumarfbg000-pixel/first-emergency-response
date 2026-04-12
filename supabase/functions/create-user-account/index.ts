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

    if (!email || !password || !patientId) {
      throw new Error('Missing required fields: email, password, patientId.')
    }

    let userId: string

    // ─── Step 1: Try to create the Auth User ───
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // bypass email confirmation so user can log in immediately
      user_metadata: { full_name: fullName || '' }
    })

    if (createError) {
      // ─── Re-provision path: user already exists → update their password ───
      if (
        createError.message.includes('already registered') ||
        createError.message.includes('already been registered') ||
        createError.message.includes('duplicate') ||
        createError.message.includes('unique constraint')
      ) {
        // Look up the existing user by email
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
        if (listError) throw listError

        const existingUser = listData?.users?.find((u: { email: string }) => u.email === email)
        if (!existingUser) {
          throw new Error(`User with email ${email} was reported as existing but could not be found.`)
        }

        userId = existingUser.id

        // Update their password
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName || existingUser.user_metadata?.full_name || '' }
        })
        if (updateError) throw updateError

      } else {
        // Some other create error — surface it directly
        throw createError
      }
    } else {
      userId = createData.user.id
    }

    // ─── Step 2: Link the Clinical Profile ───
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(patientId)
    const queryField = isUUID ? 'id' : 'patient_id'

    const { error: dbError } = await supabase
      .from('patients')
      .update({ user_id: userId, email: email })
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
