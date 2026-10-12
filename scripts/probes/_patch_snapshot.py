#!/usr/bin/env python3
"""给 snapshot.js 增加：桌面宽度、精简模式（限制卡片数量）、额外的独立分区页面。"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(ROOT, "scripts", "snapshot.js")
s = open(p, encoding="utf-8").read()
orig = s

# 1) 宽度与精简模式参数
old = "const OUT = process.argv[2] || '/tmp';"
new = """const OUT = process.argv[2] || '/tmp';
const WIDTH = Number(process.env.SNAPSHOT_WIDTH || 820);      // 预览页宽度（桌面截图用 1600）
const COMPACT = process.env.SNAPSHOT_COMPACT === '1';         // 精简模式：限制卡片数量，方便截图
const N_CARDS = Number(process.env.SNAP_CARDS || 6);          // GitHub 项目卡数量
const N_DIGEST = Number(process.env.SNAP_DIGEST || 6);        // 速览卡数量"""
assert old in s, "未找到 OUT 定义"
s = s.replace(old, new, 1)

# 2) 卡片数量可调
s = s.replace("const cards = grid.children.slice(0, 6)",
              "const cards = grid.children.slice(0, N_CARDS)", 1)

# 3) shell：宽度参数化 + 精简模式的 CSS 裁切
old_shell = """const shell = (title, body) => `<!DOCTYPE html><html lang="zh-CN" data-theme="${get('<html>').attrs['data-theme']}">
<head><meta charset="utf-8"><title>${title}</title><style>${CSS}
/* 预览专用：强制桌面宽度，避免缩略图渲染器使用窄视口 */
html, body { width: 820px; }
</style></head>
<body><div class="wrap">${body}</div></body></html>`;"""
new_shell = """const compactCss = COMPACT ? `
/* 精简模式：每块只留固定数量，截图更紧凑 */
.digest > *:nth-child(n+${N_DIGEST + 1}) { display: none; }
.grid > *:nth-child(n+${N_CARDS + 1}) { display: none; }
.newslist > *:nth-child(n+13) { display: none; }
.leadergrid > *:nth-child(n+7) { display: none; }
.glossgrid > *:nth-child(n+10) { display: none; }
` : '';
const shell = (title, body) => `<!DOCTYPE html><html lang="zh-CN" data-theme="${get('<html>').attrs['data-theme']}">
<head><meta charset="utf-8"><title>${title}</title><style>${CSS}
/* 预览专用：固定宽度，便于用无头浏览器按桌面尺寸截图 */
html, body { width: ${WIDTH}px; }
${compactCss}
</style></head>
<body><div class="wrap">${body}</div></body></html>`;"""
assert old_shell in s, "未找到 shell 定义"
s = s.replace(old_shell, new_shell, 1)

# 4) 增加「顶部」与「GitHub 榜单」两个独立页面
old_main = "const main = shell('预览 · 总览', hero + secnav + digestSection + githubSection + newsSection + xSection + glossSection);"
new_main = """const heroPage = shell('预览 · 顶部', hero + secnav + digestSection);
const githubPage = shell('预览 · GitHub 榜单', githubSection);
const main = shell('预览 · 总览', hero + secnav + digestSection + githubSection + newsSection + xSection + glossSection);"""
assert old_main in s, "未找到 main 定义"
s = s.replace(old_main, new_main, 1)

old_write = "fs.writeFileSync(path.join(OUT, 'preview-main.html'), main);"
new_write = """fs.writeFileSync(path.join(OUT, 'preview-hero.html'), heroPage);
fs.writeFileSync(path.join(OUT, 'preview-github.html'), githubPage);
fs.writeFileSync(path.join(OUT, 'preview-main.html'), main);"""
assert old_write in s, "未找到写入语句"
s = s.replace(old_write, new_write, 1)

s = s.replace("for (const f of ['preview-main', 'preview-news', 'preview-x', 'preview-gloss', 'preview-modal'])",
              "for (const f of ['preview-hero', 'preview-github', 'preview-main', 'preview-news', 'preview-x', 'preview-gloss', 'preview-modal'])", 1)

open(p, "w", encoding="utf-8").write(s)
print("✅ snapshot.js 已支持桌面宽度 / 精简模式 / 分区页面" if s != orig else "⚠️ 无改动")
