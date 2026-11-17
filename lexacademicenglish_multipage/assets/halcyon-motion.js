(function () {
  // 1. Sticky Frosted Header on Scroll
  const header = document.getElementById('halcyon-header');
  if (header) {
    const syncHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 28);
    };
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
  }

  // 2. Smooth Gliding Scroll Reveals
  const revealEls = document.querySelectorAll('.glide-reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // 3. Mobile Drawer Toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const drawer = document.getElementById('mobile-drawer');
  if (menuBtn && drawer) {
    menuBtn.addEventListener('click', () => {
      drawer.classList.toggle('hidden');
    });
  }

  // 4. Hover Link Prefetching (Excludes /students/ to avoid premature Access redirect)
  const prefetched = new Set();
  document.querySelectorAll('a[href^="/"]').forEach((link) => {
    link.addEventListener(
      'pointerenter',
      () => {
        const url = link.href;
        if (prefetched.has(url) || url.includes('/students/')) return;
        prefetched.add(url);
        const hint = document.createElement('link');
        hint.rel = 'prefetch';
        hint.href = url;
        document.head.appendChild(hint);
      },
      { passive: true }
    );
  });
})();
