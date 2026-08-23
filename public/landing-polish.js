/**
 * Landing-page motion polish for ui-test.
 * Safe no-op if landing view markup is missing.
 */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function formatGBP(value, decimals) {
    return (
      '£' +
      value.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    );
  }

  function animateCount(el, duration) {
    const target = Number(el.getAttribute('data-count') || 0);
    const decimals = Number(el.getAttribute('data-decimals') || 0);
    if (reduceMotion) {
      el.textContent = formatGBP(target, decimals);
      return;
    }
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatGBP(target * eased, decimals);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = formatGBP(target, decimals);
    }
    requestAnimationFrame(frame);
  }

  function initHeroPreview() {
    const preview = document.getElementById('hero-preview');
    if (!preview) return;

    let counted = false;
    const run = () => {
      preview.classList.add('in');
      if (counted) return;
      counted = true;
      preview.querySelectorAll('.count-up').forEach((el) => animateCount(el, 1100));
    };

    if (reduceMotion) {
      run();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            run();
            io.disconnect();
          }
        });
      },
      { threshold: 0.25 }
    );
    io.observe(preview);
    // If already visible on load (common on desktop), kick off shortly after paint.
    requestAnimationFrame(() => {
      const rect = preview.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) run();
    });
  }

  function initNavScroll() {
    const header = document.querySelector('#view-landing .sticky-header');
    if (!header) return;
    const onScroll = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function initPlatformPulse() {
    const pills = Array.from(document.querySelectorAll('[data-platform-pill]'));
    if (!pills.length || reduceMotion) return;
    let i = 0;
    const tick = () => {
      pills.forEach((p) => p.classList.remove('is-live'));
      pills[i % pills.length].classList.add('is-live');
      i += 1;
    };
    tick();
    setInterval(tick, 2600);
  }

  function initHowSteps() {
    const steps = document.querySelectorAll('.how-step');
    if (!steps.length) return;
    if (reduceMotion) {
      steps.forEach((s) => s.classList.add('is-active'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-active', entry.isIntersecting);
        });
      },
      { threshold: 0.55 }
    );
    steps.forEach((s) => io.observe(s));
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function initMobileNav() {
    const btn = document.getElementById('mobile-nav-btn');
    const panel = document.getElementById('mobile-nav');
    if (!btn || !panel) return;

    const setOpen = (open) => {
      panel.classList.toggle('is-open', open);
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    btn.addEventListener('click', () => {
      setOpen(!panel.classList.contains('is-open'));
    });

    panel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });

    window.addEventListener(
      'resize',
      () => {
        if (window.matchMedia('(min-width: 769px)').matches) setOpen(false);
      },
      { passive: true }
    );
  }

  function init() {
    refreshIcons();
    initNavScroll();
    initMobileNav();
    initHeroPreview();
    initPlatformPulse();
    initHowSteps();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // app.js may still be running; wait a tick so lucide icons exist.
    setTimeout(init, 0);
  }
})();
