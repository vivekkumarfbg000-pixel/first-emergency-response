/* ============================================================
   app.js — Landing page interactions
   Scroll reveals, animated counters, smooth scroll
   ============================================================ */

(function() {
    'use strict';

    // ─── Auth State Handling ───
    async function updateNavAuth() {
        const user = await window.Auth.getUser();
        const actions = document.getElementById('nav-actions');
        if (!actions) return;

        if (user) {
            const isAdmin = await window.Auth.isAdmin();
            
            // Auto-redirect to dashboard when opening the app/landing page
            const path = window.location.pathname;
            if (path === '/' || path.endsWith('/index.html') || path.endsWith('/')) {
                window.location.href = isAdmin ? 'admin.html' : 'dashboard.html';
                return;
            }

            const dashLink = isAdmin ? 'admin.html' : 'dashboard.html';
            const dashLabel = isAdmin ? 'Admin Console' : 'Go to Dashboard';
            
            actions.innerHTML = `
                <a href="#how" class="btn btn-ghost btn-sm">How It Works</a>
                <a href="register.html" class="btn btn-ghost btn-sm">Create Profile</a>
                <div class="nav-divider" style="width:1px; height:20px; background:rgba(255,255,255,0.1); margin:0 0.5rem;"></div>
                <a href="${dashLink}" class="btn btn-primary btn-sm">${dashLabel}</a>
                <button onclick="window.Auth.signOut()" class="btn btn-ghost btn-sm">Sign Out</button>
            `;
        }
        lucide.createIcons();
    }
    updateNavAuth();

    // ─── Intersection Observer — Scroll Reveal ───
    const revealElements = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Trigger counter animation for stats
                if (entry.target.id === 'statsBanner') {
                    animateCounters();
                }
            }
        });
    }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // ─── Animated Number Counters ───
    let countersAnimated = false;

    function animateCounters() {
        if (countersAnimated) return;
        countersAnimated = true;

        const counters = document.querySelectorAll('[data-count]');
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-count'));
            const duration = 2000;
            const startTime = performance.now();
            const isPercent = counter.parentElement.querySelector('.percent');

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(eased * target);
                
                counter.textContent = current.toLocaleString() + (isPercent ? '%' : '+');

                if (progress < 1) {
                    requestAnimationFrame(update);
                }
            }

            requestAnimationFrame(update);
        });
    }

    // ─── Smooth Scroll for Anchors ───
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ─── Nav Background on Scroll ───
    const nav = document.getElementById('mainNav');
    if (nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 80) {
                nav.style.background = 'rgba(6, 9, 16, 0.9)';
                nav.style.borderColor = 'rgba(255,255,255,0.08)';
            } else {
                nav.style.background = 'var(--bg-card)';
                nav.style.borderColor = 'var(--border)';
            }
        });
    }

})();
