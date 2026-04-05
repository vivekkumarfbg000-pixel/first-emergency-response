// ─── Supabase Edge Function: ai-dispatch-assistant ───
// Deployment: supabase functions deploy ai-dispatch-assistant

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json()
    
    // context: { patients: [], activeScan: {}, activePatient: {}, adminName: "" }
    const { patients, activeScan, activePatient } = context || {};

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ 
        content: "I am currently in **Offline Protocol Mode**. Please configure GROQ_API_KEY in Supabase to enable my full tactical intelligence." 
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // System Prompt for Tactical Dispatch AI
    const systemPrompt = `You are the Sehat Point Tactical Dispatch AI (Mission Control). 
Your objective is to assist the Emergency Administrator in rescue operations and registry management.

TACTICAL CONTEXT:
- ACTIVE INCIDENT: ${activeScan ? `Location: ${activeScan.location || 'GPS: ' + activeScan.gps_lat + ',' + activeScan.gps_long}. Type: ${activeScan.type}. Time: ${activeScan.timestamp}` : 'None'}
- CURRENT PATIENT AT RISK: ${activePatient ? `${activePatient.fullName} (Blood: ${activePatient.bloodGroup}, Cond: ${activePatient.conditions})` : 'None'}
- PERSONNEL REGISTRY: ${patients ? `Currently monitoring ${patients.length} personnel profiles.` : 'No registry data loaded.'}

YOUR CAPABILITIES:
1. RISK ASSESSMENT: Analyze patient history vs. current incident type to predict fatalities.
2. LOGISTICS: If coordinates are provided (${activeScan?.gps_lat}, ${activeScan?.gps_long}), suggest looking for nearest medical centers.
3. REGISTRY OPS: Help find specific people in the database based on blood group or conditions.

GUIDELINES:
- Be concise, tactical, and mission-oriented. 
- Use Markdown for bold headers and lists.
- For location queries, provide Google Maps Search links if coordinates exist: https://www.google.com/maps/search/hospital/@${activeScan?.gps_lat},${activeScan?.gps_long},15z
- NEVER mention "Groq", "LLaMA", or "AI Model". You are "Sehat Dispatch Intelligence".`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192', // Use 70B for high-fidelity reasoning
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.6,
        max_tokens: 800
      }),
    })

    const data = await res.json()
    
    if (data.error) throw new Error(data.error.message);

    const aiResponse = data.choices[0].message.content;

    return new Response(JSON.stringify({ content: aiResponse }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (err: any) {
    console.error("Dispatch AI Error:", err)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
