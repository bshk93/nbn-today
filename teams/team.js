const TEAMS = {
  ATL: "Atlanta Hawks",
  BKN: "Brooklyn Nets",
  BOS: "Boston Celtics",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};

const abbr = location.pathname.replace(/\/$/, "").split("/").pop().toUpperCase();
const name = TEAMS[abbr] || "Unknown Team";

document.title = abbr + " — NBN";

document.head.insertAdjacentHTML("beforeend", `<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #111827;
    color: #f3f4f6;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem 4rem;
  }
  .nav {
    width: 100%;
    max-width: 480px;
    margin-bottom: 3rem;
    font-size: 0.875rem;
  }
  .nav a { color: #9ca3af; text-decoration: none; }
  .nav a:hover { color: #f3f4f6; }
  .team {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }
  .team img {
    width: 200px;
    height: 200px;
    object-fit: contain;
  }
  .team h1 {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-align: center;
  }
  .team .abbr {
    font-size: 0.95rem;
    color: #6b7280;
    letter-spacing: 0.08em;
  }
</style>`);

document.body.innerHTML = `
  <nav class="nav"><a href="/teams">← Teams</a></nav>
  <div class="team">
    <img src="/logos/logo-${abbr.toLowerCase()}.png" alt="${name} logo">
    <h1>${name}</h1>
    <span class="abbr">${abbr}</span>
  </div>
`;
