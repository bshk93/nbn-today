// feed-types.js — what a league event is called, and what colour it wears.
//
// The league office (`/transactions`) has labelled transaction types since it
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
// The colours are the office's own, copied value-for-value from its
// `.badge-{type}` rules. `/transactions` still renders from that CSS rather
// than from here — rewriting twenty working rules into inline styles is churn
// with real regression risk on a 4,000-line page and nothing visible to show
// for it. If you change a colour, change it in both; the labels, which are the
// part that actually drifts and the part a reader notices, are single-sourced.

(function (global) {
  'use strict';

  const TYPES = {
    // ── Ledger transaction types ──────────────────────────────────────────
    sign:                  { label: 'Signing',        bg: 'var(--market-positive-bg)', fg: 'var(--market-positive)' },
    sign_pick:             { label: 'Pick Signing',   bg: 'var(--market-positive-bg)', fg: 'var(--market-positive)' },
    trade:                 { label: 'Trade',          bg: 'var(--purple-light-bg)',    fg: '#c084fc' },
    pick:                  { label: 'Draft Pick',     bg: 'var(--accent-panel-bg)',    fg: 'var(--accent-light)' },
    option:                { label: 'Option',         bg: 'var(--danger-alt-bg)',      fg: 'var(--danger-alt)' },
    guarantee:             { label: 'Guarantee',      bg: '#052e2b',                   fg: '#2dd4bf' },
    release:               { label: 'Release',        bg: 'var(--danger-bg)',          fg: 'var(--danger)' },
    renounce:              { label: 'Renounce',       bg: '#3b2f0a',                   fg: '#fcd34d' },
    rescind_renounce:      { label: 'Renounce Undone', bg: '#3b2f0a',                  fg: '#fcd34d' },
    extension:             { label: 'Extension',      bg: '#0c1f3d',                   fg: '#60a5fa' },
    convert_twoway:        { label: 'Two-Way Conversion', bg: '#1c1917',               fg: '#a8a29e' },
    void_player:           { label: 'Void Player',    bg: 'var(--bg-subtle)',          fg: 'var(--text-muted)' },
    set_hard_cap_level:    { label: 'Set Hard Cap',   bg: 'var(--gold-bg)',            fg: 'var(--gold)' },
    offer_sheet:           { label: 'Offer Sheet',    bg: '#1e1b4b',                   fg: '#a5b4fc' },
    offer_sheet_decision:  { label: 'Offer Sheet Decision', bg: '#1e1b4b',             fg: '#818cf8' },
    waiver_clear:          { label: 'Waivers',        bg: '#0c2a3d',                   fg: '#38bdf8' },
    waiver_flagged:        { label: 'Waiver Tie',     bg: 'var(--gold-bg)',            fg: 'var(--gold)' },

    // ── Feed-only kinds ───────────────────────────────────────────────────
    // Rose, which no transaction type uses, so an article never reads as a
    // move someone made.
    news:  { label: 'News',  bg: '#3b0d24',        fg: '#f9a8d4' },
    // Deliberately neutral rather than a colour of its own. In season this is
    // the most common row by a wide margin, and a bright badge on every third
    // line turns the tag column into noise — a final score is a fact, not a
    // category you are scanning for.
    score: { label: 'Final', bg: 'var(--bg-hover)', fg: 'var(--text-secondary)' },
  };

  // Unknown ids fall through to themselves rather than to "Other": a type this
  // file has not learned yet is far easier to spot in the feed as its raw id.
  function label(type) {
    return (TYPES[type] || {}).label || type;
  }

  function colors(type) {
    return TYPES[type] || { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' };
  }

  global.FeedTypes = { TYPES, label, colors };
})(window);
