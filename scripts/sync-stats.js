// Generates 4 SVGs from live GitHub data:
//   assets/building-public.svg   — compact list of public repos
//   assets/building-private.svg  — compact private commit counter + bar
//   assets/telemetry-public.svg  — full charts for public (sparkline, weekday, 24h, stats)
//   assets/telemetry-private.svg — full charts for private (same layout)
// Requires env PROFILE_TOKEN (PAT with `repo` scope).

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

// ─── Aggregations ─────────────────────────────────────────────────────────

function aggregate(dates) {
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
  let longestGap = 0;
  if (dates.length >= 2) {
    const sorted = [...dates].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i] - sorted[i - 1]) / (86400 * 1000);
      if (gap > longestGap) longestGap = gap;
    }
  }
  return {
    weeks,
    days,
    hours,
    peakDayIdx,
    peakHourIdx,
    longestGap,
    avgPerDay: dates.length > 0 ? (dates.length / 365).toFixed(1) : '0',
    lastTs,
    total: dates.length,
  };
}

// ─── DAILY GRIND card (gamification: beat yesterday) ─────────────────────

const TZ_OFFSET_HOURS = 2; // Italy CEST · adjust to 1 in winter if you care
const TZ_MS = TZ_OFFSET_HOURS * 3600 * 1000;

function localDateKey(d) {
  return new Date(d.getTime() + TZ_MS).toISOString().split('T')[0];
}

