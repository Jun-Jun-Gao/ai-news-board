#!/bin/bash
# 授权之后一键完成：创建 GitHub 仓库 → 推送代码 → 开启 Pages（Actions 发布）
#
# 前置条件（二选一）：
#   A. 已执行 gh auth login          ← 推荐
#   B. 已把本机 SSH 公钥添加到 GitHub（此时脚本用 SSH 推送，但仓库需你手动先建好）
#
# 用法：./scripts/push_to_github.sh [仓库名] [public|private]
set -uo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${1:-ai-news-board}"
VISIBILITY="${2:-public}"

echo "──────────────────────────────────────────────"
echo " 推送到 GitHub  ·  仓库名：${REPO_NAME}（${VISIBILITY}）"
echo "──────────────────────────────────────────────"

# ---------- 1) 检查提交是否就绪 ----------
if [ -z "$(git log --oneline -1 2>/dev/null)" ]; then
  echo "❌ 还没有任何提交，先执行：git add -A && git commit -m \"init\""
  exit 1
fi
echo "本地提交：$(git log --oneline -1)"
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  工作区有未提交改动，先提交它们更稳妥："
  git status --short | head -5
  read -r -p "仍要继续推送吗？(y/N) " ans
  [ "${ans:-N}" != "y" ] && exit 1
fi

# ---------- 2) 确认授权方式 ----------
USE_GH=0
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  USE_GH=1
  OWNER="$(gh api user -q .login 2>/dev/null)"
  echo "✅ gh 已登录，账号：$OWNER"
else
  echo "⚠️  gh 未登录，尝试用 SSH 推送（仓库必须已存在）"
  if ! ssh -o BatchMode=yes -o ConnectTimeout=12 -o UserKnownHostsFile=/dev/null \
        -o StrictHostKeyChecking=no -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo
    echo "❌ SSH 也未被 GitHub 接受。请先任选其一："
    echo "   1) gh auth login                          （推荐，30 秒）"
    echo "   2) 把 ~/.ssh/id_ed25519.pub 的内容贴到 GitHub → Settings → SSH and GPG keys"
    exit 1
  fi
  OWNER="$(ssh -o BatchMode=yes -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -T git@github.com 2>&1 | sed -n 's/^Hi \([^!]*\)!.*/\1/p')"
  echo "✅ SSH 已授权，账号：${OWNER:-未知}"
fi

FULL="${OWNER}/${REPO_NAME}"

# ---------- 3) 创建仓库（若不存在）并推送 ----------
if [ "$USE_GH" = "1" ]; then
  if gh repo view "$FULL" >/dev/null 2>&1; then
    echo "仓库已存在：https://github.com/$FULL"
    git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$FULL.git"
    git push -u origin HEAD
  else
    echo "正在创建仓库并推送…"
    gh repo create "$FULL" "--$VISIBILITY" --source=. --remote=origin --push
  fi
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "git@github.com:$FULL.git"
  git remote set-url origin "git@github.com:$FULL.git"
  git push -u origin HEAD
fi

# ---------- 4) 开启 Pages（用 Actions 发布，与 daily.yml 配套）----------
if [ "$USE_GH" = "1" ]; then
  echo
  echo "正在开启 GitHub Pages（Actions 发布方式）…"
  if gh api -X POST "repos/$FULL/pages" -f build_type=workflow >/dev/null 2>&1; then
    echo "✅ Pages 已开启"
  elif gh api -X PUT "repos/$FULL/pages" -f build_type=workflow >/dev/null 2>&1; then
    echo "✅ Pages 已更新为 Actions 发布方式"
  else
    echo "⚠️  自动开启失败，请手动操作：Settings → Pages → Source 选 “GitHub Actions”"
  fi
  PAGES_URL="https://${OWNER}.github.io/${REPO_NAME}/"
else
  PAGES_URL="（请到 Settings → Pages → Source 选 “GitHub Actions”）"
fi

echo
echo "──────────────────────────────────────────────"
echo " 仓库地址：  https://github.com/$FULL"
echo " 在线页面：  $PAGES_URL"
echo " 首次发布：  Actions 里手动点一次 “Run workflow”，约 1~2 分钟后可访问"
echo "──────────────────────────────────────────────"
