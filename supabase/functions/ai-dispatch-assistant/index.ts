// ─── Supabase Edge Function: ai-dispatch-assistant ───
// Deployment: supabase functions deploy ai-dispatch-assistant

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'X-Groq-Status'
};

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

Deno.serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { messages, context, ping } = body;
    
    // PING HANDLER (DIAGNOSTIC)
    if (ping) {
      const statusInfo = {
        status: "alive",
        key_status: GROQ_API_KEY ? "CONFIGURED" : "MISSING",
        version: "2.1.0-MISSION-READY",
        environment: Deno.env.get('SUPABASE_URL') ? "PRODUCTION" : "LOCAL"
      };
      return new Response(JSON.stringify(statusInfo), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Groq-Status': GROQ_API_KEY ? 'READY' : 'KEY_MISSING' }
      });
    }

    const { patients, latestScans, systemMetrics, activeScan, activePatient } = context || {};
    console.log(`[SehatAI Hub] Request received. Key: ${GROQ_API_KEY ? 'Present' : 'MISSING'}.`);

    if (!GROQ_API_KEY) {
      const fallbackResponse = generateLocalTacticalResponse(context);
      return new Response(JSON.stringify({ content: fallbackResponse }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Groq-Status': 'FALLBACK' } 
      });
    }

    // Call Groq API
    let groqData;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: getSystemPrompt(context) },
            ...messages
          ],
          temperature: 0.5,
          max_tokens: 1000
        }),
      });

      clearTimeout(timeoutId);
      groqData = await res.json();
      
      if (groqData.error) {
        throw new Error(`[GROQ_API_ERROR] ${groqData.error.message || 'Unknown Failure'}`);
      }
    } catch (apiErr: any) {
       console.error("Groq Network/API Failure:", apiErr);
       const errorMsg = apiErr.name === 'AbortError' ? "AI Uplink Timeout (12s). Regional latency detected." : apiErr.message;
       return new Response(JSON.stringify({ error: errorMsg, is_retryable: true }), { 
         status: 502,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    let content = groqData.choices[0].message.content;
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
    });
    
  } catch (err: any) {
    console.error("Final Hub Logic Error:", err);
    return new Response(JSON.stringify({ error: `MISSION CONTROL ERROR: ${err.message}` }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

function getSystemPrompt(ctx: any) {
  const { patients, systemMetrics, activeScan, activePatient } = ctx || {};
  const registryText = patients && patients.length > 0 
    ? `REGISTRY DATA (${patients.length} records): ${JSON.stringify(patients.map((p:any) => ({ name: p.fullName, blood: p.bloodGroup, cond: p.conditions })))}`
    : 'REGISTRY DATA: Empty or Restricted Access.';

  return `You are Sehat Dispatch Intelligence (V2). Your objective: Tactical support for the Sehat Point Emergency Administrator.

TACTICAL FEED:
- ACTIVE INCIDENT: ${activeScan ? `Location: ${activeScan.location || activeScan.gps_lat + ',' + activeScan.gps_long}. Type: ${activeScan.type}` : 'Sector Clear'}
- RISK PATIENT: ${activePatient ? `${activePatient.fullName} (Blood: ${activePatient.bloodGroup}, Allergies: ${activePatient.allergies})` : 'None'}
- METRICS: Profiles: ${systemMetrics?.totalUsers || '0'}, Scans: ${systemMetrics?.totalScans || '0'}
- ${registryText}

CAPABILITIES:
1. INFRASTRUCTURE: Report on system health or scan volume.
2. TRIAGE: Analyze blood groups and allergies.
3. REGISTRY AUDIT: If asked to "analyze the registry" or "audit personnel", use the REGISTRY DATA above to provide a professional summary of available medical readiness and personnel health trends.
4. ACTION TRIGGERING: If the user wants to see a patient, include :::ACTION:::{"type":"view_patient","id":"ID"}::: at the end.

RESPONSE FORMAT:
- Use Markdown. Use Bold headers.
- Use <div class="ai-alert">**CRITICAL** text</div> for alerts.
- Use <table class="ai-table"> for tables.`;
}

function generateLocalTacticalResponse(ctx: any) {
    const { activeScan, activePatient, patients } = ctx;
    let response = "### 📡 TACTICAL FALLBACK ACTIVE\n\nI am currently operating on internal logic due to primary cloud latency (API Key Missing). Here is my assessment:\n\n";

    if (activePatient) {
        response += `* **CRITICAL ALERT**: Active patient **${activePatient.fullName || 'Unknown'}** has the following conditions: _${activePatient.conditions || 'None listed'}_. Verify medication compatibility immediately.\n`;
        if (activePatient.bloodGroup) response += `* **BLOOD TYPE**: ${activePatient.bloodGroup}. Prepare matching units if trauma is expected.\n`;
    }

    if (activeScan && activeScan.gps_lat) {
        const mapLink = `https://www.google.com/maps/search/hospital/@${activeScan.gps_lat},${activeScan.gps_long},15z`;
        response += `* **LOGISTICS**: Incident detected at [${activeScan.gps_lat}, ${activeScan.gps_long}](${mapLink}). Please direct the nearest ambulance to this sector.\n`;
    }

    if (patients && patients.length > 0) {
        response += `* **REGISTRY**: I have localized ${patients.length} personnel profiles for tactical lookup.\n`;
    }

    response += "\n> [!TIP]\n> Configure your \`GROQ_API_KEY\` in the Supabase Dashboard to restore full multi-modal tactical reasoning.";
    
    return response;
}
