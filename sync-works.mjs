// 把 GitHub 上 MrY551 的仓库同步成首页「作品」卡片
// 用法: node sync-works.mjs   （自动改写 index.html 里 WORKS:START / WORKS:END 之间的内容）
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const USER = 'MrY551';
const SELF_REPO = 'homepage';          // 站点源码仓库本身不算作品
const HTML = new URL('./index.html', import.meta.url);
const OVERRIDES = new URL('./works.json', import.meta.url);

const START = '<!-- WORKS:START -->';
const END = '<!-- WORKS:END -->';

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// 从 ~/.git-credentials 里取 token（有就用，提升限流额度与稳定性；没有也能跑）
function readToken() {
  try {
    const raw = readFileSync(`${homedir()}/.git-credentials`, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/https:\/\/(?:x-access-token|([^:@/\s]+)):?([^@/\s]*)@github\.com/);
      if (m) return (m[2] || m[1] || '').trim() || null;
    }
  } catch { /* 没有就算了 */ }
  return null;
}

const token = readToken();
const headers = { 'User-Agent': 'sync-works', Accept: 'application/vnd.github+json' };
if (token) headers.Authorization = `token ${token}`;

const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`, { headers });
if (!res.ok) {
  console.error(`取仓库列表失败: HTTP ${res.status}`);
  process.exit(1);
}
const repos = await res.json();

const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8'));

const KIND = { web: 'Web 应用', system: '系统工具', other: '其他' };

function toWork(r) {
  const o = overrides[r.name] || {};
  if (o.skip) return null;
  const isFork = !!r.fork;
  const kind = o.type || 'web';
  const title = o.title || r.name;
  const desc = o.desc || r.description || '（该仓库还没写简介）';
  const tags = (o.tags || [])
    .concat(r.language ? [r.language] : [])
    .concat((r.topics || []).slice(0, 3))
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .slice(0, 4);
  const search = [r.name, title, desc, (r.topics || []).join(' '), r.language || '', kind]
    .join(' ').toLowerCase();

  const links = [];
  if (o.demo) links.push(`<a class="demo" href="${esc(o.demo)}" target="_blank" rel="noopener">在线演示 ↗</a>`);
  links.push(`<a href="${esc(r.html_url)}" target="_blank" rel="noopener noreferrer">查看仓库 ↗</a>`);

  const badge = isFork ? `<i>Fork · ${esc(r.license?.spdx_id || 'MIT')}</i>` : `<i>${esc(r.license?.spdx_id || 'MIT')}</i>`;

  return `      <article class="work" data-type="${kind}" data-search="${esc(search)}">
        <div class="kicker"><b>${esc(o.kind || KIND[kind] || KIND.other)}</b>${badge}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(desc)}</p>
        <div class="tags">
${tags.map((t) => `          <span>${esc(t)}</span>`).join('\n')}
        </div>
        <div class="links">
          ${links.join('\n          ')}
        </div>
      </article>`;
}

const works = repos
  .filter((r) => !r.archived)
  .filter((r) => r.name !== SELF_REPO)
  .map(toWork)
  .filter(Boolean);

// 排序：有在线演示的、非 fork 的优先，其次按最近更新
const rank = (r) => (overrides[r.name]?.demo ? 0 : 0) + (r.fork ? 2 : 0);
const ordered = repos
  .filter((r) => !r.archived && r.name !== SELF_REPO)
  .sort((a, b) => rank(a) - rank(b) || new Date(b.pushed_at) - new Date(a.pushed_at));
const blocks = ordered.map(toWork).filter(Boolean);

let html = readFileSync(HTML, 'utf8');
const i = html.indexOf(START);
const j = html.indexOf(END);
if (i === -1 || j === -1 || j < i) {
  console.error('index.html 里缺少 WORKS:START / WORKS:END 标记');
  process.exit(1);
}
const before = html.slice(0, i + START.length);
const after = html.slice(j);
const generated = `\n${blocks.join('\n\n')}\n    `;

const next = before + generated + after;
writeFileSync(HTML, next, 'utf8');

console.log(`仓库 ${repos.length} 个 → 生成作品卡 ${blocks.length} 张`);
for (const r of ordered) {
  if (r.name === SELF_REPO) continue;
  const o = overrides[r.name] || {};
  console.log(`  - ${r.name}${r.fork ? '（fork）' : ''}${o.demo ? ' · 有演示' : ''} → ${o.title || r.name}`);
}
console.log(`index.html: ${html.length} → ${next.length} 字节`);
