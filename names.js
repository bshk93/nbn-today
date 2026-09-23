// Player names for display: "MCCOLLUM, CJ" → "CJ McCollum".
//
// Bios store names as "LAST, FIRST" in upper case (the join key for stats), and
// the build writes the same name title-cased ("Mccollum, Cj"). Neither is how a
// name is read. Before this file, five pages each flipped and re-cased names
// their own way and disagreed: one left them in capitals, others produced
// "Mccollum", "Cj" and "Lebron". Use nbnPlayerName() instead of writing another.
//
// Upper case loses information, so casing is rebuilt from rules plus a short
// word list. The list came from the 2K scrape's properly cased names
// (player-attributes.json → 2k_name): every word those rules get wrong. It is a
// spelling list, not per-player data, so it only needs adding to when a new
// player arrives with an unusual name. A word cased two ways by different
// players (Deandre Ayton, DeAndre Jordan) can't be listed, and keeps the rule.

// Keyed without apostrophes, because the bios drop them ("ONEALE", "DANGELO").
const _NBN_NAME_WORDS = Object.fromEntries([
  'DaRon', 'DeMar', 'DeRozan', 'DiVincenzo', 'LaMelo', 'LaRavia', 'LaVine',
  'LeBron', 'LeVert', 'MarJon', 'TyTy', 'VanVleet',
  "D'Angelo", "Day'Ron", "De'Aaron", "De'Anthony", "Ja'Kobe", "Ja'Kobi",
  "Kel'el", "N'Diaye", "N'Faly", "Nae'Qwan", "Nah'Shon", "O'Neale", 'da',
].map(w => [w.toUpperCase().replace(/['’]/g, ''), w]));

// Initials written without dots (the league writes CJ, not C.J.).
const _NBN_INITIALS = new Set([
  'AJ', 'BJ', 'CJ', 'DJ', 'EJ', 'GG', 'JB', 'JD', 'JJ', 'JT', 'KC', 'KJ',
  'LJ', 'OG', 'PJ', 'RJ', 'TJ', 'VJ',
]);

function _nbnCaseWord(word) {
  const up = word.toUpperCase();
  const known = _NBN_NAME_WORDS[up.replace(/['’]/g, '')];
  if (known) return known;
  if (_NBN_INITIALS.has(up) || /^(II|III|IV|V)$/.test(up)) return up;
  if (up === 'JR' || up === 'JR.') return 'Jr.';
  if (up === 'SR' || up === 'SR.') return 'Sr.';
  // Hyphens and apostrophes start a new capital: Gilgeous-Alexander, O'Neale.
  return up.toLowerCase().split(/([-'’])/).map(part => {
    if (part.length > 2 && part.startsWith('mc')) return 'Mc' + part[2].toUpperCase() + part.slice(3);
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('');
}

/** "LAST, FIRST" (any case) → "First Last". Anything without a comma is
 *  re-cased as-is, so a name that is already first-last passes through. */
function nbnPlayerName(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const i = s.indexOf(',');
  const ordered = i === -1 ? s : `${s.slice(i + 1).trim()} ${s.slice(0, i).trim()}`;
  return ordered.split(/\s+/).filter(Boolean).map(_nbnCaseWord).join(' ');
}
