/* ============================================================
   error-boundary.js — Global Error Catcher for Production
   Prevents the app from crashing silently.
   ============================================================ */

(function () {
    // Flag to prevent spamming the user with multiple error toasts
    let errorToastActive = false;

    function showErrorToast(msg, isCritical = false) {
        if (errorToastActive) return;
        errorToastActive = true;

        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] max-w-[90%] w-[340px] bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300 transform translate-y-full opacity-0';
        
        // Ensure Lucide icons will render if loaded, otherwise use an emoji fallback
        const iconHtml = window.lucide 
            ? `<i data-lucide="${isCritical ? 'alert-triangle' : 'wifi-off'}" class="w-5 h-5 ${isCritical ? 'text-red-500' : 'text-amber-500'}"></i>` 
            : `<span class="text-xl">${isCritical ? '⚠️' : '📡'}</span>`;

        toast.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="mt-0.5">${iconHtml}</div>
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-white uppercase tracking-widest">${isCritical ? 'System Error' : 'Connectivity Issue'}</h4>
                    <p class="text-[11px] text-slate-400 mt-1 leading-tight">${msg}</p>
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-1">
                <button id="err-btn-dismiss" class="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg">Dismiss</button>
                <button id="err-btn-reload" class="text-[10px] font-bold uppercase tracking-widest bg-white text-slate-900 hover:bg-slate-200 transition-colors px-3 py-1.5 rounded-lg shadow-sm">Reload App</button>
            </div>
        `;

        document.body.appendChild(toast);

        // Render icons if lucide is available
        if (window.lucide) {
            try { window.lucide.createIcons({ root: toast }); } catch (e) {}
        }

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-full', 'opacity-0');
        });

        // Handlers
        const removeToast = () => {
            toast.classList.add('translate-y-full', 'opacity-0');
            setTimeout(() => {
                if (document.body.contains(toast)) document.body.removeChild(toast);
                errorToastActive = false;
            }, 300);
        };

        toast.querySelector('#err-btn-dismiss').addEventListener('click', removeToast);
        toast.querySelector('#err-btn-reload').addEventListener('click', () => {
            window.location.reload();
        });

        // Auto dismiss non-critical errors after 8 seconds
        if (!isCritical) {
            setTimeout(removeToast, 8000);
        }
    }

    // Intercept uncaught synchronous errors
    window.addEventListener('error', function (e) {
        console.error('[Error Boundary] Caught Exception:', e.message);
        
        // Ignore cross-origin script errors which give 'Script error.'
        if (e.message && e.message.toLowerCase().includes('script error')) return;

        showErrorToast('A critical application error occurred. The system may be unstable.', true);
    });

    // Intercept unhandled Promise rejections (usually network/Supabase errors)
    window.addEventListener('unhandledrejection', function (e) {
        console.error('[Error Boundary] Unhandled Promise Rejection:', e.reason);
        
        let msg = 'Failed to synchronize with the cloud database. Please check your connection.';
        if (e.reason && e.reason.message) {
            if (e.reason.message.includes('fetch') || e.reason.message.includes('network')) {
                msg = 'Network connection lost. Switch to offline mode or check your signal.';
            } else {
                msg = `System Exception: ${e.reason.message}`;
            }
        }
        
        showErrorToast(msg, false);
    });

})();
