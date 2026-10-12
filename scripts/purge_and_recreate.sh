#!/bin/bash
# 删库重建：彻底清除旧提交对象（旧邮箱指纹），仓库地址与网页地址保持不变。
#
# 为什么需要这一步：即使改写历史并强制推送，GitHub 仍会保留旧提交对象，
# 按旧邮箱搜索依然能搜到；只有删除仓库重新创建，旧对象才会被真正清除。
#
# 前置：本地提交的作者已改为 GitHub 匿名邮箱；内容全部在本地，重建不会丢东西。
# 用法：GH_CONFIG_DIR=<目录> ./scripts/purge_and_recreate.sh
set -uo pipefail
cd "$(dirname "$0")/.."

REPO="Jun-Jun-Gao/ai-news-board"
OWNER="${REPO%%/*}"
NAME="${REPO##*/}"
DESC="AI 每日情报站：39 个来源的 AI 厂商动态 + X 领军人物 + GitHub 星标/增长榜，中英对照、单文件网页、每日自动更新"
PAGES="https://$(echo "$OWNER" | tr '[:upper:]' '[:lower:]').github.io/${NAME}/"

echo "──────────────────────────────────────────────"
echo " 删库重建：$REPO"
echo " 网页地址保持：$PAGES"
echo "──────────────────────────────────────────────"

# ---- 0) 安全检查：确认本地提交作者已是匿名邮箱 ----
BAD=$(git log --pretty='%ae' | grep -v "users.noreply.github.com" | head -3)
if [ -n "$BAD" ]; then
  echo "❌ 本地仍有非匿名邮箱的提交，先修正再执行："
  echo "$BAD"
  exit 1
fi
echo "✅ 本地提交作者全部为匿名邮箱（$(git rev-list --count HEAD) 个提交）"

# ---- 1) 删除旧仓库（清除旧对象）----
echo "→ 删除旧仓库…"
gh repo delete "$REPO" --yes || { echo "❌ 删除失败（令牌是否含 delete_repo 权限？）"; exit 1; }
sleep 3

# ---- 2) 用同一名字重建 ----
echo "→ 重建仓库…"
gh repo create "$REPO" --public --description "$DESC" || { echo "❌ 重建失败"; exit 1; }

# ---- 3) 推送（HTTP/1.1 + GIT_ASKPASS，避免令牌写进配置）----
TOKEN="$(gh auth token)"
ASKPASS="$(mktemp /tmp/gh-askpass.XXXXXX)"
cat > "$ASKPASS" <<'EOS'
#!/bin/sh
case "$1" in
  *Username*) echo "x-access-token" ;;
  *) printf '%s' "$GH_TOKEN" ;;
esac
EOS
chmod +x "$ASKPASS"
git remote set-url origin "https://github.com/${REPO}.git"
echo "→ 推送代码…"
GH_TOKEN="$TOKEN" GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0 \
  git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push -u origin main || { rm -f "$ASKPASS"; echo "❌ 推送失败"; exit 1; }
rm -f "$ASKPASS"

# ---- 4) 重新开启 Pages 与仓库信息 ----
echo "→ 开启 Pages 与仓库信息…"
gh api -X POST "repos/${REPO}/pages" -f build_type=workflow >/dev/null 2>&1 && echo "   Pages 已开启" || echo "   ⚠️ Pages 开启失败，请在 Settings → Pages 手动选择 GitHub Actions"
gh repo edit "$REPO" --homepage "$PAGES" \
  --add-topic ai,llm,ai-news,github-pages,chinese,dashboard,rss-aggregator,translation >/dev/null 2>&1 && echo "   主页与标签已设置"

# ---- 5) 触发首次发布 ----
sleep 5
echo "→ 触发首次发布…"
gh workflow run daily.yml && echo "   已触发，约 1~2 分钟后网页可用"

echo
echo "──────────────────────────────────────────────"
echo " 完成：https://github.com/$REPO"
echo " 网页：$PAGES"
echo "──────────────────────────────────────────────"
