(() => {
  document.documentElement.classList.add('js');
  const header = document.querySelector('[data-header]');
  const toggle = document.querySelector('[data-menu-toggle]');
  if (header) {
    // Hysteresis: the sticky header shrinks when scrolled, which shifts the page by ~14px. A single threshold
    // made the header flicker (and content jump) when the page sat near it, so it switches on/off at different points.
    const onScroll = () => {
      const y = window.scrollY;
      if (y > 64) header.classList.add('is-scrolled');
      else if (y < 8 && !(toggle && toggle.getAttribute('aria-expanded') === 'true')) header.classList.remove('is-scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile menu
  const menu = document.querySelector('[data-mobile-menu]');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
      header.classList.toggle('is-scrolled', open || window.scrollY > 64);
      if (open) menu.querySelector('a')?.focus();
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); } });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
  }

  // Filters: submit on change; keep drawer open on desktop
  document.querySelectorAll('[data-filters]').forEach((form) => {
    form.addEventListener('change', () => form.requestSubmit());
  });

  // Deferred map (privacy: Google only loads on request)
  document.querySelectorAll('[data-map]').forEach((box) => {
    box.querySelector('[data-load-map]')?.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = box.dataset.src.replace(/&amp;/g, '&');
      f.title = 'Map';
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      box.replaceChildren(f);
      box.classList.add('is-loaded');
      f.focus();
    });
  });

  // Form helpers (shared with apply-start.js)
  window.IK = window.IK || {};
  IK.showErrors = (form, errors) => {
    form.querySelectorAll('.error').forEach((e) => { e.hidden = true; e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
      if (!input) return;
      input.setAttribute('aria-invalid', 'true');
      const err = document.getElementById(`${input.id}-err`);
      if (err) { err.textContent = msg; err.hidden = false; }
      first = first || input;
    });
    first?.focus();
  };
  IK.formData = (form) => {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = v; });
    form.querySelectorAll('input[type=checkbox]').forEach((c) => { o[c.name] = c.checked; });
    return o;
  };
  IK.post = async (url, body, extraHeaders = {}) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body), credentials: 'same-origin' });
    let data = {};
    try { data = await r.json(); } catch { /* ignore */ }
    return { ok: r.ok, status: r.status, data };
  };

  document.querySelectorAll('[data-enquiry]').forEach((form) => {
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; status.className = 'form-status'; status.textContent = '';
      const { ok, data } = await IK.post('/api/enquiry', IK.formData(form)).catch(() => ({ ok: false, data: {} }));
      btn.disabled = false;
      if (ok) {
        IK.showErrors(form, {});
        form.reset();
        status.textContent = data.emailDelivered ? 'Thanks, we’ve received your message and will be in touch soon.' : 'Thanks, your message has been saved for our team. (Email notifications are not switched on in this preview.)';
      } else if (data.errors) {
        IK.showErrors(form, data.errors);
      } else {
        status.classList.add('is-error');
        status.textContent = data.error || 'Sorry, something went wrong. Please try again or call us.';
      }
    });
  });
})();
