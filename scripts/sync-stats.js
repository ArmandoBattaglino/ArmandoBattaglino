// Fetches public repo list + private commit counts and rewrites two ASCII
// panels in README.md between marker comments.
// Requires env PROFILE_TOKEN (PAT with `repo` scope).
// Usage: node scripts/sync-stats.js

const fs = require('fs');

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

async function rest(path) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`REST ${path} → ${res.status}`);
  return res.json();
}

async function restAll(path) {
  const out = [];
  let url = `https://api.github.com${path}${path.includes('?') ? '&' : '?'}per_page=100`;
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

function pad(s, n) {
  s = String(s);
  if (s.length > n) return s.slice(0, n - 1) + '…';
  return s + ' '.repeat(n - s.length);
}

function padR(s, n) {
  s = String(s);
  if (s.length > n) return s.slice(0, n - 1) + '…';
  return ' '.repeat(n - s.length) + s;
}

// Build a fixed-width ASCII panel
function panel(title, lines, width) {
  const inner = width - 2;
  const top = '╔' + '═'.repeat(inner) + '╗';
  const sep = '╠' + '═'.repeat(inner) + '╣';
  const bot = '╚' + '═'.repeat(inner) + '╝';
  const wrap = (s) => '║' + pad(s, inner) + '║';
  return [
    top,
    wrap(`  // ${title}`),
    sep,
    wrap(''),
    ...lines.map(wrap),
    wrap(''),
    bot,
  ].join('\n');
}

function buildPublicPanel(repos, totalPublicCommits) {
  const PUBLIC_WIDTH = 80;

  // sort by pushed_at desc, take top 8
  const top = repos
    .filter((r) => !r.fork && !r.private)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 8);

  const rows = top.map((r) => {
    const name = pad(r.name, 24);
    const lang = pad((r.language || '—').toLowerCase(), 12);
    const stars = padR(`★ ${r.stargazers_count}`, 6);
    const updated = pad(`↻ ${humanize(r.pushed_at)}`, 16);
    return `  >>  ${name} ${lang} ${stars}   ${updated}`;
  });

  const footer = [
    '',
    `  ${repos.filter((r) => !r.private && !r.fork).length} public repos · ${totalPublicCommits} commits this year`,
  ];

  return panel('BUILDING IN PUBLIC', [...rows, ...footer], PUBLIC_WIDTH);
}

function buildPrivatePanel(privateCount, publicCount) {
  const PRIVATE_WIDTH = 44;
  const total = privateCount + publicCount;
  const ratio = total > 0 ? privateCount / total : 0;
  const pct = Math.round(ratio * 100);
  const barWidth = 26;
  const filled = Math.round(ratio * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  const num = privateCount.toLocaleString('en-US');

  const lines = [
    '',
    `         ${bar}`,
    '',
    `              ${padR(num, 8)}`,
    `         commits this year`,
    '',
    `              ${padR(pct + '%', 4)} of total`,
    '',
    `  what's brewing stays hidden`,
    `  until it's ready to ship.`,
  ];

  return panel('BUILDING IN PRIVATE', lines, PRIVATE_WIDTH);
}

async function main() {
  // Authenticated user's repos (includes private ones owned by user)
  const allRepos = await restAll(`/user/repos?affiliation=owner&sort=pushed&direction=desc`);

  // Get private repos
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
        contributionsCollection {
          totalCommitContributions
        }
      }
    }`,
    { login: USER }
  );
  const publicCommits = publicData.user.contributionsCollection.totalCommitContributions;

  console.log(`Public commits: ${publicCommits}, Private commits: ${privateCommits}`);

  // Build panels
  const publicPanel = buildPublicPanel(allRepos, publicCommits);
  const privatePanel = buildPrivatePanel(privateCommits, publicCommits);

  // Replace in README between markers
  let readme = fs.readFileSync('README.md', 'utf8');
  const wrapBlock = (panelStr) => `\n\n<pre>\n${panelStr}\n</pre>\n\n`;

  readme = readme.replace(
    /<!-- PUBLIC_START -->[\s\S]*?<!-- PUBLIC_END -->/,
    `<!-- PUBLIC_START -->${wrapBlock(publicPanel)}<!-- PUBLIC_END -->`
  );
  readme = readme.replace(
    /<!-- PRIVATE_START -->[\s\S]*?<!-- PRIVATE_END -->/,
    `<!-- PRIVATE_START -->${wrapBlock(privatePanel)}<!-- PRIVATE_END -->`
  );

  fs.writeFileSync('README.md', readme);
  console.log('README.md updated.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
