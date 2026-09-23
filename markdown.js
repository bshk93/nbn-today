// Markdown → safe HTML, the one way every page renders member-written text.
//
// marked does not sanitize: raw HTML in the source passes straight through. So
// a comment containing `<img src=x onerror=…>` ran in every reader's browser,
// where it could read localStorage.nbn_token — an admin opening the thread
// handed over their bearer token. Every `marked.parse` result now goes through
// DOMPurify before it reaches innerHTML. Don't call marked.parse directly.
//
// Load order: /vendor/marked-*.min.js, /vendor/purify-*.min.js, then this file.
// Both libraries are vendored and pinned rather than pulled from a CDN, since
// the pages that render markdown are the ones holding tokens.
//
// Page-level `marked.use(...)` config (gfm, breaks) still applies; this only
// wraps the output.

function renderMarkdown(src) {
  return DOMPurify.sanitize(marked.parse(src || ''));
}
