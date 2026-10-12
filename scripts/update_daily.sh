#!/bin/bash
# 每日更新：AI 厂商动态 + X 人物资料 + 重建页面 + 自测（约 1~2 分钟）
# 用法：./scripts/update_daily.sh
# 想同时刷新 GitHub 榜单（较慢、消耗 GitHub 搜索额度）：WITH_GITHUB=1 ./scripts/update_daily.sh
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

log "1/6 抓取 AI 厂商动态（39 个源）"
python3 scripts/fetch_ai_news.py || echo "⚠️  动态抓取部分失败，继续使用上次快照"

log "2/6 抓取 X 领军人物 / 官方账号资料"
python3 scripts/fetch_x.py || echo "⚠️  X 资料抓取部分失败，继续使用上次快照"

if [ "${WITH_GITHUB:-0}" = "1" ]; then
  log "3/6 刷新 GitHub 榜单（8 组查询 + README）"
  FORCE=1 ./scripts/collect.sh && python3 scripts/merge.py && python3 scripts/fetch_readmes.py
else
  log "3/6 跳过 GitHub 榜单（如需刷新：WITH_GITHUB=1 ./scripts/update_daily.sh）"
fi

log "4/6 生成中文对照（只翻译新增内容，走缓存）"
python3 scripts/translate_data.py | tail -6

log "5/6 重新构建 index.html"
python3 scripts/build.py

log "6/6 自测"
python3 scripts/test_tweet_parse.py | tail -2
node scripts/smoke.js | tail -3

log "完成 ✅  打开：$ROOT/index.html"
