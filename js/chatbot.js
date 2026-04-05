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
                const text = event.results[0][0].transcript;
                $('ai-input').value = text;
                window.ChatAI.sendMessage();
            };

            recognition.onerror = () => {
                micIcon.classList.remove('text-red-500', 'animate-pulse');
                $('ai-input').placeholder = "Signal lost. Try typing.";
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
                        const { data, error } = await window.supabaseClient.functions.invoke('ai-dispatch-assistant', {
                            body: { ping: true }
                        });
                        
                        if (error) {
                            let detail = error.message;
                            if (error.context && typeof error.context.json === 'function') {
                                try {
                                    const body = await error.context.json();
                                    detail = body.error || body.message || error.message;
                                } catch(e) {}
                            }
                            efStatus = `Error: ${detail}`;
                        } else {
                            efStatus = data?.status === 'alive' ? "Responsive (Live)" : "Unexpected Response";
                        }
                    } catch (e) {
                        efStatus = "Unreachable (Check Network tab)";
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

                // Fetch context snapshot
                const patients = await window.Storage.getAllPatients() || [];
                const scans = await window.Storage.getScanLogs() || [];
                const metrics = {
                    totalUsers: $('metric-users')?.textContent || '0',
                    totalScans: $('metric-scans')?.textContent || '0',
                    lastSync: new Date().toLocaleTimeString()
                };
                
                const context = {
                    patients: patients.slice(0, 30), // Smaller slice for speed
                    latestScans: scans.slice(0, 10),
                    systemMetrics: metrics,
                    activeScan: window.activeConsoleScan || null,
                    activePatient: window.activeConsolePatient || null
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
                    let detail = "Unable to stabilize signal. Terminal offline.";
                    if (error?.context && typeof error.context.json === 'function') {
                        try {
                            const errBody = await error.context.json();
                            detail = `**[ENGINE FAILURE]** ${errBody.error || errBody.message || error.message}`;
                        } catch(e) {}
                    }
                    addMessageToUI('ai', detail);
                    return;
                }

                // 5. Actionable Handling
                if (data.action) {
                    handleAIAction(data.action);
                }

                // Update memory and UI
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

    function handleAIAction(action) {
        console.log('[SehatAI] Executing Tactical Action:', action);
        if (action.type === 'view_patient' && action.id) {
            if (window.switchTab) window.switchTab('registry');
            if ($('db-search')) {
                $('db-search').value = action.id;
                $('db-search').dispatchEvent(new Event('input'));
            }
        } else if (action.type === 'system_check') {
            if (window.refreshMetrics) window.refreshMetrics();
        }
    }

    function addMessageToUI(sender, text) {
        const container = $('ai-messages');
        if (!container) return;

        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${sender === 'ai' ? 'message-ai' : 'message-user'}`;
        
        // Advanced Format (Headers, Breaks, Bold, Links)
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="text-amber-400 underline">$1</a>');
        
        // Pass-through for our custom AI tactical classes (Safe subset of HTML)
        // Note: In production, use a proper sanitizer like DOMPurify.
        bubble.innerHTML = formatted;
        
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
        if (window.lucide) lucide.createIcons();
    }
})();
