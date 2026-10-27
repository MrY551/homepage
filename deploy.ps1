# 部署个人主页到阿里云 ECS：8.138.227.156
# 用法：pwsh -File deploy.ps1            # 上传并校验
#       pwsh -File deploy.ps1 -DryRun    # 只做本地校验，不上传
param(
    [string]$Key  = "$env:USERPROFILE\.ssh\id_ed25519_ecs",
    [string]$Host_ = "root@8.138.227.156",
    [string]$Remote = "/var/www/personal/index.html",
    [switch]$DryRun
)

# 0) 同步作品
& node (Join-Path  'sync-works.mjs')

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'index.html'

if (-not (Test-Path $src)) { throw "找不到本地页面: $src" }
if (-not (Test-Path $Key)) { throw "找不到密钥: $Key" }

$bytes = (Get-Item $src).Length
"本地文件: $src  ($bytes bytes)"

# 1) 本地静态校验：关键内容是否齐全
$html = Get-Content $src -Raw -Encoding UTF8
$checks = [ordered]@{
    'title'      = '<title>小黄 · 热爱代码，奔赴热爱</title>'
    'name'       = '小黄</h1>'
    'mail'       = '1924053793@qq.com'
    'github'     = 'https://github.com/MrY551'
    'wechat'     = 'HuangYi7763'
    'project-1'  = '选前缀自动生成公文编号'
    'project-2'  = '银河麒麟 ARM64 Web 环境安装包'
    'repo'       = 'https://github.com/MrY551/ARM-'
    'repo-2'     = 'https://github.com/MrY551/wenjian'
    'demo'       = 'href="/demo/"'
    'demo-acct'  = 'demo1234'
    'qq'         = 'tencent://AddContact/?fromId=45'
    'angquan'    = '安全隐患管理平台'
    'particles'  = 'id="particles"'
    'results'    = 'id="works"'
}
$fail = 0
foreach ($k in $checks.Keys) {
    if ($html.Contains($checks[$k])) { "  [OK] $k" } else { "  [MISS] $k -> $($checks[$k])"; $fail++ }
}
if ($fail -gt 0) { throw "本地校验未通过：$fail 项缺失" }

if ($DryRun) { "DryRun：跳过上传"; return }

# 2) 上传到临时文件，再原子 rename（避免覆盖写期间 nginx 读到截断内容）
$tmp = "$Remote.tmp"
& scp -i $Key -o StrictHostKeyChecking=no $src "${Host_}:$tmp"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }

# 3) 远端：改属主 -> 原子替换 -> 复核大小
& ssh -i $Key -o BatchMode=yes $Host_ "chown www-data:www-data $tmp && chmod 644 $tmp && mv -f $tmp $Remote && wc -c < $Remote"
if ($LASTEXITCODE -ne 0) { throw "远端替换失败" }

# 4) 公网校验
$r = Invoke-WebRequest -Uri 'http://8.138.227.156/' -UseBasicParsing -TimeoutSec 20
"公网 HTTP {0}  {1} bytes" -f $r.StatusCode, $r.RawContentLength
if ($r.Content -notmatch '小黄' -or $r.Content -notmatch 'MrY551') { throw "公网内容未更新（可能缓存或路径错）" }

$s = & curl.exe -sk -o NUL -w "%{http_code}" https://8.138.227.156/

# 压缩后长度核对（截断会导致 ResponseEnded / 长度异常）
$plain = & curl.exe -s -o NUL -w "%{size_download}" --max-time 20 http://8.138.227.156/
$gzSize = & curl.exe -s -H "Accept-Encoding: gzip" -o NUL -w "%{size_download}" --max-time 20 http://8.138.227.156/
$brSize = & curl.exe -s -H "Accept-Encoding: br" -o NUL -w "%{size_download}" --max-time 20 http://8.138.227.156/
"体积: plain=$plain B / gzip=$gzSize B / br=$brSize B"
if ([int]$plain -ne $bytes) { throw "公网返回 $plain B，与本地 $bytes B 不一致（可能被截断）" }
if ([int]$gzSize -le 0 -or [int]$brSize -le 0) { throw "gzip/br 响应异常（$gzSize / $brSize）" }
"公网 HTTPS $s"
"部署完成：http://8.138.227.156/  https://8.138.227.156/"

# 5) 同步到 GitHub 仓库（走 API：本机到 github.com:443 的 git 传输不稳定）
Write-Host ""
Write-Host "=== 同步 git 仓库 ===" -ForegroundColor Cyan
$msg = "deploy: " + (Get-Date -Format 'yyyy-MM-dd HH:mm') + " 上线"
& node (Join-Path $PSScriptRoot 'sync-git.mjs') $msg