#!/usr/bin/env python3
"""修复 collect.sh 的跨平台日期计算与防呆逻辑（一次性补丁脚本）。"""
import re, sys, os

p = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts", "collect.sh")
s = open(p, encoding="utf-8").read()
orig = s

# ---- 1) ago() 改为跨平台：macOS → GNU → Python 三重兜底，统一按天数 ----
old_block = re.search(
    r"# 日期动态计算.*?echo \"查询时间窗：[^\n]*\n",
    s, re.S)
assert old_block, "未找到原日期计算段落"
new_block = '''# 日期动态计算。参数是天数，依次尝试：
#   1) macOS 的 date -v-Nd   2) Linux/GNU 的 date -d "N days ago"   3) Python 兜底
# （早先只写 macOS 语法，导致 GitHub Actions 上日期为空、7 个查询全部 422 失败）
ago() {
  local n="$1" out=""
  out=$(date -v-"${n}"d +%F 2>/dev/null)
  [ -z "$out" ] && out=$(date -d "${n} days ago" +%F 2>/dev/null)
  if [ -z "$out" ]; then
    out=$(python3 -c "import datetime;print((datetime.date.today()-datetime.timedelta(days=${n})).isoformat())" 2>/dev/null)
  fi
  printf '%s' "$out"
}

D7=$(ago 7); D30=$(ago 30); D90=$(ago 90); D1Y=$(ago 365); D3Y=$(ago 1095); D7M=$(ago 210)
echo "查询时间窗：7天>${D7} · 30天>${D30} · 90天>${D90} · 1年>${D1Y} · 3年>${D3Y} · 7个月>${D7M}"
for d in "$D7" "$D30" "$D90" "$D1Y" "$D3Y" "$D7M"; do
  if [ -z "$d" ]; then
    echo "❌ 日期计算失败（date 命令不可用），终止以免发出非法查询" >&2
    exit 1
  fi
done
'''
s = s[:old_block.start()] + new_block + s[old_block.end():]

# ---- 2) 有 Token 时也留间隔，避免二级限流 ----
old_sleep = '  [ -n "${GITHUB_TOKEN:-}" ] || sleep 7   # 有 Token 时限流宽松，无需等待'
new_sleep = ('  # 有 Token 时限流宽松，但仍留出间隔，避免触发 GitHub 二级（滥用）限流\n'
             '  if [ -n "${GITHUB_TOKEN:-}" ]; then sleep 2; else sleep 7; fi')
assert old_sleep in s, "未找到 sleep 行"
s = s.replace(old_sleep, new_sleep)

# ---- 3) 失败过半则报错，避免静默产出残缺数据 ----
old_tail = 'echo "=== collected ==="'
new_tail = '''OK=$(ls "$OUT"/*.json 2>/dev/null | wc -l | tr -d ' ')
echo "=== collected：成功 ${OK}/8 个查询 ==="
if [ "$OK" -lt 5 ]; then
  echo "❌ 只有 ${OK}/8 个查询成功，数据不完整，终止（请检查日期计算、令牌权限或网络）" >&2
  exit 1
fi'''
assert old_tail in s, "未找到 collected 段落"
s = s.replace(old_tail, new_tail, 1)

open(p, "w", encoding="utf-8").write(s)
print("✅ collect.sh 已更新" if s != orig else "⚠️ 没有任何改动")
