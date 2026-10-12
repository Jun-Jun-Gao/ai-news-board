#!/bin/bash
# 双击即可：更新 AI 动态数据 → 重建页面 → 用默认浏览器打开
# （如果 macOS 提示“无法验证开发者”，右键 → 打开 → 仍要打开，或先执行：
#   chmod +x "更新并打开.command"）
cd "$(dirname "$0")"
./scripts/update_daily.sh
echo
echo "正在用浏览器打开页面…"
open index.html
echo "完成。此窗口可以关闭。"
