// Shared utilities: nav injection, parseCSV

document.addEventListener('DOMContentLoaded', function () {
  const nav = document.querySelector('.nav');
  if (nav && nav.id !== 'nav' && !nav.children.length && !nav.textContent.trim()) {
    nav.innerHTML = '<a href="/">← Home</a>';
  }
});

function parseLine(line) {
  const out = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; }
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}
