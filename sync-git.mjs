// 通过 GitHub REST API 把本地仓库推上去（本机到 github.com:443 的 git 传输不稳定，走 API 更可靠）
// 用法: node sync-git.mjs ["提交说明"]
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OWNER = 'MrY551';
const REPO = 'homepage';
const BRANCH = 'main';

function readToken() {
  const raw = readFileSync(`${homedir()}/.git-credentials`, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/https:\/\/(?:x-access-token|([^:@/\s]+)):?([^@/\s]*)@github\.com/);
    if (m) return (m[2] || m[1] || '').trim() || null;
  }
  return null;
}

const token = readToken();
if (!token) { console.error('没找到 GitHub token（~/.git-credentials）'); process.exit(1); }

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sync-git' };

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// 取要同步的文件（用本地 git 已跟踪清单，天然跳过截图等忽略项）
const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  // 一次性补丁脚本不进仓库，保持干净
  .filter((p) => !/^patch-.*\.ps1$/.test(p));

console.log(`待同步文件 ${files.length} 个`);

// 远端现状
let headSha = null, baseTree = null;
try {
  const ref = await api(`/git/ref/heads/${BRANCH}`);
  headSha = ref.object.sha;
  const commit = await api(`/git/commits/${headSha}`);
  baseTree = commit.tree.sha;
  console.log(`远端当前 HEAD ${headSha.slice(0, 7)}，提交信息：「${commit.message.split('\n')[0]}」`);
} catch (e) {
  if (!/404|409/.test(e.message)) throw e;   // 空仓库 GitHub 返回 409 Git Repository is empty
  console.log('远端还是空仓库：先用 Contents API 建一个初始提交（空仓库不接受 blob API）');
  await api('/contents/README.md', {
    method: 'PUT',
    body: JSON.stringify({
      message: 'chore: 初始化仓库',
      content: Buffer.from('# homepage\n\n小黄的个人主页源码。\n').toString('base64'),
      branch: BRANCH
    })
  });
  const ref0 = await api(`/git/ref/heads/${BRANCH}`);
  headSha = ref0.object.sha;
  const c0 = await api(`/git/commits/${headSha}`);
  baseTree = c0.tree.sha;
  console.log(`初始提交 ${headSha.slice(0, 7)} 已建立，继续推送全部文件`);
}

// 生成 blob
const tree = [];
for (const path of files) {
  const abs = join(ROOT, path);
  const buf = readFileSync(abs);
  const blob = await api('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' })
  });
  tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
}

const newTree = await api('/git/trees', {
  method: 'POST',
  body: JSON.stringify(baseTree ? { base_tree: baseTree, tree } : { tree })
});

if (baseTree && newTree.sha === baseTree) {
  console.log('内容与远端一致，无需提交');
  process.exit(0);
}

const message = process.argv[2] || `sync: ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
const commit = await api('/git/commits', {
  method: 'POST',
  body: JSON.stringify({ message, tree: newTree.sha, parents: headSha ? [headSha] : [] })
});

if (headSha) {
  await api(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
} else {
  await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }) });
}

// 让本地也同步到这个提交（记录下来，便于下次比对）
try {
  execFileSync('git', ['fetch', 'origin', BRANCH], { cwd: ROOT, stdio: 'ignore' });
} catch { /* fetch 失败不影响推送结果 */ }

console.log(`已推送 ${commit.sha.slice(0, 7)} → https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`);
