// A game's YouTube video, as the homepage card and /calendar show it.
//
// A streamed game goes through three looks: 📡 before it's played (each page
// draws its own), ⏳ once it's final with no video yet, then the YouTube button.
// A game nobody streamed shows nothing, unless someone linked it by hand. The
// night's unstreamed games share one "NBN M/D: Box Scores" video, shown as a
// single row under the night rather than on each game.
//
// Links come from nbn-api/routers/youtube_vods.py, which reads them off the
// channel's feed, or from PUT /api/schedule/{id}/youtube.
(function (global) {
  const ICON = '<svg class="vod-icon" viewBox="0 0 20 14" aria-hidden="true">'
    + '<rect width="20" height="14" rx="4" fill="#ff0000"/><path d="M8 4l5.5 3L8 10z" fill="#fff"/></svg>';

  const esc = s => String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Markup for a played game: the button, ⏳, or '' — never the 📡 tag.
  function gameHtml(g, label = 'Watch') {
    if (g.youtube_url) {
      return `<a class="vod-watch" href="${esc(g.youtube_url)}" target="_blank" rel="noopener" `
        + `title="Watch ${esc(g.away_team)} @ ${esc(g.home_team)} on YouTube">${ICON}${esc(label)}</a>`;
    }
    if (g.stream) return '<span class="vod-pending" title="The stream’s video isn’t up yet">⏳ VOD soon</span>';
    return '';
  }

  // The night's one Box Scores row, or '' until its video is up.
  function boxScoresHtml(url) {
    if (!url) return '';
    return `<a class="vod-box" href="${esc(url)}" target="_blank" rel="noopener" `
      + `title="Box scores for the games that weren’t streamed">${ICON}`
      + '<span>Box scores</span><span class="vod-box-sub">the night’s other games</span></a>';
  }

  global.NbnVod = { ICON, gameHtml, boxScoresHtml };
})(typeof window !== 'undefined' ? window : globalThis);
