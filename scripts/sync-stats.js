// Generates assets/building-public.svg and assets/building-private.svg
// from live GitHub data. Private card includes charts: 52-week sparkline,
// weekday distribution, 24h circadian, and a stats table.
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

function humanize(d) {
  const then = d instanceof Date ? d : new Date(d);
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

// ─── PUBLIC CARD ──────────────────────────────────────────────────────────

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

// ─── PRIVATE CARD (with charts) ───────────────────────────────────────────

function buildPrivateSvg(privateCount, publicCount, dates, numRepos) {
  const W = 480;
  const PAD = 28;
  const total = privateCount + publicCount;
  const pct = total > 0 ? Math.round((privateCount / total) * 100) : 0;
  const num = privateCount.toLocaleString('en-US');

  // ── Aggregations ──
  const weeks = new Array(52).fill(0);
  const days = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
  const hours = new Array(24).fill(0);
  const now = Date.now();
  const weekMs = 7 * 86400 * 1000;
  let lastTs = 0;
  for (const d of dates) {
    const ts = d.getTime();
    if (ts > lastTs) lastTs = ts;
    const widx = 51 - Math.floor((now - ts) / weekMs);
    if (widx >= 0 && widx < 52) weeks[widx]++;
    days[(d.getDay() + 6) % 7]++;
    hours[d.getHours()]++;
  }
  const peakDayIdx = days.indexOf(Math.max(...days, 1));
  const peakHourIdx = hours.indexOf(Math.max(...hours, 1));
  const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  let longestGap = 0;
  if (dates.length >= 2) {
    const sorted = [...dates].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i] - sorted[i - 1]) / (86400 * 1000);
      if (gap > longestGap) longestGap = gap;
    }
  }
  const avgPerDay = dates.length > 0 ? (dates.length / 365).toFixed(1) : '0';
  const lastAgo = lastTs > 0 ? humanize(new Date(lastTs)) : '—';

  // ── Section: header ──
  let y = 0;
  const header = `
  <rect x="0" y="0" width="${W}" height="44" rx="8" fill="url(#hdr-priv)"/>
  <rect x="0" y="38" width="${W}" height="6" fill="#0d1117"/>
  <line x1="0" y1="44" x2="${W}" y2="44" stroke="#ffb000" stroke-width="0.6" opacity="0.55"/>
  <text x="20" y="28" fill="#ffb000" font-size="13" letter-spacing="2">// BUILDING IN PRIVATE</text>
  <text x="${W - 20}" y="28" fill="#ffb000" font-size="11" text-anchor="end" letter-spacing="1" opacity="0.75">[CLASSIFIED]</text>`;
  y = 44;

  // ── Section: big number ──
  const bigNum = `
  <text x="${W / 2}" y="135" font-size="78" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="2">${num}</text>
  <text x="${W / 2}" y="164" font-size="11" fill="#7d8590" text-anchor="middle" letter-spacing="3">COMMITS · LAST 365 DAYS</text>`;
  y = 180;

  // ── Section: progress bar ──
  const barWidth = W - PAD * 2;
  const filled = total > 0 ? Math.round((privateCount / total) * barWidth) : 0;
  const progress = `
  <text x="${PAD}" y="208" fill="#6e7681" font-size="10" letter-spacing="2">PRIVATE / TOTAL</text>
  <text x="${W - PAD}" y="208" fill="#ffb000" font-size="11" text-anchor="end" letter-spacing="1">${pct}%</text>
  <rect x="${PAD}" y="218" width="${barWidth}" height="6" rx="3" fill="#161b22"/>
  <rect x="${PAD}" y="218" width="${filled}" height="6" rx="3" fill="#ffb000" opacity="0.85"/>`;
  y = 240;

  // ── Section: 52-week sparkline ──
  const sparkLabel = 268;
  const sparkY = 282;
  const sparkH = 60;
  const sparkBarW = 5;
  const sparkGap = 2;
  const sparkW = 52 * (sparkBarW + sparkGap) - sparkGap;
  const sparkX = (W - sparkW) / 2;
  const maxWeek = Math.max(...weeks, 1);
  const sparkBars = weeks
    .map((c, i) => {
      const h = c > 0 ? Math.max(2, (c / maxWeek) * sparkH) : 0;
      const x = sparkX + i * (sparkBarW + sparkGap);
      const yy = sparkY + sparkH - h;
      const op = 0.3 + (c / maxWeek) * 0.7;
      return `<rect x="${x}" y="${yy}" width="${sparkBarW}" height="${h}" fill="#ffb000" opacity="${op.toFixed(2)}"/>`;
    })
    .join('');
  const sparkSection = `
  <text x="${PAD}" y="${sparkLabel}" fill="#6e7681" font-size="10" letter-spacing="2">ACTIVITY · 52 WEEKS</text>
  ${sparkBars}
  <line x1="${sparkX}" y1="${sparkY + sparkH + 4}" x2="${sparkX + sparkW}" y2="${sparkY + sparkH + 4}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${sparkX}" y="${sparkY + sparkH + 18}" fill="#484f58" font-size="9">52w ago</text>
  <text x="${sparkX + sparkW}" y="${sparkY + sparkH + 18}" fill="#484f58" font-size="9" text-anchor="end">today</text>`;
  y = sparkY + sparkH + 36;

  // ── Section: weekday distribution ──
  const dowLabelY = y;
  const dowStartY = y + 16;
  const dowRowH = 22;
  const dowChartX = 80;
  const dowChartW = W - dowChartX - PAD - 36;
  const maxDay = Math.max(...days, 1);
  const dowBars = days
    .map((c, i) => {
      const w = (c / maxDay) * dowChartW;
      const ly = dowStartY + i * dowRowH + 12;
      const op = (0.5 + (c / maxDay) * 0.5).toFixed(2);
      return `
  <text x="${PAD}" y="${ly}" fill="#7d8590" font-size="11" letter-spacing="2">${dayLabels[i]}</text>
  <rect x="${dowChartX}" y="${ly - 9}" width="${dowChartW}" height="6" rx="3" fill="#161b22"/>
  <rect x="${dowChartX}" y="${ly - 9}" width="${w}" height="6" rx="3" fill="#ffb000" opacity="${op}"/>
  <text x="${W - PAD}" y="${ly}" fill="#e6edf3" font-size="11" text-anchor="end">${c}</text>`;
    })
    .join('');
  const dowSection = `
  <text x="${PAD}" y="${dowLabelY}" fill="#6e7681" font-size="10" letter-spacing="2">DISTRIBUTION · WEEKDAY</text>
  ${dowBars}`;
  y = dowStartY + 7 * dowRowH + 12;

  // ── Section: 24-hour circadian ──
  const hourLabelY = y;
  const hourStartY = y + 16;
  const hourBarH = 50;
  const hourBarW = 12;
  const hourGap = 4;
  const hourChartW = 24 * (hourBarW + hourGap) - hourGap;
  const hourChartX = (W - hourChartW) / 2;
  const maxHour = Math.max(...hours, 1);
  const hourBars = hours
    .map((c, i) => {
      const h = c > 0 ? Math.max(2, (c / maxHour) * hourBarH) : 0;
      const x = hourChartX + i * (hourBarW + hourGap);
      const yy = hourStartY + hourBarH - h;
      const op = (0.3 + (c / maxHour) * 0.7).toFixed(2);
      return `<rect x="${x}" y="${yy}" width="${hourBarW}" height="${h}" rx="1" fill="#ffb000" opacity="${op}"/>`;
    })
    .join('');
  const hourSection = `
  <text x="${PAD}" y="${hourLabelY}" fill="#6e7681" font-size="10" letter-spacing="2">CIRCADIAN · 24H</text>
  ${hourBars}
  <line x1="${hourChartX}" y1="${hourStartY + hourBarH + 4}" x2="${hourChartX + hourChartW}" y2="${hourStartY + hourBarH + 4}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${hourChartX}" y="${hourStartY + hourBarH + 18}" fill="#484f58" font-size="9">00h</text>
  <text x="${hourChartX + hourChartW / 2}" y="${hourStartY + hourBarH + 18}" fill="#484f58" font-size="9" text-anchor="middle">12h</text>
  <text x="${hourChartX + hourChartW}" y="${hourStartY + hourBarH + 18}" fill="#484f58" font-size="9" text-anchor="end">24h</text>`;
  y = hourStartY + hourBarH + 36;

  // ── Section: stats table ──
  const statsLabelY = y;
  const statsStartY = y + 16;
  const statsRowH = 22;
  const stats = [
    ['REPOS', String(numRepos)],
    ['AVG / DAY', avgPerDay],
    ['PEAK DAY', dayLabels[peakDayIdx]],
    ['PEAK HOUR', `${String(peakHourIdx).padStart(2, '0')}:00`],
    ['LONGEST GAP', `${Math.floor(longestGap)} days`],
    ['LAST COMMIT', lastAgo],
  ];
  const statsRows = stats
    .map((s, i) => {
      const ly = statsStartY + i * statsRowH + 12;
      return `
  <text x="${PAD}" y="${ly}" fill="#7d8590" font-size="11" letter-spacing="2">${s[0]}</text>
  <text x="${W - PAD}" y="${ly}" fill="#e6edf3" font-size="12" text-anchor="end">${escape(s[1])}</text>`;
    })
    .join('');
  const statsSection = `
  <text x="${PAD}" y="${statsLabelY}" fill="#6e7681" font-size="10" letter-spacing="2">STATS</text>
  ${statsRows}`;
  y = statsStartY + stats.length * statsRowH + 16;

  // ── Section: tagline ──
  const taglineY = y;
  const taglineSection = `
  <line x1="${PAD}" y1="${taglineY}" x2="${W - PAD}" y2="${taglineY}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${W / 2}" y="${taglineY + 26}" font-size="11" fill="#7d8590" text-anchor="middle" font-style="italic">what's brewing stays hidden</text>
  <text x="${W / 2}" y="${taglineY + 46}" font-size="11" fill="#7d8590" text-anchor="middle" font-style="italic">until it's ready to ship.</text>
  <text x="${W / 2}" y="${taglineY + 74}" font-size="9" fill="#484f58" text-anchor="middle" letter-spacing="3">▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮</text>`;
  y = taglineY + 96;

  const H = y;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Courier New', 'SF Mono', Consolas, monospace">
  <defs>
    <pattern id="sl-priv" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" fill="#ffffff" opacity="0.025"/>
    </pattern>
    <linearGradient id="hdr-priv" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2a1a0a"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="8" fill="#0d1117"/>
  <rect width="${W}" height="${H}" rx="8" fill="url(#sl-priv)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="#3d2a1a" stroke-width="1"/>
  ${header}
  ${bigNum}
  ${progress}
  ${sparkSection}
  ${dowSection}
  ${hourSection}
  ${statsSection}
  ${taglineSection}
