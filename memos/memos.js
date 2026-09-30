// League office memos — the one list. Newest first.
//
// A memo is its own static page at /memos/<slug>/, written in plain HTML so a
// shared link reads without JavaScript and unfurls with its own title. This
// list is what /memos/ shows, and what each memo page reads its header from,
// so a memo's title and date are written once.
//
// To add one: copy an existing memo's folder, write the body, add a row here
// and an entry in PAGES in build/og_tags.py (then run it).
window.MEMOS = [
  {
    slug: '2026-01-sac-2028-first',
    number: '2026-01',
    date: '2026-09-30',
    title: "SAC's 2028 1st-round pick: what the trade record shows",
    to: 'All teams — SAC, MIA, MEM, MIL, DAL and CHA in particular',
    summary: 'Five 2028 firsts are tied together by swap rights, and one draft-day deal was recorded in a single ambiguous line. Three questions need a ruling.',
  },
];

// Fills a memo page's header from the list, by the folder it is served from.
window.memoHeader = function () {
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
  const m = window.MEMOS.find(x => x.slug === slug);
  const el = document.getElementById('memo-meta');
  if (!m || !el) return;
  const d = new Date(m.date + 'T12:00:00').toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' });
  const row = (k, v) => `<div class="memo-meta-row"><span class="memo-meta-key">${k}</span><span>${v}</span></div>`;
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  el.innerHTML = row('Memo', esc(m.number)) + row('Date', d) + row('From', 'League Office') + row('To', esc(m.to));
};
