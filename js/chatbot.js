/* ============================================================
   chatbot.js — Sehat Tactical Dispatch Intelligence
   Features: Contextual AI Assistance, Live Registry Access,
             Rescue Optimization & Mission Support.
   ============================================================ */(function() {
    const $ = (id) => document.getElementById(id);
    let _isOpen = false;
    let _messages = []; 
    let _isCheckingStatus = false;

    window.ChatAI = {
        toggle: async () => {
            const win = $('ai-chat-window');
            if (!win) return;
            
            if (_isOpen) {
                win.classList.add('scale-95', 'opacity-0');
                setTimeout(() => win.classList.add('hidden'), 300);
            } else {
                win.classList.remove('hidden');
                setTimeout(() => win.classList.remove('scale-95', 'opacity-0'), 10);
                $('ai-input').focus();
                
                // Mission Handshake (Status Check)
                if (!_isCheckingStatus) checkSystemStatus();
            }
            if (window.lucide) lucide.createIcons();
            _isOpen = !_isOpen;
        },

        quickQuery: (text) => {
            $('ai-input').value = text;
            window.ChatAI.sendMessage();
        },

        startVoice: () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return alert('Speech recognition not supported in this browser.');
            const recognition = new SpeechRecognition();
            const micIcon = $('mic-icon');
            recognition.onstart = () => {
                micIcon.classList.add('text-red-500', 'animate-pulse');
                $('ai-input').placeholder = "Listening...";
            };
            recognition.onresult = (event) => {
                $('ai-input').value = event.results[0][0].transcript;
                window.ChatAI.sendMessage();
            };
            recognition.onend = () => {
                micIcon.classList.remove('text-red-500', 'animate-pulse');
                $('ai-input').placeholder = "Query Intelligence...";
            };
            recognition.start();
        },

        sendMessage: async (e) => {
            if (e) e.preventDefault();
            const input = $('ai-input');
            const query = input.value.trim();
            if (!query) return;

            input.value = '';
            addMessageToUI('user', query);

            const typing = $('ai-typing');
            typing.classList.remove('hidden');

            try {
                // TACTICAL DIAGNOSTICS OVERRIDE
                if (query.toLowerCase() === '/debug' || query.toLowerCase() === '/status') {
                    typing.classList.add('hidden');
                    const results = await runDiagnosticCheck();
                    addMessageToUI('ai', results);
                    return;
                }

                // Call AI Hub
                const context = await getTacticalContext();
                const { data, error } = await window.supabaseClient.functions.invoke('ai-dispatch-assistant', {
                    body: { 
                        messages: [..._messages.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: query }],
                        context: context
                    }
                });

                typing.classList.add('hidden');

                if (error || !data) {
                    const errMsg = await parseError(error);
                    addMessageToUI('ai', `**[UPLINK FAILURE]** ${errMsg}\n\n> Please run \`/debug\` to verify mission parameters.`);
                    return;
                }

                if (data.action) handleAIAction(data.action);

                _messages.push({ role: 'user', text: query });
                _messages.push({ role: 'assistant', text: data.content });
                addMessageToUI('ai', data.content);

            } catch (err) {
                console.error('[SehatAI] Failure:', err);
                typing.classList.add('hidden');
                addMessageToUI('ai', "**[SIGNAL SEVERED]** AI Hub is unreachable. Verify Supabase Cloud status.");
            }
        }
    };

    async function checkSystemStatus() {
        _isCheckingStatus = true;
        try {
            const { data } = await window.supabaseClient.functions.invoke('ai-dispatch-assistant', { body: { ping: true } });
            if (data && data.key_status === 'MISSING') {
                addMessageToUI('ai', "> [!WARNING]\n> **AI HUB DEGRADED**: `GROQ_API_KEY` is not configured in Supabase. I am currently running on local tactical fallback logic.");
            }
        } catch(e) {}
    }

    async function runDiagnosticCheck() {
        const bypass = localStorage.getItem('master_bypass');
        let statusText = `### 🛰️ SEHAT TACTICAL DIAGNOSTICS\n\n`;
        statusText += `- **Auth Mode**: ${bypass === 'true' ? 'Master Bypass' : 'Standard Session'}\n`;
        statusText += `- **Cloud Client**: ${window.supabaseClient ? '📡 ONLINE' : '❌ OFFLINE'}\n`;
        
        try {
            const start = Date.now();
            const { data, error } = await window.supabaseClient.functions.invoke('ai-dispatch-assistant', { body: { ping: true } });
            const lat = Date.now() - start;
            
            if (error) throw error;
            statusText += `- **AI Hub Hub**: ✅ OPERATIONAL\n`;
            statusText += `- **Intelligence Key**: ${data.key_status === 'CONFIGURED' ? '✅ READY' : '⚠️ MISSING'}\n`;
            statusText += `- **Hub Latency**: ${lat}ms\n`;
            statusText += `- **Engine Build**: ${data.version || 'v2.0'}\n`;
        } catch (e) {
            statusText += `- **AI Hub Hub**: ❌ UNREACHABLE\n`;
            statusText += `- **Error Detail**: ${e.message || 'CORS or Deployment failure'}\n`;
            statusText += `\n> [!CAUTION]\n> Run \`supabase functions deploy ai-dispatch-assistant\` locally to ensure the hub is active.`;
        }
        return statusText;
    }

    async function getTacticalContext() {
        const patients = await window.Storage.getAllPatients() || [];
        return {
            patients: patients.slice(0, 30),
            systemMetrics: { totalUsers: $('metric-users')?.textContent || '0', totalScans: $('metric-scans')?.textContent || '0' },
            activeScan: window.activeConsoleScan || null,
            activePatient: window.activeConsolePatient || null,
            registryCount: patients.length
        };
    }

    async function parseError(err) {
        if (!err) return "Unknown Error";
        if (err.context && typeof err.context.json === 'function') {
            try { return (await err.context.json()).error || err.message; } catch(e) {}
        }
        return err.message;
    }

    function handleAIAction(action) {
        if (action.type === 'view_patient' && action.id) {
            if (window.switchTab) window.switchTab('registry');
            if ($('db-search')) {
                $('db-search').value = action.id;
                $('db-search').dispatchEvent(new Event('input'));
            }
        }
    }

    function addMessageToUI(sender, text) {
        const container = $('ai-messages');
        if (!container) return;
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${sender === 'ai' ? 'message-ai' : 'message-user'}`;
        
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/### (.*?)\n/g, '<h4 class="text-amber-500 font-black uppercase text-[10px] tracking-widest mb-1">$1</h4>')
            .replace(/\n/g, '<br>')
            .replace(/> \[!WARNING\]<br>(.*?)(?=<br>|$)/g, '<div class="ai-warning">$1</div>')
            .replace(/> \[!CAUTION\]<br>(.*?)(?=<br>|$)/g, '<div class="ai-alert">$1</div>')
            .replace(/<table/g, '<table class="ai-table"');
        
        bubble.innerHTML = html;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
        if (window.lucide) lucide.createIcons();
    }
})();