function shortDate(iso) {
  if (!iso) return '—';
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${months[m - 1]} ${String(d).padStart(2, '0')}`;
}

function buildDailyGrindSvg(allDates) {
  const W = 880;
  const PAD = 36;

  // Daily counts in local timezone
  const counts = {};
  for (const d of allDates) {
    const key = localDateKey(d);
    counts[key] = (counts[key] || 0) + 1;
  }

  const now = new Date();
  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(new Date(now.getTime() - 86400 * 1000));
  const todayCount = counts[todayKey] || 0;
  const yesterdayCount = counts[yesterdayKey] || 0;
  const delta = todayCount - yesterdayCount;

  // Streak: consecutive days with ≥1 commit. Today with 0 commits doesn't break the streak.
  let streak = 0;
  for (let i = 0; i < 730; i++) {
    const d = new Date(now.getTime() - i * 86400 * 1000);
    const key = localDateKey(d);
    const c = counts[key] || 0;
    if (c > 0) {
      streak++;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }

  // Best day
  let bestCount = 0;
  let bestDateKey = null;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) {
      bestCount = v;
      bestDateKey = k;
    }
  }

  // Last 90 days
  const last90 = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400 * 1000);
    const key = localDateKey(d);
    last90.push(counts[key] || 0);
  }

  // Delta visuals
  let deltaColor, deltaSymbol, deltaLabel;
  if (delta > 0) {
    deltaColor = '#00ff66';
    deltaSymbol = '↑';
    deltaLabel = `+${delta} ahead`;
  } else if (delta < 0) {
    deltaColor = '#ff6b6b';
    deltaSymbol = '↓';
    deltaLabel = `${delta} behind`;
  } else {
    deltaColor = '#ffb000';
    deltaSymbol = '=';
    deltaLabel = 'even';
  }

  // Progress to best
  const pct = bestCount > 0 ? Math.round((todayCount / bestCount) * 100) : 0;
  const isNewPeak = todayCount > 0 && todayCount > bestCount;
  const isPeakTied = todayCount > 0 && todayCount === bestCount;
  const progressColor = isNewPeak || isPeakTied ? '#00ff66' : '#ffb000';
  const progressLabel = isNewPeak ? 'NEW PEAK ★' : isPeakTied ? 'PEAK TIED' : `${todayCount} / ${bestCount} = ${pct}%`;

  // Streak label
  const streakLabel = streak === 0 ? 'broken' : streak === 1 ? 'day · alive' : 'days · alive';
  const streakColor = streak > 0 ? '#00ff66' : '#6e7681';

  // Three-column geometry
  const colW = (W - PAD * 2) / 3;
  const col1X = PAD;
  const col2X = PAD + colW;
  const col3X = PAD + colW * 2;

  // Section: header
  let y = 0;
  const header = `
  <rect x="0" y="0" width="${W}" height="44" rx="8" fill="url(#hdr-grind)"/>
  <rect x="0" y="38" width="${W}" height="6" fill="#0d1117"/>
  <line x1="0" y1="44" x2="${W}" y2="44" stroke="#00ff66" stroke-width="0.6" opacity="0.55"/>
  <text x="20" y="28" fill="#00ff66" font-size="13" letter-spacing="2">// DAILY GRIND</text>
  <circle cx="${W - 120}" cy="24" r="3" fill="#00ff66">
    <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite"/>
  </circle>
  <text x="${W - 20}" y="28" fill="#00ff66" font-size="11" text-anchor="end" letter-spacing="1" opacity="0.75">LIVE · CEST · beat yesterday</text>`;
  y = 44;

  // Row 1: TODAY | YESTERDAY | DELTA
  const row1Y = y + 36;
  const labelOffset = 0;
  const numOffset = 46;
  const subOffset = 76;
  const row1 = `
  <text x="${col1X}" y="${row1Y + labelOffset}" fill="#6e7681" font-size="10" letter-spacing="2">TODAY</text>
  <text x="${col1X}" y="${row1Y + numOffset}" fill="#ffffff" font-size="44" font-weight="700">${todayCount}</text>
  <text x="${col1X}" y="${row1Y + subOffset}" fill="#7d8590" font-size="10" letter-spacing="2">COMMITS</text>

  <text x="${col2X}" y="${row1Y + labelOffset}" fill="#6e7681" font-size="10" letter-spacing="2">YESTERDAY</text>
  <text x="${col2X}" y="${row1Y + numOffset}" fill="#7d8590" font-size="44" font-weight="700">${yesterdayCount}</text>
  <text x="${col2X}" y="${row1Y + subOffset}" fill="#7d8590" font-size="10" letter-spacing="2">COMMITS</text>

  <text x="${col3X}" y="${row1Y + labelOffset}" fill="#6e7681" font-size="10" letter-spacing="2">DELTA</text>
  <text x="${col3X}" y="${row1Y + numOffset}" fill="${deltaColor}" font-size="36" font-weight="700">${deltaSymbol} ${deltaLabel}</text>`;
  y = row1Y + subOffset + 24;

  // Divider
  const div1 = `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#21262d" stroke-width="0.5"/>`;
  y += 28;

  // Row 2: STREAK | BEST DAY | PROGRESS
  const row2Y = y + 4;
  const row2 = `
  <text x="${col1X}" y="${row2Y + labelOffset}" fill="#6e7681" font-size="10" letter-spacing="2">STREAK</text>
  <text x="${col1X}" y="${row2Y + numOffset}" fill="${streakColor}" font-size="44" font-weight="700">${streak}</text>
  <text x="${col1X}" y="${row2Y + subOffset}" fill="#7d8590" font-size="10" letter-spacing="2">${streakLabel.toUpperCase()}</text>

  <text x="${col2X}" y="${row2Y + labelOffset}" fill="#6e7681" font-size="10" letter-spacing="2">BEST DAY · 365D</text>
  <text x="${col2X}" y="${row2Y + numOffset}" fill="#ffb000" font-size="44" font-weight="700">${bestCount}</text>
  <text x="${col2X}" y="${row2Y + subOffset}" fill="#7d8590" font-size="10" letter-spacing="2">ON ${shortDate(bestDateKey).toUpperCase()}</text>

  <text x="${col3X}" y="${row2Y + labelOffset}" fill="#6e7681" font-size="10" letter-spacing="2">TARGET TO BEAT</text>
  <rect x="${col3X}" y="${row2Y + 30}" width="${colW - 32}" height="8" rx="4" fill="#161b22"/>
  <rect x="${col3X}" y="${row2Y + 30}" width="${Math.min(1, todayCount / Math.max(bestCount, 1)) * (colW - 32)}" height="8" rx="4" fill="${progressColor}" opacity="0.9"/>
  <text x="${col3X}" y="${row2Y + 60}" fill="${progressColor}" font-size="14" font-weight="700">${progressLabel}</text>`;
  y = row2Y + subOffset + 24;

  // Divider
  const div2 = `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#21262d" stroke-width="0.5"/>`;
  y += 28;

  // 90-day sparkline
  const sparkLabelY = y;
  y += 16;
  const sparkY = y;
  const sparkH = 60;
  const sparkBarW = 6;
  const sparkGap = 3;
  const sparkW = 90 * (sparkBarW + sparkGap) - sparkGap;
  const sparkX = (W - sparkW) / 2;
  const maxDaily = Math.max(...last90, 1);
  const sparkBars = last90
    .map((c, i) => {
      const h = c > 0 ? Math.max(2, (c / maxDaily) * sparkH) : 0;
      const x = sparkX + i * (sparkBarW + sparkGap);
      const yy = sparkY + sparkH - h;
      const isToday = i === 89;
      const fill = isToday ? '#ffffff' : '#00ff66';
      const op = isToday ? 1 : (0.3 + (c / maxDaily) * 0.6).toFixed(2);
      return `<rect x="${x}" y="${yy}" width="${sparkBarW}" height="${h}" rx="1" fill="${fill}" opacity="${op}"/>`;
    })
    .join('');
  const sparkSection = `
  <text x="${PAD}" y="${sparkLabelY}" fill="#6e7681" font-size="10" letter-spacing="2">LAST 90 DAYS · daily</text>
  <text x="${W - PAD}" y="${sparkLabelY}" fill="#484f58" font-size="10" letter-spacing="1" text-anchor="end">max ${maxDaily} / day</text>
  ${sparkBars}
  <line x1="${sparkX}" y1="${sparkY + sparkH + 4}" x2="${sparkX + sparkW}" y2="${sparkY + sparkH + 4}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${sparkX}" y="${sparkY + sparkH + 18}" fill="#484f58" font-size="9">90d ago</text>
  <text x="${sparkX + sparkW}" y="${sparkY + sparkH + 18}" fill="#ffffff" font-size="9" text-anchor="end" font-weight="700">today ●</text>`;
  y = sparkY + sparkH + 32;

  const H = y;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Courier New', 'SF Mono', Consolas, monospace">
  <defs>
    <pattern id="sl-grind" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" fill="#ffffff" opacity="0.025"/>
    </pattern>
    <linearGradient id="hdr-grind" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d2818"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="8" fill="#0d1117"/>
  <rect width="${W}" height="${H}" rx="8" fill="url(#sl-grind)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="#1f3a2a" stroke-width="1"/>
  ${header}
  ${row1}
  ${div1}
  ${row2}
  ${div2}
  ${sparkSection}
</svg>
`;
}

// ─── Compact summary cards ─────────────────────────────────────────────────

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
  const W = 480;
  const H = 380;
  const total = privateCount + publicCount;
  const pct = total > 0 ? Math.round((privateCount / total) * 100) : 0;
  const barWidth = W - 56;
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

  <text x="28" y="240" fill="#6e7681" font-size="10" letter-spacing="2">PRIVATE / TOTAL</text>
  <text x="${W - 28}" y="240" fill="#ffb000" font-size="11" text-anchor="end" letter-spacing="1">${pct}%</text>
  <rect x="28" y="250" width="${barWidth}" height="6" rx="3" fill="#161b22"/>
  <rect x="28" y="250" width="${filled}" height="6" rx="3" fill="#ffb000" opacity="0.85"/>

  <text x="${W / 2}" y="310" font-size="11" fill="#7d8590" text-anchor="middle" font-style="italic">what's brewing stays hidden</text>
  <text x="${W / 2}" y="330" font-size="11" fill="#7d8590" text-anchor="middle" font-style="italic">until it's ready to ship.</text>

  <text x="${W / 2}" y="358" font-size="9" fill="#484f58" text-anchor="middle" letter-spacing="3">▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮ ▮</text>
</svg>
`;
}

