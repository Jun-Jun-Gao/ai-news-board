#!/bin/bash
# 临时公网链接：用 Cloudflare 快速隧道把页面发布到公网，得到一个 https 网址，
# 任何人打开就能看（无需对方安装任何东西）。关掉脚本链接即失效。
#
# 用法：./scripts/share_public.sh [本地端口]
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${1:-8789}"
CACHE="${ROOT}/tools"           # 放在项目内，避免往系统目录写东西
CF="${CACHE}/cloudflared"

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ---------- 1) 准备 cloudflared ----------
mkdir -p "$CACHE"
if [ ! -x "$CF" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64) PKG="cloudflared-darwin-arm64.tgz" ;;
    x86_64) PKG="cloudflared-darwin-amd64.tgz" ;;
    *) echo "不支持的架构：$ARCH"; exit 1 ;;
  esac
  log "首次运行，正在下载 cloudflared（约 20MB，之后会复用）"
  curl -fL --progress-bar -o "${CACHE}/cf.tgz" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/${PKG}" || {
      echo "下载失败：请检查网络，或改用「直接发文件 / 局域网共享 / 静态托管」方案"; exit 1; }
  tar -xzf "${CACHE}/cf.tgz" -C "$CACHE"
  chmod +x "$CF"
fi
echo "cloudflared: $("$CF" --version 2>/dev/null | head -1)"
echo "缓存位置:   $CACHE"

# ---------- 2) 只共享必要文件 ----------
SHARE_DIR="$(mktemp -d /tmp/gh-board-share.XXXXXX)"
cp index.html favicon.svg "$SHARE_DIR/" 2>/dev/null || cp index.html "$SHARE_DIR/"
SRV_LOG="$(mktemp /tmp/gh-board-srv.XXXXXX)"
CF_LOG="$(mktemp /tmp/gh-board-cf.XXXXXX)"
cleanup() {
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null
  [ -n "${CF_PID:-}" ] && kill "$CF_PID" 2>/dev/null
  rm -rf "$SHARE_DIR"
}
trap cleanup EXIT INT TERM

# ---------- 3) 本地静态服务 + 隧道 ----------
( cd "$SHARE_DIR" && python3 -m http.server "$PORT" --bind 127.0.0.1 >"$SRV_LOG" 2>&1 ) &
SRV_PID=$!
sleep 1
"$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$CF_LOG" 2>&1 &
CF_PID=$!

log "正在建立隧道（通常 5~15 秒）"
URL=""
for _ in $(seq 1 40); do
  URL="$(grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" | head -1)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "未能获取公网地址，隧道日志末尾："
  tail -12 "$CF_LOG"
  exit 1
fi

# ---------- 4) 自检（刚建立隧道时 DNS 可能还没生效，重试几次）----------
CODE=""
for _ in $(seq 1 8); do
  CODE="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$URL/" 2>/dev/null)"
  [ "$CODE" = "200" ] && break
  sleep 4
done
[ -z "$CODE" ] && CODE="无响应"
echo
echo "──────────────────────────────────────────────"
echo " 公网地址：  $URL"
echo " 自检结果：  HTTP $CODE  $([ "$CODE" = "200" ] && echo '✅ 已确认可被任何人打开' || echo '⚠️ 自检未通过，请在浏览器里试一下')"
echo "──────────────────────────────────────────────"
echo " · 只共享 index.html 与 favicon.svg（data/ 原始数据不会暴露）"
echo " · 链接是公开的：拿到网址的人都能访问，请勿用于敏感内容"
echo " · 关掉本脚本 / 按 Ctrl+C，链接立即失效（适合临时给同事看）"
echo " · 想长期公开 → 用 GitHub Pages 等静态托管，见 README「分享给别人」"
echo "──────────────────────────────────────────────"
echo "（保持本窗口开启；按 Ctrl+C 结束共享）"
wait "$CF_PID"
