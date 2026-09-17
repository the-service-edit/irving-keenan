/* Irving & Keenan, accessible date picker (DD/MM/YYYY, Australia/Perth).
   Replaces native <input type="date"> so every browser shows the same Australian format and calendar.
   - Values are plain 'YYYY-MM-DD' strings. No Date → UTC conversion is ever used for a selected day,
     so the day the applicant picks is the day that is saved.
   - Desktop/tablet: popover anchored to the field, flips above or aligns right when there isn't room.
   - Phones (≤ 560px): bottom sheet fixed to the viewport, so it can never be clipped or pushed off-screen.
   - Keyboard: arrows (day/week), Page Up/Down (month), Shift+Page Up/Down (year), Home/End (week),
     Enter/Space to choose, Esc to close. */
(() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-based
  const parts = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
  const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const weekday = (y, m, d) => (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; // Monday = 0
  const shift = (s, days) => { const p = parts(s); const t = new Date(Date.UTC(p.y, p.m, p.d + days)); return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  const shiftMonths = (s, n) => { const p = parts(s); const t = new Date(Date.UTC(p.y, p.m + n, 1)); const y = t.getUTCFullYear(); const m = t.getUTCMonth(); return iso(y, m, Math.min(p.d, daysIn(y, m))); };
  const isReal = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return false; const y = +m[1]; const mo = +m[2] - 1; const d = +m[3]; return mo >= 0 && mo < 12 && d >= 1 && d <= daysIn(y, mo); };
  const toAU = (s) => (isReal(s) ? s.split('-').reverse().join('/') : (s || ''));
  const clamp = (s, min, max) => (min && s < min ? min : max && s > max ? max : s);

  function perthToday() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }

  // Accepts 5/10/2026, 05-10-2026, 05.10.2026, 5 10 2026 and 05102026. Two-digit years are not guessed.
  function parseAU(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    let m = /^(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{4})$/.exec(t) || /^(\d{2})(\d{2})(\d{4})$/.exec(t);
    if (m) { const s = `${m[3]}-${pad(m[2])}-${pad(m[1])}`; return isReal(s) ? s : null; }
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m && isReal(t)) return t;
    return null;
  }

  // Auto-insert slashes while typing digits: 05102026 → 05/10/2026. If the applicant types their own
  // separators (5/10/2026) the text is left alone and the parser handles it.
  function maskInput(el) {
    el.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      const segs = el.value.split('/');
      if (!/^[\d/]*$/.test(el.value) || segs.slice(0, -1).some((x) => x.length !== 2)) return;
      const d = el.value.replace(/\D/g, '').slice(0, 8);
      let out = d.slice(0, 2);
      if (d.length >= 2) out += `/${d.slice(2, 4)}`;
      if (d.length >= 4) out += `/${d.slice(4)}`;
      if (out !== el.value) el.value = out;
    });
  }

  let openPicker = null;

  function enhance(wrap, { onChange } = {}) {
    if (wrap.dataset.dpReady) return;
    wrap.dataset.dpReady = '1';
    const text = wrap.querySelector('[data-date-text]');
    const store = wrap.querySelector('[data-date-value]');
    const btn = wrap.querySelector('[data-date-toggle]');
    const min = wrap.dataset.min || null;
    const max = wrap.dataset.max || null;
    const label = wrap.dataset.label || 'date';
    maskInput(text);

    const commitText = () => {
      const v = parseAU(text.value);
      // Unparseable text is kept as typed so the applicant's input isn't lost, and the server explains the problem.
      store.value = v === null ? text.value.trim() : v;
      onChange?.(store.value);
    };
    text.addEventListener('input', commitText);
    text.addEventListener('blur', () => { const v = parseAU(text.value); if (v) text.value = toAU(v); });

    let pop = null; let backdrop = null; let view = null; let focusDay = null;

    function build() {
      pop = document.createElement('div');
      pop.className = 'dp';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-modal', 'false');
      pop.setAttribute('aria-label', `Choose ${label}`);
      pop.id = `${text.id}-dp`;
      pop.innerHTML = `
<div class="dp-head">
  <button type="button" class="dp-nav" data-dp-prev aria-label="Previous month"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>
  <div class="dp-selects">
    <label class="visually-hidden" for="${text.id}-dp-m">Month</label><select id="${text.id}-dp-m" data-dp-month>${MONTHS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
    <label class="visually-hidden" for="${text.id}-dp-y">Year</label><select id="${text.id}-dp-y" data-dp-year></select>
  </div>
  <button type="button" class="dp-nav" data-dp-next aria-label="Next month"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
</div>
<table class="dp-grid" role="grid" aria-labelledby="${text.id}-dp-live"><thead><tr>${DAYS.map((d, i) => `<th scope="col" abbr="${DAYS_LONG[i]}">${d}</th>`).join('')}</tr></thead><tbody></tbody></table>
<p class="visually-hidden" id="${text.id}-dp-live" aria-live="polite"></p>
<div class="dp-foot"><button type="button" class="btn-link small" data-dp-today>Today</button><button type="button" class="btn-link small" data-dp-clear>Clear</button><button type="button" class="btn btn-dark btn-sm" data-dp-close>Close</button></div>`;
      const today = perthToday();
      const yMin = Number((min || `${Number(today.slice(0, 4)) - 110}`).slice(0, 4));
      const yMax = Number((max || `${Number(today.slice(0, 4)) + 5}`).slice(0, 4));
      const ysel = pop.querySelector('[data-dp-year]');
      for (let y = yMax; y >= yMin; y -= 1) ysel.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
      const todayBtn = pop.querySelector('[data-dp-today]');
      if ((min && today < min) || (max && today > max)) todayBtn.hidden = true;

      pop.addEventListener('click', (e) => {
        const day = e.target.closest('[data-day]');
        if (day && !day.disabled) { choose(day.dataset.day); return; }
        if (e.target.closest('[data-dp-prev]')) moveView(-1);
        else if (e.target.closest('[data-dp-next]')) moveView(1);
        else if (e.target.closest('[data-dp-today]')) choose(today);
        else if (e.target.closest('[data-dp-clear]')) { text.value = ''; store.value = ''; onChange?.(''); close(true); }
        else if (e.target.closest('[data-dp-close]')) close(true);
      });
      pop.querySelector('[data-dp-month]').addEventListener('change', (e) => setView(view.y, Number(e.target.value), true));
      ysel.addEventListener('change', (e) => setView(Number(e.target.value), view.m, true));
      pop.addEventListener('keydown', onKey);
    }

    function inRange(s) { return (!min || s >= min) && (!max || s <= max); }

    function setView(y, m, keepFocusOnSelect = false) {
      view = { y, m };
      const monthStart = iso(y, m, 1); const monthEnd = iso(y, m, daysIn(y, m));
      const prevOk = !min || iso(y, m, 1) > min; const nextOk = !max || monthEnd < max;
      pop.querySelector('[data-dp-prev]').disabled = !prevOk;
      pop.querySelector('[data-dp-next]').disabled = !nextOk;
      pop.querySelector('[data-dp-month]').value = String(m);
      const ysel = pop.querySelector('[data-dp-year]');
      if (![...ysel.options].some((o) => Number(o.value) === y)) ysel.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`);
      ysel.value = String(y);
      if (!focusDay || focusDay.slice(0, 7) !== monthStart.slice(0, 7)) focusDay = clamp(iso(y, m, Math.min(focusDay ? parts(focusDay).d : 1, daysIn(y, m))), min, max);
      const today = perthToday(); const sel = store.value;
      const lead = weekday(y, m, 1); const n = daysIn(y, m);
      let html = '<tr>'; let col = 0;
      for (let i = 0; i < lead; i += 1) { html += '<td></td>'; col += 1; }
      for (let d = 1; d <= n; d += 1) {
        const s = iso(y, m, d); const ok = inRange(s);
        html += `<td><button type="button" class="dp-day${s === today ? ' is-today' : ''}${s === sel ? ' is-selected' : ''}" data-day="${s}" tabindex="${s === focusDay ? 0 : -1}" aria-selected="${s === sel}"${ok ? '' : ' disabled aria-disabled="true"'} aria-label="${DAYS_LONG[weekday(y, m, d)]} ${d} ${MONTHS[m]} ${y}${s === today ? ', today' : ''}">${d}</button></td>`;
        col += 1;
        if (col === 7 && d < n) { html += '</tr><tr>'; col = 0; }
      }
      while (col > 0 && col < 7) { html += '<td></td>'; col += 1; }
      pop.querySelector('tbody').innerHTML = `${html}</tr>`;
      pop.querySelector(`#${CSS.escape(text.id)}-dp-live`).textContent = `${MONTHS[m]} ${y}`;
      if (!keepFocusOnSelect) pop.querySelector(`[data-day="${focusDay}"]`)?.focus();
    }

    function moveView(n) { const t = shiftMonths(iso(view.y, view.m, 1), n); const p = parts(t); focusDay = null; setView(p.y, p.m, true); }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Tab') { // keep focus inside the picker while it is open
        const f = [...pop.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), select')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
        return;
      }
      const day = e.target.closest('[data-day]');
      if (!day) return;
      const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let next = null;
      if (map[e.key] != null) next = shift(day.dataset.day, map[e.key]);
      else if (e.key === 'Home') next = shift(day.dataset.day, -weekday(...Object.values(parts(day.dataset.day))));
      else if (e.key === 'End') next = shift(day.dataset.day, 6 - weekday(...Object.values(parts(day.dataset.day))));
      else if (e.key === 'PageUp') next = shiftMonths(day.dataset.day, e.shiftKey ? -12 : -1);
      else if (e.key === 'PageDown') next = shiftMonths(day.dataset.day, e.shiftKey ? 12 : 1);
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!day.disabled) choose(day.dataset.day); return; }
      if (!next) return;
      e.preventDefault();
      next = clamp(next, min, max);
      focusDay = next;
      const p = parts(next);
      setView(p.y, p.m);
    }

    function choose(s) {
      if (!inRange(s)) return;
      store.value = s;
      text.value = toAU(s);
      text.dispatchEvent(new Event('change', { bubbles: true }));
      onChange?.(s);
      close(true);
    }

    function place() {
      const small = window.matchMedia('(max-width: 560px)').matches;
      pop.classList.toggle('dp-sheet', small);
      backdrop.hidden = !small;
      pop.style.top = ''; pop.style.bottom = ''; pop.style.left = ''; pop.style.right = '';
      pop.classList.remove('dp-above');
      if (small) return;
      const r = wrap.getBoundingClientRect();
      const h = pop.offsetHeight; const w = pop.offsetWidth;
      const below = window.innerHeight - r.bottom; const above = r.top;
      if (below < h + 12 && above > below) pop.classList.add('dp-above');
      if (r.left + w > document.documentElement.clientWidth - 8) { pop.style.left = 'auto'; pop.style.right = '0'; }
    }

    function open() {
      if (openPicker && openPicker !== api) openPicker.close(false);
      if (!pop) {
        build();
        backdrop = document.createElement('div');
        backdrop.className = 'dp-backdrop';
        backdrop.addEventListener('click', () => close(true));
        wrap.append(backdrop, pop);
      }
      pop.hidden = false;
      const today = perthToday();
      const start = isReal(store.value) ? store.value : clamp(today, min, max);
      focusDay = clamp(start, min, max);
      const p = parts(focusDay);
      setView(p.y, p.m, true);
      place();
      // If the field sits near the edge of the screen, bring the whole calendar into view.
      const pr = pop.getBoundingClientRect();
      if (pr.top < 0 || pr.bottom > window.innerHeight) pop.scrollIntoView({ block: 'nearest' });
      btn.setAttribute('aria-expanded', 'true');
      openPicker = api;
      pop.querySelector(`[data-day="${focusDay}"]`)?.focus();
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', escAnywhere);
      window.addEventListener('resize', place);
    }
    function escAnywhere(e) { if (e.key === 'Escape' && !pop.contains(e.target)) { e.preventDefault(); close(true); } }

    function close(returnFocus) {
      if (!pop || pop.hidden) return;
      pop.hidden = true; backdrop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escAnywhere);
      window.removeEventListener('resize', place);
      if (openPicker === api) openPicker = null;
      if (returnFocus) btn.focus();
    }

    function outside(e) { if (!wrap.contains(e.target)) close(false); }

    const api = { open, close, get isOpen() { return Boolean(pop && !pop.hidden); } };
    btn.addEventListener('click', () => (api.isOpen ? close(true) : open()));
    text.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); open(); } });
    wrap.ikDatePicker = api;
  }

  window.IKDate = { enhance, parseAU, toAU, perthToday, isReal };
})();
