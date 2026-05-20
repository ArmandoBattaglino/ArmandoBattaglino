// Generates assets/building-public.svg and assets/building-private.svg
// from live GitHub data, matching the mission-control look of the header.
// Requires env PROFILE_TOKEN (PAT with `repo` scope).
// Usage: node scripts/sync-stats.js

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.PROFILE_TOKEN;
const USER = 'ArmandoBattaglino';

if (!TOKEN) {
  console.error('Missing PROFILE_TOKEN env');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'profile-sync-stats',
};

async function restAll(pathStr) {
  const out = [];
  let url = `https://api.github.com${pathStr}${pathStr.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`REST ${url} → ${res.status}`);
    out.push(...(await res.json()));
    const link = res.headers.get('link');
    const nextMatch = link && link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }
  return out;
}

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

function humanize(iso) {
  const then = new Date(iso);
  const now = new Date();
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function buildPublicSvg(repos, publicCommits) {
  const visible = repos.filter((r) => !r.private && !r.fork).slice(0, 8);
  const ROW_H = 30;
  const TOP_H = 70;
  const BOT_H = 60;
  const W = 880;
  const H = TOP_H + visible.length * ROW_H + BOT_H;

  const rows = visible
    .map((r, i) => {
      const y = TOP_H + 20 + i * ROW_H;
      const name = escape(truncate(r.name, 30));
      const lang = escape((r.language || '—').toLowerCase());
      const stars = r.stargazers_count || 0;
      const updated = escape(humanize(r.pushed_at));
      return `
    <g>
      <text x="32" y="${y}" fill="#00ff66" font-size="14" opacity="0.7">&gt;&gt;</text>
      <text x="60" y="${y}" fill="#e6edf3" font-size="14">${name}</text>
      <text x="430" y="${y}" fill="#7d8590" font-size="13">${lang}</text>
      <text x="640" y="${y}" fill="#7d8590" font-size="13">★ ${stars}</text>
      <text x="720" y="${y}" fill="#7d8590" font-size="13">↻ ${updated}</text>
    </g>`;
    })
    .join('');

  const publicCount = repos.filter((r) => !r.private && !r.fork).length;
  const today = new Date().toISOString().split('T')[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Courier New', 'SF Mono', Consolas, monospace">
  <defs>
    <pattern id="sl-pub" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" fill="#ffffff" opacity="0.025"/>
    </pattern>
    <linearGradient id="hdr-pub" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d2818"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="8" fill="#0d1117"/>
  <rect width="${W}" height="${H}" rx="8" fill="url(#sl-pub)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="#1f3a2a" stroke-width="1"/>

  <rect x="0" y="0" width="${W}" height="44" rx="8" fill="url(#hdr-pub)"/>
  <rect x="0" y="38" width="${W}" height="6" fill="#0d1117"/>
  <line x1="0" y1="44" x2="${W}" y2="44" stroke="#00ff66" stroke-width="0.6" opacity="0.55"/>

  <text x="20" y="28" fill="#00ff66" font-size="13" letter-spacing="2">// BUILDING IN PUBLIC</text>
  <circle cx="${W - 70}" cy="24" r="3" fill="#00ff66">
    <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite"/>
  </circle>
  <text x="${W - 20}" y="28" fill="#00ff66" font-size="11" text-anchor="end" letter-spacing="1" opacity="0.75">LIVE</text>

  <text x="32" y="62" fill="#6e7681" font-size="10" letter-spacing="1">REPO</text>
  <text x="430" y="62" fill="#6e7681" font-size="10" letter-spacing="1">LANG</text>
  <text x="640" y="62" fill="#6e7681" font-size="10" letter-spacing="1">★</text>
  <text x="720" y="62" fill="#6e7681" font-size="10" letter-spacing="1">UPDATED</text>
  <line x1="20" y1="70" x2="${W - 20}" y2="70" stroke="#21262d" stroke-width="0.5"/>
  ${rows}

  <line x1="20" y1="${H - 50}" x2="${W - 20}" y2="${H - 50}" stroke="#21262d" stroke-width="0.5"/>
  <text x="20" y="${H - 24}" fill="#7d8590" font-size="11">${publicCount} public repos · ${publicCommits} commits this year</text>
  <text x="${W - 20}" y="${H - 24}" fill="#6e7681" font-size="11" text-anchor="end">↻ ${today}</text>
</svg>
`;
}

