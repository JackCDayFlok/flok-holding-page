
(function () {
    const stage = document.querySelector('.hiw-stage');
    if (!stage) return;

    const steps = Array.from(stage.querySelectorAll('.hiw-step'));
    const dots = Array.from(document.querySelectorAll('.hiw-dot'));
    if (steps.length <= 1) return;

    const INTERVAL_MS = 5000;
    let idx = steps.findIndex(s => s.classList.contains('is-active'));
    if (idx < 0) idx = 0;

    let timer = null;
    let isInView = true;          // updated by IO
    let isFocused = false;        // focus within stage
    let hoverTimer = null;        // delayed hover pause
    let isHoverPaused = false;    // only true after delay elapses

    const setActive = (n) => {
        steps[idx]?.classList.remove('is-active');
        dots[idx]?.classList.remove('is-active');
        idx = (n + steps.length) % steps.length;
        steps[idx].classList.add('is-active');
        dots[idx]?.classList.add('is-active');
        stage.dataset.step = steps[idx].dataset.step;
    };

    const next = () => setActive(idx + 1);
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const start = () => {
        // only run when visible, not focused, not hover-paused, and tab visible
        if (timer || !isInView || isFocused || isHoverPaused || document.hidden) return;
        timer = setInterval(next, INTERVAL_MS);
    };

    // —— Visibility in viewport ——
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            const e = entries[0];
            isInView = e && e.isIntersecting;
            if (isInView) start(); else stop();
        }, { root: null, threshold: 0.1 });
        io.observe(stage);
    }

    // —— Pause on keyboard focus within the block ——
    stage.addEventListener('focusin', () => { isFocused = true; stop(); });
    stage.addEventListener('focusout', () => { isFocused = false; start(); });

    // —— Tab visibility ——
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
    });

    // —— Make dots clickable ——
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            stop(); // Stop auto-rotation
            setActive(index); // Go to clicked step
            // Resume auto-rotation after a delay
            setTimeout(() => {
                start();
            }, INTERVAL_MS);
        });
    });

    // Safety: resume after layout changes/scroll if eligible
    window.addEventListener('scroll', start, { passive: true });
    window.addEventListener('resize', start);

    // Go
    start();
})();