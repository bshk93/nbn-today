// The site's dropdown menu. Every <select> on every page opens this instead of
// the browser's own list, so the open menu looks the same everywhere (styled
// after the sidebar's account menu, css/components.css § Dropdown menu).
//
// It enhances the native select rather than replacing it: the <select> stays in
// the page as the source of truth. Page CSS, .value, form submits and every
// existing change listener keep working; this file only swaps the popup, and
// picking sets the select and dispatches the same bubbling input + change
// events the browser would. The menu is read from the live <option>s each time
// it opens, so there's no copy to drift when a page edits them or writes .value.
//
// Two modes:
// - Single (a plain <select>): the select itself stays the visible trigger.
//   Touch keeps the native picker, since the phone wheel beats anything drawn
//   here and custom touch handling has failed on iOS before (team.js, Roster
//   Settings); it still gets the shared closed look, which is pure CSS.
// - Multi (<select multiple>): a filter you can pick several values in. The
//   select is hidden behind a button that summarises the choice ("All teams",
//   "BOS", "3 teams"); the menu has checkboxes and a Clear / Apply footer, and
//   nothing changes until Apply (or Clear). The button takes the select's own
//   classes, so the page's sizing applies to it. Optional attributes on the
//   select: data-placeholder (shown when nothing is picked, default "All") and
//   data-noun (the plural for "3 teams", default "selected"). A page that sets
//   option.selected itself calls UiSelect.refresh(select) to update the button.
//
// A MutationObserver picks up selects pages build later (team.js,
// trade-builder.js). `size` > 1 listboxes and `data-native` are left alone.
//
// An option may carry `data-img="/logos/sm/logo-bos.webp"` for a 20px image
// beside its label (team logos). Not `data-icon`: css/ui-icons.css claims
// [data-icon] site-wide.
(function () {
  if (window.UiSelect) return;

  const FILTER_AT = 13;  // options before the menu grows a filter box
  let open = null;       // { sel, anchor, multi, menu, list, filter, items, active, pending }
  let uid = 0;

  function eligible(sel) {
    if (!(sel instanceof HTMLSelectElement) || sel.hasAttribute('data-native')) return false;
    return sel.multiple || !(sel.size > 1);
  }

  function enhance(sel) {
    if (!eligible(sel) || sel._uiDd) return;
    if (sel.multiple) return enhanceMulti(sel);
    sel._uiDd = { anchor: sel };
    sel.classList.add('ui-dd');
    sel.setAttribute('aria-haspopup', 'listbox');
    sel.setAttribute('aria-expanded', 'false');
  }

  function enhanceMulti(sel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = (sel.className ? sel.className + ' ' : '') + 'ui-dd ui-dd-trigger';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const label = sel.getAttribute('aria-label') || sel.title;
    if (label) btn.setAttribute('aria-label', label);
    btn.disabled = sel.disabled;
    sel._uiDd = { anchor: btn, multi: true };
    btn._uiDdSel = sel;
    sel.classList.add('ui-dd-hidden');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);
    btn.addEventListener('click', () => {
      if (open && open.sel === sel) close(false);
      else show(sel);
    });
    // Pages change selection through events too; keep the summary in step.
    sel.addEventListener('change', () => refresh(sel));
    refresh(sel);
  }

  function refresh(sel) {
    const st = sel && sel._uiDd;
    if (!st || !st.multi) return;
    const picked = [...sel.selectedOptions];
    const btn = st.anchor;
    btn.disabled = sel.disabled;
    btn.textContent = picked.length === 0 ? (sel.dataset.placeholder || 'All')
      : picked.length === 1 ? picked[0].textContent
      : `${picked.length} ${sel.dataset.noun || 'selected'}`;
    btn.classList.toggle('ui-dd-trigger--set', picked.length > 0);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SELECT') enhance(root);
    else root.querySelectorAll('select').forEach(enhance);
  }

  // ── Building the menu ──────────────────────────────────────────────────────

  function build(sel, multi) {
    const menu = document.createElement('div');
    menu.className = 'ui-dd-menu' + (multi ? ' ui-dd-menu--multi' : '');
    const list = document.createElement('div');
    list.className = 'ui-dd-list';
    list.setAttribute('role', 'listbox');
    list.id = 'ui-dd-list-' + (++uid);
    if (multi) list.setAttribute('aria-multiselectable', 'true');
    const label = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] && sel.labels[0].textContent.trim());
    if (label) list.setAttribute('aria-label', label);

    const items = [];
    const addOption = (opt, inGroup) => {
      if (opt.hidden) return;
      const item = document.createElement('div');
      item.className = 'ui-dd-item' + (inGroup ? ' ui-dd-item--grouped' : '');
      item.id = list.id + '-' + items.length;
      item.setAttribute('role', 'option');
      const disabled = opt.disabled || (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' && opt.parentElement.disabled);
      if (disabled) item.setAttribute('aria-disabled', 'true');
      if (multi) {
        const box = document.createElement('span');
        box.className = 'ui-dd-box';
        box.setAttribute('aria-hidden', 'true');
        box.innerHTML = '<span class="ui-icon ui-icon--check"></span>';
        item.appendChild(box);
      }
      if (opt.dataset.img) {
        const img = document.createElement('img');
        img.className = 'ui-dd-img';
        img.src = opt.dataset.img;
        img.alt = '';
        img.onerror = function () { this.style.visibility = 'hidden'; };
        item.appendChild(img);
      }
      const text = document.createElement('span');
      text.className = 'ui-dd-label';
      text.textContent = opt.label || opt.textContent;
      item.appendChild(text);
      if (!multi) {
        const check = document.createElement('span');
        check.className = 'ui-dd-check ui-icon ui-icon--check';
        check.setAttribute('aria-hidden', 'true');
        item.appendChild(check);
      }
      const entry = { item, opt, disabled, text: text.textContent.toLowerCase() };
      item.addEventListener('mousedown', e => e.preventDefault());  // keep focus where it is
      item.addEventListener('click', () => {
        if (entry.disabled) return;
        if (open.multi) { setActive(entry, false); toggle(entry); }
        else choose(entry);
      });
      item.addEventListener('mousemove', () => { if (!entry.disabled && open && open.active !== entry) setActive(entry, false); });
      items.push(entry);
      list.appendChild(item);
    };

    [...sel.children].forEach(child => {
      if (child.tagName === 'OPTGROUP') {
        const head = document.createElement('div');
        head.className = 'ui-dd-group';
        head.textContent = child.label;
        head.setAttribute('role', 'presentation');
        list.appendChild(head);
        [...child.children].forEach(o => { if (o.tagName === 'OPTION') addOption(o, true); });
      } else if (child.tagName === 'OPTION') {
        addOption(child, false);
      }
    });

    let filter = null;
    if (items.length >= FILTER_AT) {
      filter = document.createElement('input');
      filter.type = 'search';
      filter.className = 'ui-dd-filter';
      filter.placeholder = 'Filter…';
      filter.setAttribute('autocomplete', 'off');
      filter.setAttribute('aria-controls', list.id);
      filter.addEventListener('input', () => applyFilter());
      filter.addEventListener('keydown', onKey);
      menu.appendChild(filter);
    }
    menu.appendChild(list);

    let count = null;
    if (multi) {
      const foot = document.createElement('div');
      foot.className = 'ui-dd-foot';
      count = document.createElement('span');
      count.className = 'ui-dd-count';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'ui-btn ui-btn--ghost ui-btn--sm';
      clear.textContent = 'Clear';
      clear.addEventListener('click', () => { open.pending.clear(); commit(); });
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'ui-btn ui-btn--primary ui-btn--sm';
      apply.textContent = 'Apply';
      apply.addEventListener('click', () => commit());
      foot.append(count, clear, apply);
      foot.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(true); } });
      menu.appendChild(foot);
    }
    return { menu, list, filter, items, count };
  }

  function applyFilter() {
    const q = open.filter.value.trim().toLowerCase();
    open.items.forEach(e => { e.item.hidden = !!q && !e.text.includes(q); });
    // Hide a group header whose options are all filtered out.
    open.list.querySelectorAll('.ui-dd-group').forEach(h => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('ui-dd-group')) { if (!n.hidden) { any = true; break; } n = n.nextElementSibling; }
      h.hidden = !any;
    });
    const first = open.items.find(e => !e.item.hidden && !e.disabled);
    if (!open.active || open.active.item.hidden) setActive(first || null, true);
  }

  // ── Open / close ───────────────────────────────────────────────────────────

  function show(sel) {
    if (open && open.sel === sel) return;
    close(false);
    const st = sel._uiDd;
    const built = build(sel, !!st.multi);
    if (!built.items.length) return;
    open = Object.assign({ sel, anchor: st.anchor, multi: !!st.multi, active: null }, built);
    if (open.multi) open.pending = new Set([...sel.selectedOptions].map(o => o.index));
    paint();
    document.body.appendChild(open.menu);
    place();
    const a = open.anchor;
    a.setAttribute('aria-expanded', 'true');
    a.setAttribute('aria-controls', open.list.id);
    a.classList.add('ui-dd-open');
    const current = open.items.find(e => e.opt.index === sel.selectedIndex && !e.disabled)
                 || open.items.find(e => !e.disabled);
    setActive(current || null, true);
    // Not after a tap: focusing the box would throw the phone keyboard over the list.
    if (open.filter && lastPointer !== 'touch') open.filter.focus({ preventScroll: true });
  }

  // aria-selected from the select (single) or from the unapplied picks (multi).
  function paint() {
    open.items.forEach(e => {
      const on = open.multi ? open.pending.has(e.opt.index) : e.opt.index === open.sel.selectedIndex;
      e.item.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (open.count) open.count.textContent = open.pending.size ? `${open.pending.size} selected` : '';
  }

  function place() {
    const { anchor, menu, list } = open;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 4, edge = 8;
    menu.style.minWidth = Math.min(r.width, vw - edge * 2) + 'px';
    menu.style.maxWidth = (vw - edge * 2) + 'px';
    list.style.maxHeight = '';
    const below = vh - r.bottom - gap - edge, above = r.top - gap - edge;
    const want = menu.offsetHeight;
    const up = want > below && above > below;
    const room = up ? above : below;
    if (want > room) list.style.maxHeight = Math.max(120, room - (menu.offsetHeight - list.offsetHeight)) + 'px';
    const h = menu.offsetHeight, w = menu.offsetWidth;
    menu.style.left = Math.min(Math.max(edge, r.left), vw - w - edge) + 'px';
    menu.style.top = (up ? r.top - gap - h : r.bottom + gap) + 'px';
    menu.classList.toggle('ui-dd-menu--up', up);
  }

  function close(refocus) {
    if (!open) return;
    const { anchor, menu } = open;
    open = null;
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    anchor.removeAttribute('aria-controls');
    anchor.removeAttribute('aria-activedescendant');
    anchor.classList.remove('ui-dd-open');
    if (refocus) anchor.focus({ preventScroll: true });
  }

  function setActive(entry, scroll) {
    if (open.active) open.active.item.classList.remove('ui-dd-item--active');
    open.active = entry;
    const targets = [open.anchor, open.filter].filter(Boolean);
    if (!entry) { targets.forEach(t => t.removeAttribute('aria-activedescendant')); return; }
    entry.item.classList.add('ui-dd-item--active');
    targets.forEach(t => t.setAttribute('aria-activedescendant', entry.item.id));
    if (scroll) entry.item.scrollIntoView({ block: 'nearest' });
  }

  function fire(sel) {
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function choose(entry) {
    const sel = open.sel;
    const changed = sel.selectedIndex !== entry.opt.index;
    close(true);
    if (!changed) return;
    sel.selectedIndex = entry.opt.index;
    fire(sel);
  }

  function toggle(entry) {
    const i = entry.opt.index;
    if (open.pending.has(i)) open.pending.delete(i); else open.pending.add(i);
    paint();
  }

  function commit() {
    const { sel, pending } = open;
    const before = [...sel.options].map(o => o.selected).join();
    [...sel.options].forEach(o => { o.selected = pending.has(o.index); });
    const changed = before !== [...sel.options].map(o => o.selected).join();
    close(true);
    if (changed) fire(sel);
    else refresh(sel);
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  let typed = '', typedAt = 0;

  function move(step) {
    const pool = open.items.filter(e => !e.disabled && !e.item.hidden);
    if (!pool.length) return;
    let i = pool.indexOf(open.active);
    if (step === Infinity) i = pool.length - 1;
    else if (step === -Infinity) i = 0;
    else i = i < 0 ? 0 : Math.min(pool.length - 1, Math.max(0, i + step));
    setActive(pool[i], true);
  }

  function typeAhead(ch) {
    const now = Date.now();
    typed = now - typedAt > 700 ? ch : typed + ch;
    typedAt = now;
    const pool = open.items.filter(e => !e.disabled && !e.item.hidden);
    const hit = pool.find(e => e.text.startsWith(typed)) || pool.find(e => e.text.includes(typed));
    if (hit) setActive(hit, true);
  }

  // Single: Enter/Space picks. Multi: Space toggles the active row and Enter
  // applies — except with a filter box, where Space is typing, so Enter
  // toggles and Ctrl/Cmd+Enter applies.
  function onKey(e) {
    if (!open) return;
    const k = e.key;
    const typing = !!open.filter;
    if (k === 'ArrowDown')       move(1);
    else if (k === 'ArrowUp')    move(-1);
    else if (k === 'PageDown')   move(8);
    else if (k === 'PageUp')     move(-8);
    else if (k === 'Home' && !typing) move(-Infinity);
    else if (k === 'End'  && !typing) move(Infinity);
    else if (open.multi && k === ' ' && !typing) { if (open.active) toggle(open.active); }
    else if (open.multi && k === 'Enter') {
      if (e.ctrlKey || e.metaKey || !open.active) commit();
      else if (typing) toggle(open.active);
      else commit();
    }
    else if (k === 'Enter' || (k === ' ' && !typing)) { if (open.active) choose(open.active); else close(true); }
    else if (k === 'Escape')     close(true);
    else if (k === 'Tab')        { if (!open.multi) close(false); return; }
    else if (!typing && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(k.toLowerCase());
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  // Single selects: mouse and pen only, a touch press falls through to the
  // native picker. (Multi triggers are buttons and open on click, any pointer.)
  let lastPointer = 'mouse';
  document.addEventListener('pointerdown', e => {
    lastPointer = e.pointerType;
    if (open && !open.menu.contains(e.target) && !open.anchor.contains(e.target)) close(false);
    const sel = e.target.closest && e.target.closest('select');
    if (!sel || !sel._uiDd || sel._uiDd.multi || sel.disabled || e.pointerType === 'touch' || e.button !== 0) return;
    e.preventDefault();
    sel.focus({ preventScroll: true });
    if (open && open.sel === sel) close(false);
    else show(sel);
  }, true);

  // Cancelling pointerdown suppresses the mousedown that would open the native
  // list, but not in every browser, so cancel that too — never after a touch.
  document.addEventListener('mousedown', e => {
    const sel = e.target.closest && e.target.closest('select');
    if (sel && sel._uiDd && !sel.disabled && lastPointer !== 'touch') e.preventDefault();
  }, true);

  document.addEventListener('keydown', e => {
    if (open) {
      if (e.target === open.anchor || (open.filter && e.target === open.filter)) onKey(e);
      return;
    }
    const t = e.target;
    const sel = t instanceof HTMLSelectElement ? t : t && t._uiDdSel;
    if (!sel || !sel._uiDd || sel.disabled) return;
    const multi = sel._uiDd.multi;
    if ((!multi && (e.key === ' ' || e.key === 'Enter')) || e.key === 'ArrowDown' && (multi || e.altKey)
        || (e.altKey && e.key === 'ArrowUp') || e.key === 'F4') {
      e.preventDefault();
      show(sel);
    }
    // Plain arrows on a closed single select keep the browser's own
    // step-through, which already fires change. A multi trigger is a button:
    // Enter and Space click it.
  }, true);

  window.addEventListener('resize', () => close(false));
  document.addEventListener('scroll', e => {
    if (open && !open.menu.contains(e.target)) close(false);
  }, true);
  document.addEventListener('focusin', e => {
    if (open && !open.anchor.contains(e.target) && !open.menu.contains(e.target)) close(false);
  });

  function start() {
    scan(document.body);
    new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(scan));
      if (open && !open.anchor.isConnected) close(false);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  window.UiSelect = { enhance, refresh, close: () => close(false) };
})();
