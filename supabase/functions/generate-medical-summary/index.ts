// ─── Supabase Edge Function: generate-medical-summary ───
// Deployment: supabase functions deploy generate-medical-summary

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Initialize headers for CORS support
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

serve(async (req: any) => {
  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { record } = await req.json()
    
    // The patient record data will be passed in the request body
    const { conditions, allergies, medications, bloodGroup, dob } = record

    console.log(`Generating AI Medical Summary...`)

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Construct the prompt for the Crash-Cart Summarizer
    const systemPrompt = `You are an AI Crash-Cart Summarizer for an emergency response system. 
Your job is to read patient medical data and output EXACTLY a JSON object with this structure:
{
  "summary": "3-sentence critical context summary for arriving paramedics.",
  "risk_level": "CRITICAL", // Only use "CRITICAL", "MODERATE", or "LOW"
  "key_flags": ["Severe Peanut Allergy", "Type 2 Diabetes"] // Array of up to 4 ultra-short fatal flags/conditions
}
Do not include any extra text. Output ONLY valid JSON.`

    const userMessage = `Patient Info:
Blood Group: ${bloodGroup || 'Unknown'}
DOB: ${dob || 'Unknown'}
Medical Conditions: ${conditions || 'None reported'}
Allergies: ${allergies || 'None reported'}
Current Medications: ${medications || 'None reported'}`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Fast, high accuracy open-source model
        response_format: { type: "json_object" },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1, // Highly deterministic
        max_tokens: 300
      }),
    })

    const data = await res.json()
    
    if (data.error) {
       throw new Error(data.error.message)
    }

    let aiResponse;
    try {
        aiResponse = JSON.parse(data.choices[0].message.content);
    } catch (e) {
        // Fallback if model fails to format JSON
        aiResponse = { summary: data.choices[0].message.content, risk_level: "UNKNOWN", key_flags: [] };
    }

    return new Response(JSON.stringify(aiResponse), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (err: any) {
    console.error("AI Gen Error:", err)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
