/* ============================================================
   chatbot.js — Sehat Tactical Dispatch Intelligence
   Features: Contextual AI Assistance, Live Registry Access,
             Rescue Optimization & Mission Support.
   ============================================================ */

(function() {
    const $ = (id) => document.getElementById(id);
    let _isOpen = false;
    let _messages = []; // Current session history (kept in memory)

    window.ChatAI = {
        toggle: () => {
            const win = $('ai-chat-window');
            if (!win) return;
            
            if (_isOpen) {
                win.classList.add('scale-95', 'opacity-0');
                setTimeout(() => win.classList.add('hidden'), 300);
            } else {
                win.classList.remove('hidden');
                setTimeout(() => win.classList.remove('scale-95', 'opacity-0'), 10);
                $('ai-input').focus();
            }
            if (window.lucide) lucide.createIcons();
            _isOpen = !_isOpen;
        },

        sendMessage: async (e) => {
            if (e) e.preventDefault();
            const input = $('ai-input');
            const query = input.value.trim();
            if (!query) return;

            // 1. Add User Message to UI
            input.value = '';
            addMessageToUI('user', query);

            // 2. Prepare Context
            const typing = $('ai-typing');
            typing.classList.remove('hidden');

            try {
                // 3. DEBUG COMMAND HANDLER
                if (query.toLowerCase() === '/debug') {
                    typing.classList.add('hidden');
                    const bypass = localStorage.getItem('master_bypass');
                    const supabaseStatus = window.supabaseClient ? 'Online' : 'Offline';
                    
                    // Edge Function Ping Test
                    let efStatus = "Testing...";
                    try {
                        const { error } = await window.supabaseClient.functions.invoke('ai-dispatch-assistant', {
                            body: { ping: true }
                        });
                        efStatus = error ? `Error: ${error.message}` : "Responsive (Live)";
                    } catch (e) {
                        efStatus = "Unreachable (Network Block)";
                    }

                    addMessageToUI('ai', `**[AI TACTICAL DIAGNOSTICS]**
- **Session**: ${bypass === 'true' ? 'Master Bypass (Admin)' : 'Standard Auth'}
- **Supabase Cloud**: ${supabaseStatus}
- **Edge Function**: ${efStatus}
- **Endpoint**: ai-dispatch-assistant

> [!NOTE]
> If the status is **'Unreachable'**, verify your local server is NOT blocking CORS and the function is deployed:
> \`supabase functions deploy ai-dispatch-assistant\``);
                    return;
                }

                // Fetch registry snapshot
                const patients = await window.Storage.getAllPatients() || [];
                const currentUser = await window.Auth.getUser();
                
                const context = {
                    patients: patients.map(p => ({
                        name: p.fullName,
                        blood: p.bloodGroup,
                        conditions: p.conditions,
                        allergies: p.allergies
                    })).slice(0, 50), // Send first 50 for token management
                    activeScan: window.activeConsoleScan || null,
                    activePatient: window.activeConsolePatient || null,
                    adminEmail: currentUser?.email || 'master-bypass-active'
                };

                // 4. Call AI Hub
                const { data, error } = await window.supabaseClient.functions.invoke('ai-dispatch-assistant', {
                    body: { 
                        messages: [..._messages.map(m => ({ role: m.role, content: m.text })), { role: 'user', content: query }],
                        context: context
                    }
                });

                typing.classList.add('hidden');

                if (error || !data) {
                    console.error('[SehatAI] Dispatch Error:', error);
                    let errMsg = "Unable to stabilize signal. Terminal offline.";
                    if (error?.message?.includes('401') || error?.message?.includes('Unauthorized')) {
                        errMsg = "**[AUTH FAILURE]** Mission Control has rejected the connection. Check your API Key in Supabase Secrets.";
                    } else if (error?.message?.includes('500')) {
                        errMsg = "**[ENGINE FAILURE]** The Groq LLaMA Engine encountered an error. This usually means the API key is invalid or not yet configured.";
                    }
                    addMessageToUI('ai', errMsg);
                    return;
                }

                // 4. Update memory and UI
                _messages.push({ role: 'user', text: query });
                _messages.push({ role: 'assistant', text: data.content });
                addMessageToUI('ai', data.content);

            } catch (err) {
                console.error('[SehatAI] Critical Failure:', err);
                typing.classList.add('hidden');
                addMessageToUI('ai', "Signal failure. AI Hub connection severed.");
            }
        }
    };

    function addMessageToUI(sender, text) {
        const container = $('ai-messages');
        if (!container) return;

        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${sender === 'ai' ? 'message-ai' : 'message-user'}`;
        
        // Simple Markdown-to-HTML (bold, links, breaks)
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-amber-400 underline">$1</a>');
        
        bubble.innerHTML = formatted;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
        if (window.lucide) lucide.createIcons();
    }
})();
