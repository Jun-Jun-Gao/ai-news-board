#!/usr/bin/env python3
"""生成网站图标与品牌图。

产出：
  web/favicon.svg    矢量图标（浏览器优先使用，任何尺寸都清晰）
  web/icon-32.png    32×32 PNG 图标（兼容老浏览器）
  web/icon-180.png   180×180 应用图标（iOS / Android 添加到主屏）
  web/icon-512.png   512×512 大图（备用）
  favicon.svg        放到站点根目录，方便 http:// 访问时直接命中
  docs/icon.png      图标展示图（README 用）
  docs/logo.png      品牌横幅：图标 + 「AI 每日情报站」+ 副标题

设计：渐变圆角方块（#4d8dff → #a855f7，与页面主色一致）+ 白色「星火」，
小尺寸下依然是清晰可辨的实心形状。
"""
import base64, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
DOCS = os.path.join(ROOT, "docs")

C0 = (77, 141, 255)      # #4d8dff
C1 = (168, 85, 247)      # #a855f7
BG = (11, 15, 23)        # #0b0f17
TEXT = (232, 238, 252)   # #e8eefc
DIM = (154, 169, 196)    # #9aa9c4

# 归一化坐标（相对画布边长）
SPARKS = [
    # cx,    cy,    R,     waist
    (0.400, 0.375, 0.235, 0.052),
    (0.725, 0.700, 0.118, 0.026),
]
CORNER = 0.235           # 圆角半径比例
SS = 4                   # 超采样倍数（先放大再缩小，边缘更干净）


# ---------------- 通用几何 ----------------
def spark_path(cx, cy, r, w, steps=26):
    """四角星（甜点型）轮廓点：四条二次贝塞尔曲线采样。"""
    pts = []
    quads = [
        ((cx, cy - r), (cx + w, cy - w), (cx + r, cy)),
        ((cx + r, cy), (cx + w, cy + w), (cx, cy + r)),
        ((cx, cy + r), (cx - w, cy + w), (cx - r, cy)),
        ((cx - r, cy), (cx - w, cy - w), (cx, cy - r)),
    ]
    for p0, p1, p2 in quads:
        for i in range(steps):
            t = i / steps
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
            pts.append((x, y))
    return pts


def spark_svg_path(size, cx, cy, r, w):
    """SVG d 属性（含二次贝塞尔指令，比采样多边形更平滑）。"""
    cx, cy, r, w = cx * size, cy * size, r * size, w * size
    return (f"M{cx:.2f} {cy - r:.2f} "
            f"Q{cx + w:.2f} {cy - w:.2f} {cx + r:.2f} {cy:.2f} "
            f"Q{cx + w:.2f} {cy + w:.2f} {cx:.2f} {cy + r:.2f} "
            f"Q{cx - w:.2f} {cy + w:.2f} {cx - r:.2f} {cy:.2f} "
            f"Q{cx - w:.2f} {cy - w:.2f} {cx:.2f} {cy - r:.2f} Z")


def hex_of(rgb):
    return "#%02x%02x%02x" % rgb


# ---------------- 图标 ----------------
def sparks_for(size):
    """小尺寸下只用一颗居中大星火，避免细节糊成一团。"""
    if size >= 24:
        return SPARKS
    return [(0.47, 0.47, 0.30, 0.062)]


def render_icon(size):
    """返回带透明通道的图标（先 4 倍超采样再缩小）。"""
    S = size * SS
    yy, xx = np.mgrid[0:S, 0:S]
    t = (xx + yy) / (2 * S - 2)
    c0 = np.array(C0, dtype=float)[None, None, :]
    c1 = np.array(C1, dtype=float)[None, None, :]
    grad = (c0 * (1 - t[..., None]) + c1 * t[..., None]).astype(np.uint8)
    img = Image.fromarray(grad, "RGB").convert("RGBA")

    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(CORNER * S), fill=255)
    img.putalpha(mask)

    spark_layer = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    d = ImageDraw.Draw(spark_layer)
    for cx, cy, r, w in sparks_for(size):
        d.polygon(spark_path(cx * S, cy * S, r * S, w * S), fill=(255, 255, 255, 255))
    img = Image.alpha_composite(img, spark_layer)
    return img.resize((size, size), Image.LANCZOS)


def icon_svg(size=64):
    sparks = "".join(
        f'\n  <path d="{spark_svg_path(size, cx, cy, r, w)}" fill="#fff"'
        + (' opacity="0.95"' if i else "") + "/>"
        for i, (cx, cy, r, w) in enumerate(SPARKS))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="AI 每日情报站">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{hex_of(C0)}"/>
      <stop offset="1" stop-color="{hex_of(C1)}"/>
    </linearGradient>
  </defs>
  <rect width="{size}" height="{size}" rx="{CORNER * size:.2f}" fill="url(#brand)"/>{sparks}
</svg>
'''


# ---------------- 品牌横幅 ----------------
def radial_glow(w, h, center, radius, color, strength):
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / radius
    a = np.clip(1 - dist, 0, 1) ** 2 * strength
    layer = np.zeros((h, w, 3), dtype=float)
    layer[:] = np.array(color, dtype=float)[None, None, :]
    return layer, a[..., None]


def render_banner(path, width=1600, height=420):
    yy, xx = np.mgrid[0:height, 0:width]
    base = np.zeros((height, width, 3), dtype=float)
    base[:] = np.array(BG, dtype=float)[None, None, :]
    for center, radius, color, strength in [
        ((0.08 * width, -0.1 * height), 0.75 * width, (77, 141, 255), 0.22),
        ((1.02 * width, 0.1 * height), 0.7 * width, (168, 85, 247), 0.20),
    ]:
        layer, a = radial_glow(width, height, center, radius, color, strength)
        base = base * (1 - a) + layer * a
    img = Image.fromarray(base.astype(np.uint8), "RGB").convert("RGBA")

    icon = render_icon(224)
    img.alpha_composite(icon, (76, (height - 224) // 2))

    title_font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 108, index=1)
    sub_font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 44, index=1)
    d = ImageDraw.Draw(img)
    d.text((348, 118), "AI 每日情报站", font=title_font, fill=TEXT)
    d.text((352, 248), "厂商动态 · X 领军人物 · GitHub 风云榜 · 中英对照",
           font=sub_font, fill=DIM)
    img.convert("RGB").save(path, quality=95)


def main():
    os.makedirs(WEB, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)

    svg = icon_svg(64)
    open(os.path.join(WEB, "favicon.svg"), "w", encoding="utf-8").write(svg)
    open(os.path.join(ROOT, "favicon.svg"), "w", encoding="utf-8").write(svg)

    sizes = {"icon-16.png": 16, "icon-32.png": 32, "icon-180.png": 180, "icon-512.png": 512}
    for name, size in sizes.items():
        render_icon(size).save(os.path.join(WEB, name))
    render_icon(512).save(os.path.join(DOCS, "icon.png"))
    render_banner(os.path.join(DOCS, "logo.png"))

    print("已生成：")
    for f in ["web/favicon.svg", "favicon.svg", "web/icon-16.png", "web/icon-32.png",
              "web/icon-180.png", "web/icon-512.png", "docs/icon.png", "docs/logo.png"]:
        p = os.path.join(ROOT, f)
        print(f"  {f:<22} {os.path.getsize(p):>7,} bytes")
    png32 = base64.b64encode(open(os.path.join(WEB, "icon-32.png"), "rb").read()).decode()
    print(f"\n32×32 PNG data URI 长度：{len(png32)} 字符（将内嵌进 HTML）")


if __name__ == "__main__":
    main()
