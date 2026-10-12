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
  [ -n "${GITHUB_TOKEN:-}" ] || sleep 7   # 有 Token 时限流宽松，无需等待
}

B="https://api.github.com/search/repositories?per_page=100"

# 日期动态计算（否则“近 7 天”会永远停在写死的那几天）
ago() { date -v-"$1" +%F 2>/dev/null || date -d "$1 ago" +%F; }
D7=$(ago 7d); D30=$(ago 30d); D90=$(ago 90d); D1Y=$(ago 1y); D3Y=$(ago 3y); D7M=$(ago 7m)
echo "查询时间窗：7天>$D7 · 30天>$D30 · 90天>$D90 · 1年>$D1Y · 3年>$D3Y"

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

echo "=== collected ==="
ls -la "$OUT"