// ─── Detailed telemetry chart cards (public OR private) ───────────────────

function buildTelemetrySvg(dates, numRepos, theme) {
  // theme: { accent, border, gradStart, label }
  const W = 880;
  const PAD = 32;
  const a = aggregate(dates);
  const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const lastAgo = a.lastTs > 0 ? humanize(new Date(a.lastTs)) : '—';

  let y = 0;

  // Header
  const header = `
  <rect x="0" y="0" width="${W}" height="44" rx="8" fill="url(#hdr-${theme.id})"/>
  <rect x="0" y="38" width="${W}" height="6" fill="#0d1117"/>
  <line x1="0" y1="44" x2="${W}" y2="44" stroke="${theme.accent}" stroke-width="0.6" opacity="0.55"/>
  <text x="20" y="28" fill="${theme.accent}" font-size="13" letter-spacing="2">// TELEMETRY · ${theme.label}</text>
  <text x="${W - 20}" y="28" fill="${theme.accent}" font-size="11" text-anchor="end" letter-spacing="1" opacity="0.75">${theme.tag}</text>`;
  y = 44;

  // Big number
  const bigNum = `
  <text x="${W / 2}" y="120" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="2">${a.total.toLocaleString('en-US')}</text>
  <text x="${W / 2}" y="145" font-size="11" fill="#7d8590" text-anchor="middle" letter-spacing="3">COMMITS · LAST 365 DAYS</text>`;
  y = 165;

  // 52-week sparkline
  const sparkLabelY = 195;
  const sparkY = 210;
  const sparkH = 80;
  const sparkBarW = 11;
  const sparkGap = 4;
  const sparkW = 52 * (sparkBarW + sparkGap) - sparkGap;
  const sparkX = (W - sparkW) / 2;
  const maxWeek = Math.max(...a.weeks, 1);
  const sparkBars = a.weeks
    .map((c, i) => {
      const h = c > 0 ? Math.max(2, (c / maxWeek) * sparkH) : 0;
      const x = sparkX + i * (sparkBarW + sparkGap);
      const yy = sparkY + sparkH - h;
      const op = (0.3 + (c / maxWeek) * 0.7).toFixed(2);
      return `<rect x="${x}" y="${yy}" width="${sparkBarW}" height="${h}" rx="1" fill="${theme.accent}" opacity="${op}"/>`;
    })
    .join('');
  const sparkSection = `
  <text x="${PAD}" y="${sparkLabelY}" fill="#6e7681" font-size="10" letter-spacing="2">ACTIVITY · 52 WEEKS</text>
  ${sparkBars}
  <line x1="${sparkX}" y1="${sparkY + sparkH + 4}" x2="${sparkX + sparkW}" y2="${sparkY + sparkH + 4}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${sparkX}" y="${sparkY + sparkH + 18}" fill="#484f58" font-size="9">52w ago</text>
  <text x="${sparkX + sparkW}" y="${sparkY + sparkH + 18}" fill="#484f58" font-size="9" text-anchor="end">today</text>`;
  y = sparkY + sparkH + 38;

  // Two-column row: WEEKDAY (left) + CIRCADIAN (right)
  const colWidth = (W - PAD * 3) / 2;
  const colLeftX = PAD;
  const colRightX = PAD * 2 + colWidth;
  const colTopY = y;

  // Weekday (left column)
  const dowStartY = colTopY + 20;
  const dowRowH = 22;
  const dowLabelW = 36;
  const dowCountW = 32;
  const dowChartX = colLeftX + dowLabelW + 8;
  const dowChartW = colWidth - dowLabelW - dowCountW - 16;
  const maxDay = Math.max(...a.days, 1);
  const dowBars = a.days
    .map((c, i) => {
      const w = (c / maxDay) * dowChartW;
      const ly = dowStartY + i * dowRowH + 12;
      const op = (0.5 + (c / maxDay) * 0.5).toFixed(2);
      return `
  <text x="${colLeftX}" y="${ly}" fill="#7d8590" font-size="11" letter-spacing="2">${dayLabels[i]}</text>
  <rect x="${dowChartX}" y="${ly - 9}" width="${dowChartW}" height="6" rx="3" fill="#161b22"/>
  <rect x="${dowChartX}" y="${ly - 9}" width="${w}" height="6" rx="3" fill="${theme.accent}" opacity="${op}"/>
  <text x="${colLeftX + colWidth}" y="${ly}" fill="#e6edf3" font-size="11" text-anchor="end">${c}</text>`;
    })
    .join('');
  const dowSection = `
  <text x="${colLeftX}" y="${colTopY}" fill="#6e7681" font-size="10" letter-spacing="2">DISTRIBUTION · WEEKDAY</text>
  ${dowBars}`;

  // Circadian (right column)
  const hourStartY = colTopY + 20;
  const hourBarH = 80;
  const hourBarW = 11;
  const hourGap = 4;
  const hourChartW = 24 * (hourBarW + hourGap) - hourGap;
  const hourChartX = colRightX + (colWidth - hourChartW) / 2;
  const maxHour = Math.max(...a.hours, 1);
  const hourBars = a.hours
    .map((c, i) => {
      const h = c > 0 ? Math.max(2, (c / maxHour) * hourBarH) : 0;
      const x = hourChartX + i * (hourBarW + hourGap);
      const yy = hourStartY + hourBarH - h;
      const op = (0.3 + (c / maxHour) * 0.7).toFixed(2);
      return `<rect x="${x}" y="${yy}" width="${hourBarW}" height="${h}" rx="1" fill="${theme.accent}" opacity="${op}"/>`;
    })
    .join('');
  const hourSection = `
  <text x="${colRightX}" y="${colTopY}" fill="#6e7681" font-size="10" letter-spacing="2">CIRCADIAN · 24H</text>
  ${hourBars}
  <line x1="${hourChartX}" y1="${hourStartY + hourBarH + 4}" x2="${hourChartX + hourChartW}" y2="${hourStartY + hourBarH + 4}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${hourChartX}" y="${hourStartY + hourBarH + 18}" fill="#484f58" font-size="9">00h</text>
  <text x="${hourChartX + hourChartW / 2}" y="${hourStartY + hourBarH + 18}" fill="#484f58" font-size="9" text-anchor="middle">12h</text>
  <text x="${hourChartX + hourChartW}" y="${hourStartY + hourBarH + 18}" fill="#484f58" font-size="9" text-anchor="end">24h</text>`;

  const dowEndY = dowStartY + 7 * dowRowH + 12;
  const hourEndY = hourStartY + hourBarH + 38;
  y = Math.max(dowEndY, hourEndY) + 16;

  // Stats — 6-cell grid (3 columns × 2 rows)
  const statsLabelY = y;
  const statsRowY = y + 24;
  const cellW = (W - PAD * 2) / 3;
  const stats = [
    ['REPOS', String(numRepos)],
    ['AVG / DAY', a.avgPerDay],
    ['PEAK DAY', dayLabels[a.peakDayIdx]],
    ['PEAK HOUR', `${String(a.peakHourIdx).padStart(2, '0')}:00`],
    ['LONGEST GAP', `${Math.floor(a.longestGap)} days`],
    ['LAST COMMIT', lastAgo],
  ];
  const statCells = stats
    .map((s, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = PAD + col * cellW;
      const cy = statsRowY + row * 56;
      return `
  <text x="${cx}" y="${cy + 12}" fill="#6e7681" font-size="9" letter-spacing="2">${s[0]}</text>
  <text x="${cx}" y="${cy + 36}" fill="#e6edf3" font-size="16" font-weight="600">${escape(s[1])}</text>`;
    })
    .join('');
  const statsSection = `
  <text x="${PAD}" y="${statsLabelY}" fill="#6e7681" font-size="10" letter-spacing="2">STATS</text>
  ${statCells}`;
  y = statsRowY + 2 * 56 + 20;

  // Footer
  const today = new Date().toISOString().split('T')[0];
  const footer = `
  <line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#21262d" stroke-width="0.5"/>
  <text x="${PAD}" y="${y + 24}" fill="#484f58" font-size="10" letter-spacing="1">// telemetry · auto-generated · github actions</text>
  <text x="${W - PAD}" y="${y + 24}" fill="#484f58" font-size="10" letter-spacing="1" text-anchor="end">↻ ${today}</text>`;
  y = y + 40;

  const H = y;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Courier New', 'SF Mono', Consolas, monospace">
  <defs>
    <pattern id="sl-${theme.id}" width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="3" height="1" fill="#ffffff" opacity="0.025"/>
    </pattern>
    <linearGradient id="hdr-${theme.id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.gradStart}"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="8" fill="#0d1117"/>
  <rect width="${W}" height="${H}" rx="8" fill="url(#sl-${theme.id})"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="none" stroke="${theme.border}" stroke-width="1"/>
  ${header}
  ${bigNum}
  ${sparkSection}
  ${dowSection}
  ${hourSection}
  ${statsSection}
  ${footer}
</svg>
`;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function collectCommitDates(repoRefs, label) {
  // repoRefs: array of "owner/name" strings
  const since = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
  const out = [];
  for (const fullName of repoRefs) {
    try {
      const commits = await restAll(`/repos/${fullName}/commits?author=${USER}&since=${since}`);
      for (const c of commits) {
        const iso = c?.commit?.author?.date;
        if (iso) out.push(new Date(iso));
      }
      console.log(`  ${label}/${fullName}: ${commits.length} commits`);
    } catch (e) {
      console.warn(`  ${label}/${fullName}: skipped (${e.message})`);
    }
  }
  return out;
}

async function main() {
  const allRepos = await restAll(`/user/repos?affiliation=owner&sort=pushed&direction=desc`);
  const privateRepos = allRepos.filter((r) => r.private && !r.fork);

  // Use GraphQL to find ALL public repos the user committed to (incl. org repos like Building-addicts/GIGI)
  const contribData = await gql(`
    query {
      viewer {
        contributionsCollection {
          totalCommitContributions
          commitContributionsByRepository(maxRepositories: 100) {
            repository { nameWithOwner isPrivate }
          }
        }
      }
    }
  `);
  const publicCommitsTotal = contribData.viewer.contributionsCollection.totalCommitContributions;
  const publicRepoRefs = contribData.viewer.contributionsCollection.commitContributionsByRepository
    .filter((c) => !c.repository.isPrivate)
    .map((c) => c.repository.nameWithOwner);
  const privateRepoRefs = privateRepos.map((r) => `${USER}/${r.name}`);

  console.log('— Private —');
  const privateDates = await collectCommitDates(privateRepoRefs, 'private');
  console.log('— Public —');
  const publicDates = await collectCommitDates(publicRepoRefs, 'public');

  console.log(`\nSummary: public ${publicDates.length} (api total ${publicCommitsTotal}) · private ${privateDates.length}`);

  const PUBLIC_THEME = {
    id: 'pub',
    accent: '#00ff66',
    border: '#1f3a2a',
    gradStart: '#0d2818',
    label: 'PUBLIC',
    tag: '[OPEN]',
  };
  const PRIVATE_THEME = {
    id: 'priv',
    accent: '#ffb000',
    border: '#3d2a1a',
    gradStart: '#2a1a0a',
    label: 'PRIVATE',
    tag: '[CLASSIFIED]',
  };

  const allDates = [...publicDates, ...privateDates];

  const dailyGrindSvg = buildDailyGrindSvg(allDates);
  const buildingPublicSvg = buildPublicSvg(allRepos, publicCommitsTotal);
  const buildingPrivateSvg = buildPrivateSvg(privateDates.length, publicCommitsTotal);
  const telemetryPublicSvg = buildTelemetrySvg(publicDates, publicRepoRefs.length, PUBLIC_THEME);
  const telemetryPrivateSvg = buildTelemetrySvg(privateDates, privateRepos.length, PRIVATE_THEME);

  fs.mkdirSync('assets', { recursive: true });
  fs.writeFileSync(path.join('assets', 'daily-grind.svg'), dailyGrindSvg);
  fs.writeFileSync(path.join('assets', 'building-public.svg'), buildingPublicSvg);
  fs.writeFileSync(path.join('assets', 'building-private.svg'), buildingPrivateSvg);
  fs.writeFileSync(path.join('assets', 'telemetry-public.svg'), telemetryPublicSvg);
  fs.writeFileSync(path.join('assets', 'telemetry-private.svg'), telemetryPrivateSvg);

  console.log('Wrote 5 SVGs to assets/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
