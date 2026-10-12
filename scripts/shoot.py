#!/usr/bin/env python3
"""用无头 Chrome 按桌面宽度给各分区截整页图，输出到 docs/。

背景：系统 QuickLook 渲染器视口只有约 800px 且只截方形一块，图会被裁得很难看。
这里改用真正的 Chrome：
  · 按 1600px 桌面宽度渲染（可用 WIDTH 环境变量改）
  · 用 SNAPSHOT_WIDTH/SNAPSHOT_COMPACT 生成的分区页面逐一截图
  · Chrome 在本机沙箱里渲染完不会自行退出，因此给超时保护，超时后直接取已生成的图
  · 用 Pillow 自动裁掉底部空白，得到紧凑的成品图
"""
import os, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
TMP = "/tmp/gh-board-shots"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WIDTH = int(os.environ.get("WIDTH", "1600"))

# (预览页, 输出文件, 截图高度)
PAGES = [
    ("preview-hero.html",   "preview-hero.png"),
    ("preview-github.html", "preview-list.png"),
    ("preview-news.html",   "preview-news.png"),
    ("preview-x.html",      "preview-x.png"),
    ("preview-gloss.html",  "preview-gloss.png"),
    ("preview-modal.html",  "preview-detail.png"),
]
BIG_HEIGHT = int(os.environ.get("BIG_HEIGHT", "5200"))   # 先截超长图，再按内容裁剪


def shoot(page, out_png, height=BIG_HEIGHT):
    prof = tempfile.mkdtemp(prefix="chr-shot-")
    cmd = [CHROME, "--headless=old", "--disable-gpu", "--no-sandbox", "--no-first-run",
           "--no-default-browser-check", "--disable-background-networking", "--disable-sync",
           "--disable-extensions", "--disable-default-apps", "--disable-component-update",
           "--hide-scrollbars", "--force-device-scale-factor=2",
           "--user-data-dir=" + prof, f"--window-size={WIDTH},{height}",
           "--timeout=9000", f"--screenshot={out_png}", "file://" + os.path.join(TMP, page)]
    try:
        subprocess.run(cmd, capture_output=True, timeout=40)
    except subprocess.TimeoutExpired:
        pass                      # 本机沙箱里 Chrome 渲染完不退出，超时属正常，图已生成
    return os.path.exists(out_png) and os.path.getsize(out_png) > 2000


def trim(png, margin=40):
    """按内容裁剪底部空白：优先用页面末尾的品红标记线定位（最可靠），
    找不到标记时退回“按底色差异逐行判断”。"""
    im = Image.open(png).convert("RGB")
    w, h = im.size
    px = im.load()

    # —— 方案 A：品红标记线（#ff00ff）——
    marker = 0
    for y in range(h - 1, 0, -3):
        for x in range(20, w - 20, 40):
            r, g, b = px[x, y]
            if r > 200 and g < 70 and b > 200:
                marker = y
                break
        if marker:
            break
    if marker > 20:
        new_h = max(1, marker - 14)         # 切在标记线上方，保证不出现紫线
        im.crop((0, 0, w, new_h)).save(png, optimize=True)
        return (w, h), (w, new_h)

    # —— 方案 B：按底色差异（兜底）——
    """按内容裁剪底部空白。

    注意：卡片背景 #151c2c 与页面底色 #0b0f17 只差 30 左右，阈值设太大就会把
    卡片区域当成空白而裁掉内容（之前正是这个原因导致图被裁半）。这里从底部左侧
    边缘采样真实底色，再用较小阈值逐行判断。
    """
    im = Image.open(png).convert("RGB")
    w, h = im.size
    px = im.load()

    # 底色：底部若干行、最左侧边缘（页面左右留白处）
    samples = [px[x, y] for y in range(h - 30, h - 1, 4) for x in range(2, 10, 2)]
    bg = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))

    def row_score(y):
        best = 0
        for x in range(40, w - 40, 16):          # 跳过左右留白
            r, g, b = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d > best:
                best = d
        return best

    last = 0
    for y in range(h - 1, 0, -2):
        if row_score(y) > 14:                     # 14 足以区分卡片背景(≈32)与底色(≈0)
            last = y
            break
    new_h = min(h, last + margin)
    if 0 < new_h < h:
        im.crop((0, 0, w, new_h)).save(png, optimize=True)
    return (w, h), (w, new_h)


def main():
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)

    # 生成桌面宽度的分区页面
    env = dict(os.environ, SNAPSHOT_WIDTH=str(WIDTH), SNAPSHOT_COMPACT="1",
               SNAP_CARDS="9", SNAP_DIGEST="8", SNAP_NEWS="10", SNAP_LEADERS="6", SNAP_GLOSS="9")
    print(f"→ 生成 {WIDTH}px 宽的分区页面…")
    r = subprocess.run(["node", "scripts/snapshot.js", TMP], cwd=ROOT, env=env,
                       capture_output=True, timeout=180)
    if r.returncode != 0:
        print(r.stderr.decode()[-500:])
        return 1

    ok = 0
    for page, out_name in PAGES:
        out_png = os.path.join(DOCS, out_name)
        print(f"→ 截图 {page} → docs/{out_name} …", flush=True)
        if not shoot(page, out_png):
            print(f"   ❌ 失败（{page}）")
            continue
        before, after = trim(out_png)
        print(f"   ✅ {before[0]}×{before[1]} → 裁掉空白后 {after[0]}×{after[1]}，"
              f"{os.path.getsize(out_png)/1024:.0f} KB")
        ok += 1

    print(f"\n完成：{ok}/{len(PAGES)} 张")
    return 0 if ok == len(PAGES) else 1


if __name__ == "__main__":
    sys.exit(main())