function buildPrivateSvg(privateCount, publicCount) {
  const W = 440;
  const H = 380;
  const total = privateCount + publicCount;
  const pct = total > 0 ? Math.round((privateCount / total) * 100) : 0;
  const barWidth = 360;
  const filled = total > 0 ? Math.round((privateCount / total) * barWidth) : 0;
  const num = privateCount.toLocaleString('en-US');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Courier New', 'SF Mono', Consolas, monospace">
  <defs>
    <pattern id="sl-priv" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" fill="#ffffff" opacity="0.025"/>
    </pattern>
    <linearGradient id="hdr-priv" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2a1a0a"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
    <filter id="redact-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" rx="8" fill="#0d1117"/>
  <rect width="${W}" height="${H}" rx="8" fill="url(#sl-priv)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="#3d2a1a" stroke-width="1"/>

  <rect x="0" y="0" width="${W}" height="44" rx="8" fill="url(#hdr-priv)"/>
  <rect x="0" y="38" width="${W}" height="6" fill="#0d1117"/>
  <line x1="0" y1="44" x2="${W}" y2="44" stroke="#ffb000" stroke-width="0.6" opacity="0.55"/>

  <text x="20" y="28" fill="#ffb000" font-size="13" letter-spacing="2">// BUILDING IN PRIVATE</text>
  <text x="${W - 20}" y="28" fill="#ffb000" font-size="11" text-anchor="end" letter-spacing="1" opacity="0.75">[CLASSIFIED]</text>

  <text x="${W / 2}" y="160" font-size="78" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="2">${num}</text>
  <text x="${W / 2}" y="188" font-size="11" fill="#7d8590" text-anchor="middle" letter-spacing="2">COMMITS · LAST 365 DAYS</text>

  <text x="40" y="240" fill="#6e7681" font-size="10" letter-spacing="1">PRIVATE / TOTAL</text>
  <text x="${W - 40}" y="240" fill="#ffb000" font-size="11" text-anchor="end" letter-spacing="1">${pct}%</text>
  <rect x="40" y="250" width="${barWidth}" height="6" rx="3" fill="#161b22"/>
  <rect x="40" y="250" width="${filled}" height="6" rx="3" fill="#ffb000" opacity="0.85"/>

  <text x="${W / 2}" y="310" font-size="11" fill="#7d8590" text-anchor="middle" font-style="italic">what's brewing stays hidden</text>
  <text x="${W / 2}" y="330" font-size="11" fill="#7d8590" text-anchor="middle" font-style="italic">until it's ready to ship.</text>

  <text x="${W / 2}" y="358" font-size="9" fill="#484f58" text-anchor="middle" letter-spacing="3">▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮</text>
</svg>
`;
}

async function main() {
  // Authenticated user's repos (public + private owned)
  const allRepos = await restAll(`/user/repos?affiliation=owner&sort=pushed&direction=desc`);
  const privateRepos = allRepos.filter((r) => r.private && !r.fork);

  // Count commits by user in each private repo over the last year
  const since = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
  let privateCommits = 0;
  for (const r of privateRepos) {
    try {
      const commits = await restAll(`/repos/${USER}/${r.name}/commits?author=${USER}&since=${since}`);
      privateCommits += commits.length;
      console.log(`  private/${r.name}: ${commits.length} commits`);
    } catch (e) {
      console.warn(`  private/${r.name}: skipped (${e.message})`);
    }
  }

  // Public commits via GraphQL
  const publicData = await gql(
    `query($login: String!) {
      user(login: $login) {
        contributionsCollection { totalCommitContributions }
      }
    }`,
    { login: USER }
  );
  const publicCommits = publicData.user.contributionsCollection.totalCommitContributions;

  console.log(`Public commits: ${publicCommits}, Private commits: ${privateCommits}`);

  // Build SVGs
  const publicSvg = buildPublicSvg(allRepos, publicCommits);
  const privateSvg = buildPrivateSvg(privateCommits, publicCommits);

  fs.mkdirSync('assets', { recursive: true });
  fs.writeFileSync(path.join('assets', 'building-public.svg'), publicSvg);
  fs.writeFileSync(path.join('assets', 'building-private.svg'), privateSvg);

  console.log('Wrote assets/building-public.svg and assets/building-private.svg');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
