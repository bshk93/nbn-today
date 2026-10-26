// feed-types.js — what a league event is called, and what colour it wears.
//
// The league office (`/fo/transactions`) has labelled transaction types since it
// was built, in a `typeLabel()` map plus a matching set of `.badge-{type}` CSS
// rules. The homepage feed needs the same vocabulary: it merges transactions,
// news and (in season) final scores into one list where every row is tagged,
// and a row reading `set_hard_cap_level` on one page and "Set Hard Cap" on
// another is exactly the drift BACKLOG.md's "fifth copy of the same frontend
// primitives" item is about. So the vocabulary moved here and both read it.
//
// Two kinds of entry live in one table on purpose:
//
//   * **Transaction types** — ids straight off the ledger's `type` field, so a
//     badge here and a badge in the office are literally the same entry.
//   * **Feed-only kinds** (`news`, `score`) — things that are not transactions
//     but appear in the same list and need the same treatment. Keeping them
//     apart would mean the feed carrying its own second map, which is the
//     thing this file exists to prevent.
//
// The feed's tag is a neutral `ui-chip`; a `tone` (one of the chip's tones:
// accent, danger, warning) marks the few kinds worth spotting while scanning.
// Colour means something (docs/design-system.md): a trade is the league's
// headline event, a release or waiver takes a player off a roster, and a
// waiver tie or hard-cap level wants someone's attention. A signing is the
// commonest move there is, and twenty colours made the tag column noise.
// `/fo/transactions` keeps its own `.badge-{type}` colours; only the labels are
// shared, since they are what drifts and what a reader notices.