</svg>
`;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  const allRepos = await restAll(`/user/repos?affiliation=owner&sort=pushed&direction=desc`);
  const privateRepos = allRepos.filter((r) => r.private && !r.fork);

  // Collect commit timestamps for private repos over the last year
  const since = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
  const privateDates = [];
  for (const r of privateRepos) {
    try {
      const commits = await restAll(`/repos/${USER}/${r.name}/commits?author=${USER}&since=${since}`);
      for (const c of commits) {
        const iso = c?.commit?.author?.date;
        if (iso) privateDates.push(new Date(iso));
      }
      console.log(`  private/${r.name}: ${commits.length} commits`);
    } catch (e) {
      console.warn(`  private/${r.name}: skipped (${e.message})`);
    }
  }
  const privateCommits = privateDates.length;

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

  const publicSvg = buildPublicSvg(allRepos, publicCommits);
  const privateSvg = buildPrivateSvg(privateCommits, publicCommits, privateDates, privateRepos.length);

  fs.mkdirSync('assets', { recursive: true });
  fs.writeFileSync(path.join('assets', 'building-public.svg'), publicSvg);
  fs.writeFileSync(path.join('assets', 'building-private.svg'), privateSvg);

  console.log('Wrote assets/building-public.svg and assets/building-private.svg');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
