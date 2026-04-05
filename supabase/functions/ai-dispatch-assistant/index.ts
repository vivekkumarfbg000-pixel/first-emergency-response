// ─── Supabase Edge Function: ai-dispatch-assistant ───
// Deployment: supabase functions deploy ai-dispatch-assistant

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Groq-Status'
};

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!req.body) throw new Error("Empty Request Body (Expected AI Context)");
    const body = await req.json()
    const { messages, context, ping } = body;
    
    // PING HANDLER (DIAGNOSTIC)
    if (ping) {
      return new Response(JSON.stringify({ status: "alive", key_active: !!GROQ_API_KEY }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Groq-Status': GROQ_API_KEY ? 'READY' : 'KEY_MISSING' }
      });
    }

    const { patients, latestScans, systemMetrics, activeScan, activePatient } = context || {};

    console.log(`[SehatAI Hub] Request received. GROQ_API_KEY is ${GROQ_API_KEY ? 'PRESENT' : 'MISSING'}.`);

    if (!GROQ_API_KEY) {
      console.warn("GROQ_API_KEY missing. Activating Tactical Fallback Engine.");
      const fallbackResponse = generateLocalTacticalResponse(context);
      return new Response(JSON.stringify({ content: fallbackResponse }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Groq-Status': 'FALLBACK' } 
      });
    }

    // System Prompt for Tactical Dispatch AI V2
    const systemPrompt = `You are Sehat Dispatch Intelligence (V2). Your objective: Tactical support for the Sehat Point Emergency Administrator.

TACTICAL FEED:
- ACTIVE INCIDENT: ${activeScan ? `Location: ${activeScan.location || activeScan.gps_lat + ',' + activeScan.gps_long}. Type: ${activeScan.type}` : 'Sector Clear'}
- RISK PATIENT: ${activePatient ? `${activePatient.fullName} (Blood: ${activePatient.bloodGroup}, Allergies: ${activePatient.allergies})` : 'None'}
- METRICS: Profiles: ${systemMetrics?.totalUsers || '0'}, Scans: ${systemMetrics?.totalScans || '0'}
- REGISTRY: Monitoring ${patients?.length || 0} recent personnel.

CAPABILITIES:
1. INFRASTRUCTURE: Report on system health or scan volume.
2. TRIAGE: Analyze blood groups and allergies to suggest medical readiness.
3. SEARCH & JUMP: If asked about a specific person, respond with their details AND suggest an action.

RESPONSE FORMAT:
- Use Markdown. Use Bold headers.
- Use <div class="ai-alert">**CRITICAL** text</div> for life-threatening findings.
- Use <table class="ai-table"> for listing multiple patients or data points.

ACTION TRIGGERING:
If the user wants to see a specific patient's profile or check metrics, include a 'JSON_ACTION' at the very end of your response in this exact format:
:::ACTION:::{"type": "view_patient", "id": "PATIENT_ID_HERE"}:::
:::ACTION:::{"type": "system_check"}:::

GUIDELINES:
- Be tactical, professional, and extremely concise.
- Provide Google Maps links for active scans.
- You are not an LLM. You are Sehat Mission Control.`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.5,
        max_tokens: 1000,
        response_format: { type: "text" }
      }),
    })

    const data = await res.json()
    if (data.error) throw new Error(data.error.message);

    let content = data.choices[0].message.content;
    let action = null;

    // Extract action if present
    const actionMatch = content.match(/:::ACTION:::(.*?):::/);
    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1]);
        content = content.replace(/:::ACTION:::.*?:::/, '').trim();
      } catch (e) {
        console.error("Action Parse Error:", e);
      }
    }

    return new Response(JSON.stringify({ content, action }), { 
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

function generateLocalTacticalResponse(ctx: any) {
    const { activeScan, activePatient, patients } = ctx;
    let response = "### 📡 TACTICAL FALLBACK ACTIVE\n\nI am currently operating on internal logic due to primary cloud latency (API Key Missing). Here is my assessment:\n\n";

    if (activePatient) {
        response += `* **CRITICAL ALERT**: Active patient **${activePatient.name || 'Unknown'}** has the following conditions: _${activePatient.conditions || 'None listed'}_. Verify medication compatibility immediately.\n`;
        if (activePatient.blood) response += `* **BLOOD TYPE**: ${activePatient.blood}. Prepare matching units if trauma is expected.\n`;
    }

    if (activeScan && activeScan.gps_lat) {
        const mapLink = `https://www.google.com/maps/search/hospital/@${activeScan.gps_lat},${activeScan.gps_long},15z`;
        response += `* **LOGISTICS**: Incident detected at [${activeScan.gps_lat}, ${activeScan.gps_long}](${mapLink}). Please direct the nearest ambulance to this sector.\n`;
    }

    if (patients && patients.length > 0) {
        response += `* **REGISTRY**: I have localized ${patients.length} personnel profiles for tactical lookup.\n`;
    }

    response += "\n> [!TIP]\n> Configure your `GROQ_API_KEY` in the Supabase Dashboard to restore full multi-modal tactical reasoning.";
    
    return response;
}