(function (global) {
  'use strict';

  const TYPES = {
    // ── Ledger transaction types ──────────────────────────────────────────
    sign:                  { label: 'Signing' },
    sign_pick:             { label: 'Pick Signing' },
    trade:                 { label: 'Trade',          tone: 'accent' },
    pick:                  { label: 'Draft Pick' },
    option:                { label: 'Option' },
    guarantee:             { label: 'Guarantee' },
    release:               { label: 'Release',        tone: 'danger' },
    renounce:              { label: 'Renounce' },
    rescind_renounce:      { label: 'Renounce Undone' },
    extension:             { label: 'Extension' },
    convert_twoway:        { label: 'Two-Way Conversion' },
    void_player:           { label: 'Void Player',    tone: 'danger' },
    stash:                 { label: 'Stash' },
    set_hard_cap_level:    { label: 'Set Hard Cap',   tone: 'warning' },
    offer_sheet:           { label: 'Offer Sheet' },
    offer_sheet_decision:  { label: 'Offer Sheet Decision' },
    qualifying_offer:      { label: 'Qualifying Offer' },
    accept_qo:             { label: 'QO Accepted' },
    waiver_clear:          { label: 'Waivers',        tone: 'danger' },
    waiver_flagged:        { label: 'Waiver Tie',     tone: 'warning' },

    // ── Feed-only kinds ───────────────────────────────────────────────────
    news:  { label: 'News' },
    // Neutral: in season this is the commonest row by far, and a final score
    // is a fact, not a category you are scanning for.
    score: { label: 'Final' },
  };

  // Unknown ids fall through to themselves rather than to "Other": a type this
  // file has not learned yet is far easier to spot in the feed as its raw id.
  function label(type) {
    return (TYPES[type] || {}).label || type;
  }

  // '' (the neutral chip) for anything without one, unknown ids included.
  function tone(type) {
    return (TYPES[type] || {}).tone || '';
  }

  // ── Headlines ─────────────────────────────────────────────────────────────
  //
  // A ledger row's `description` is written for the office ("FA round
  // ffa-07aa84 — offer 195 won the ballot", "Trade 52"), and some rows have
  // none. A visitor wants the move itself: "MIL sign Mike Conley". This builds
  // that from `details`, which every type already carries.
  //
  //   headline(t, ctx) → { html, sub } or null
  //
  //   ctx.name(slug)   display name for a player ("Mike Conley")
  //   ctx.team(abbr)   HTML for a team (the caller decides logo/link)
  //   ctx.esc(s)       HTML escaper
  //
  // `html` is the headline, `sub` a plain-text detail line (contract, dead
  // cap) or ''. null means "don't put this in a public feed" — office
  // bookkeeping like a hard-cap correction is real history but not news.
  // An unknown type falls back to its description, so a new type still shows.

  const HIDDEN = new Set(['set_hard_cap_level', 'waiver_flagged', 'rescind_renounce']);

  function money(v) {
    const n = typeof v === 'number' ? v : parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }

  function contractLine(c) {
    if (!c) return '';
    const s = typeof global.summarizeContract === 'function' ? global.summarizeContract(c) : '—';
    if (s && s !== '—') return c.type === 'two-way' ? s + ' · two-way' : s;
    return c.type === 'two-way' ? 'Two-way contract' : '';
  }

  const ROUND = r => (r === 1 ? '1st' : r === 2 ? '2nd' : r + 'th');

  function asset(a, ctx) {
    if (a.type === 'player') return ctx.esc(ctx.name(a.slug));
    if (a.type === 'pick') {
      const prot = a.protection ? ` (top-${a.protection} prot.)` : '';
      return ctx.esc(`${a.year} ${a.orig} ${ROUND(a.round)}${a.swap_with ? ' swap' : ''}${prot}`);
    }
    return ctx.esc(a.type);
  }

  function list(items) {
    if (items.length <= 2) return items.join(' and ');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function headline(t, ctx) {
    if (HIDDEN.has(t.type)) return null;
    const d = t.details || {};
    const T = abbr => ctx.team(String(abbr || '').toUpperCase());
    const P = slug => `<strong>${ctx.esc(ctx.name(slug))}</strong>`;
    const fallback = () => (t.description ? { html: ctx.esc(t.description), sub: '' } : null);
    if (!d.player && t.type !== 'trade') return fallback();

    switch (t.type) {
      case 'sign':
        return { html: `${T(d.team)} sign ${P(d.player)}`, sub: contractLine(d.contract) };
      case 'sign_pick': {
        const pk = d.pick ? `${d.pick.year} ${ROUND(d.pick.round)}-rounder ` : 'draft pick ';
        return { html: `${T(d.team)} sign ${pk}${P(d.player)}`, sub: contractLine(d.contract) };
      }
      case 'pick': {
        const p = d.pick || {};
        const no = p.pick_number ? ` at No. ${p.pick_number}` : '';
        return { html: `${T(d.team)} draft ${P(d.player)}${ctx.esc(no)}`, sub: contractLine(d.contract) };
      }
      case 'extension':
        return { html: `${T(d.team)} extend ${P(d.player)}`, sub: contractLine(d.contract) };
      case 'convert_twoway':
        return { html: `${T(d.team)} convert ${P(d.player)} to a standard contract`, sub: contractLine(d.contract) };
      case 'release': {
        const dead = Object.values(d.dead_cap || {}).reduce((s, v) =>
          s + (parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0), 0);
        return { html: `${T(d.team)} release ${P(d.player)}`, sub: dead ? `${money(dead)} dead cap` : '' };
      }
      case 'waiver_clear':
        return d.outcome === 'claimed'
          ? { html: `${T(d.claimed_by)} claim ${P(d.player)} off waivers`, sub: d.released_by ? `Released by ${d.released_by}` : '' }
          : { html: `${P(d.player)} clears waivers`, sub: d.released_by ? `Released by ${d.released_by}` : '' };
      case 'renounce':
        return { html: `${T(d.team)} renounce their rights to ${P(d.player)}`, sub: '' };
      case 'option': {
        const whose = d.option_type === 'PLAYER_OPT' ? 'player option' : 'team option';
        const verb = d.decision === 'accept'
          ? (d.option_type === 'PLAYER_OPT' ? 'opts in' : 'picked up')
          : (d.option_type === 'PLAYER_OPT' ? 'opts out' : 'declined');
        return d.option_type === 'PLAYER_OPT'
          ? { html: `${P(d.player)} ${verb} with ${T(d.team)}`, sub: `${d.year || ''} ${whose}`.trim() }
          : { html: `${T(d.team)} ${verb === 'picked up' ? 'pick up' : 'decline'} ${P(d.player)}'s ${ctx.esc(whose)}`, sub: d.year ? `For ${d.year}` : '' };
      }
      case 'guarantee':
        return { html: `${T(d.team)} guarantee ${P(d.player)}'s ${ctx.esc(d.year || '')} salary`, sub: '' };
      case 'qualifying_offer':
        return d.action === 'withdraw'
          ? { html: `${T(d.team)} pull ${P(d.player)}'s qualifying offer`, sub: 'Now an unrestricted free agent' }
          : { html: `${T(d.team)} extend a qualifying offer to ${P(d.player)}`, sub: d.amount ? `${money(d.amount)} · restricted free agent` : 'Restricted free agent' };
      case 'accept_qo':
        return { html: `${P(d.player)} signs his qualifying offer with ${T(d.team)}`, sub: d.amount ? `1 yr, ${money(d.amount)}` : '1 yr' };
      case 'offer_sheet':
        return { html: `${T(d.offering_team)} sign ${P(d.player)} to an offer sheet`,
                 sub: [contractLine(d.contract), d.retaining_team ? `${d.retaining_team} can match` : ''].filter(Boolean).join(' · ') };
      case 'offer_sheet_decision':
        return d.outcome === 'matched'
          ? { html: `${T(d.retaining_team)} match the offer sheet for ${P(d.player)}`, sub: contractLine(d.contract) }
          : { html: `${P(d.player)} heads to ${T(d.offering_team || d.signing_team)}`,
              sub: [d.retaining_team ? `${d.retaining_team} decline to match` : '', contractLine(d.contract)].filter(Boolean).join(' · ') };
      case 'stash':
        return { html: `${T(d.team)} keep ${P(d.player)}'s draft rights`, sub: d.note ? d.note[0].toUpperCase() + d.note.slice(1) : '' };
      case 'void_player':
        return /retire/i.test(d.reason || '')
          ? { html: `${P(d.player)} retires`, sub: d.team ? `Last held by ${d.team}` : '' }
          : { html: `${P(d.player)}'s contract with ${T(d.team)} is voided`, sub: '' };
      case 'trade': {
        const got = {};
        (d.transfers || []).forEach(tr => {
          const to = String(tr.to_team || '').toUpperCase();
          (got[to] = got[to] || []).push(...(tr.assets || []).map(a => asset(a, ctx)));
        });
        const teams = (d.teams && d.teams.length ? d.teams : Object.keys(got)).map(x => String(x).toUpperCase());
        if (!teams.length) return fallback();
        // Every side's haul spelled out in the headline would be a paragraph
        // for a five-team deal. The headline names the teams; the detail line
        // says who got what, and the office page has the full sheet.
        return {
          html: `${list(teams.map(T))} make a trade`,
          sub: teams.filter(x => got[x] && got[x].length)
            .map(x => `${x} get ${list(got[x])}`).join(' · '),
          subHtml: true,
        };
      }
      default:
        return fallback();
    }
  }

  global.FeedTypes = { TYPES, label, tone, headline };
})(window);
