#!/bin/bash
# 局域网共享：把页面发布到本机所有网卡，同一 WiFi / 同一内网的同事即可访问。
# 用法：./scripts/share_lan.sh [端口]
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT="${1:-8788}"

# 只共享必要的两个文件，避免把 data/ 里的原始数据一起暴露出去
SHARE_DIR="$(mktemp -d /tmp/gh-board-lan.XXXXXX)"
cp index.html favicon.svg "$SHARE_DIR/" 2>/dev/null || cp index.html "$SHARE_DIR/"
cleanup() { rm -rf "$SHARE_DIR"; }
trap cleanup EXIT INT TERM

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"
echo "──────────────────────────────────────────────"
echo " AI 每日情报站 · 局域网共享"
echo "──────────────────────────────────────────────"
if [ -n "$IP" ]; then
  echo " 本机访问：   http://127.0.0.1:$PORT/"
  echo " 同事访问：   http://$IP:$PORT/     ← 把这个发给他们"
else
  echo " 未能自动识别局域网 IP，请用「系统设置 → 网络」里看到的 IP 访问 端口 $PORT"
fi
echo
echo " · 仅限同一局域网（同一 WiFi / 同一公司网络）"
echo " · 首次运行若弹出防火墙询问，请选择「允许」"
echo " · 按 Ctrl+C 停止共享"
echo "──────────────────────────────────────────────"
cd "$SHARE_DIR"
python3 -m http.server "$PORT" --bind 0.0.0.0
