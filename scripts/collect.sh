#!/bin/bash
# Collect GitHub repo data from the Search API.
# Unauthenticated search limit is 10 requests / minute, so space them out.
set -u
OUT="$(cd "$(dirname "$0")/.." && pwd)/data/raw"
mkdir -p "$OUT"

fetch() {
  local name="$1"; shift
  local url="$1"; shift
  if [ -s "$OUT/$name.json" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "[skip] $name（已存在；如需强制刷新：FORCE=1）"
    return 0
  fi
  local code
  AUTH=()
  [ -n "${GITHUB_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  code=$(curl -sS -m 25 -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" "${AUTH[@]}" \
    -o "$OUT/$name.json" -w "%{http_code}" "$url")
  local n
  n=$(python3 -c "import json,sys;print(len(json.load(open('$OUT/$name.json')).get('items',[])))" 2>/dev/null || echo ERR)
  echo "[$code] $name -> $n items"
  if [ "$code" != "200" ]; then
    rm -f "$OUT/$name.json"
    return 1
  fi
  # 有 Token 时限流宽松，但仍留出间隔，避免触发 GitHub 二级（滥用）限流
  if [ -n "${GITHUB_TOKEN:-}" ]; then sleep 2; else sleep 7; fi
}

B="https://api.github.com/search/repositories?per_page=100"

# 日期动态计算。参数是天数，依次尝试：
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

# 1. 全站 Star 最多的项目
fetch all_time_top        "$B&q=stars:%3E30000&sort=stars&order=desc"
# 2. 高星且近期仍在活跃更新的巨型项目
fetch active_giants       "$B&q=stars:%3E20000+pushed:%3E$D7&sort=stars&order=desc"
# 3. 近 3 年崛起的高星项目
fetch created_3y          "$B&q=created:%3E$D3Y+stars:%3E3000&sort=stars&order=desc"
# 4. 近 12 个月新建的高星项目
fetch created_1y          "$B&q=created:%3E$D1Y+stars:%3E800&sort=stars&order=desc"
# 5. 近 90 天新建
fetch created_90d         "$B&q=created:%3E$D90+stars:%3E150&sort=stars&order=desc"
# 6. 近 30 天新建
fetch created_30d         "$B&q=created:%3E$D30+stars:%3E40&sort=stars&order=desc"
# 7. 近 7 天新建
fetch created_7d          "$B&q=created:%3E$D7+stars:%3E8&sort=stars&order=desc"
# 8. 近期动量榜（近 7 个月新建的高星项目）
fetch fresh_momentum      "$B&q=created:%3E$D7M+stars:%3E400&sort=stars&order=desc"

OK=$(ls "$OUT"/*.json 2>/dev/null | wc -l | tr -d ' ')
echo "=== collected：成功 ${OK}/8 个查询 ==="
if [ "$OK" -lt 5 ]; then
  echo "❌ 只有 ${OK}/8 个查询成功，数据不完整，终止（请检查日期计算、令牌权限或网络）" >&2
  exit 1
fi
ls -la "$OUT"
