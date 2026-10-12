#!/usr/bin/env python3
"""Build a fully self-contained index.html (data + CSS + JS inlined, works from file://)."""
import base64, json, os, re, sys, argparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
DATA = os.path.join(ROOT, "data")

ap = argparse.ArgumentParser()
ap.add_argument("--out", default=os.path.join(ROOT, "index.html"))
ap.add_argument("--limit", type=int, default=0, help="only embed the first N repos (for smoke tests)")
ap.add_argument("--autoclick", action="store_true", help="append a script that opens the first card's detail view")
a = ap.parse_args()
OUT = a.out
README_LIMIT = 2600

def data_uri(name, mime):
    path = os.path.join(WEB, name)
    if not os.path.exists(path):
        return ""
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()


def inline_svg(name):
    path = os.path.join(WEB, name)
    return open(path, encoding="utf-8").read().strip() if os.path.exists(path) else ""


ICON_SVG = data_uri("favicon.svg", "image/svg+xml")
ICON_PNG16 = data_uri("icon-16.png", "image/png")
ICON_PNG32 = data_uri("icon-32.png", "image/png")
ICON_PNG180 = data_uri("icon-180.png", "image/png")
BRAND_SVG = inline_svg("favicon.svg")

tpl = open(os.path.join(WEB, "index.template.html"), encoding="utf-8").read()
css = open(os.path.join(WEB, "styles.css"), encoding="utf-8").read()
js = open(os.path.join(WEB, "app.js"), encoding="utf-8").read()

repos = json.load(open(os.path.join(DATA, "repos.json"), encoding="utf-8"))
readmes = json.load(open(os.path.join(DATA, "readmes.json"), encoding="utf-8"))["readmes"]

if a.limit:
    repos = dict(repos, repos=repos["repos"][: a.limit])

listed = {r["full_name"] for r in repos["repos"]}
slim = {}
for fn, rm in readmes.items():
    if fn not in listed:            # 只内嵌仍在榜单里的项目，避免携带过期数据
        continue
    txt = rm["text"].strip()
    if len(txt) > README_LIMIT:
        cut = txt[:README_LIMIT]
        # prefer cutting at a paragraph break
        idx = cut.rfind("\n\n")
        if idx > README_LIMIT * 0.6:
            cut = cut[:idx]
        txt = cut.rstrip() + "\n\n_…（摘要已截断，可在详情页点击“在线抓取完整 README”）_"
    slim[fn] = {"file": rm["file"], "text": txt}

payload = {
    "generated_at": repos["generated_at"],
    "source": repos["source"],
    "count": repos["count"],
    "repos": repos["repos"],
    "readmes": slim,
}

news_path = os.path.join(DATA, "ai_news.json")
if os.path.exists(news_path):
    news = json.load(open(news_path, encoding="utf-8"))
    payload["news"] = news
    payload["news_generated_at"] = news.get("generated_at", "")

gloss_path = os.path.join(DATA, "glossary.json")
if os.path.exists(gloss_path):
    payload["glossary"] = json.load(open(gloss_path, encoding="utf-8"))

lead_path = os.path.join(DATA, "x_leaders.json")
if os.path.exists(lead_path):
    payload["leaders"] = json.load(open(lead_path, encoding="utf-8"))
data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
# keep inline <script> safe
data_json = data_json.replace("</", "<\\/").replace("<!--", "<\\!--")

html = (tpl.replace("/*__CSS__*/", css)
          .replace("/*__DATA__*/", data_json)
          .replace("/*__JS__*/", js)
          .replace("/*__ICON_SVG__*/", ICON_SVG)
          .replace("/*__ICON_PNG16__*/", ICON_PNG16)
          .replace("/*__ICON_PNG32__*/", ICON_PNG32)
          .replace("/*__ICON_PNG180__*/", ICON_PNG180)
          .replace("/*__BRAND_SVG__*/", BRAND_SVG))
if a.autoclick:
    html = html.replace("</body>", """<script>
window.addEventListener('load', function () {
  var c = document.querySelector('.card');
  if (c) c.click();
  var r = document.querySelector('.readme');
  window.__SMOKE__ = {
    cards: document.querySelectorAll('.card').length,
    modalOpen: document.getElementById('modal').classList.contains('open'),
    readmeHtmlLen: r ? r.innerHTML.length : 0,
    readmeHasTags: r ? /<(h[1-6]|p|ul|li|pre|table|blockquote)/.test(r.innerHTML) : false,
    statCells: document.querySelectorAll('.stat-cell').length,
    chartImg: !!document.querySelector('.chart-img'),
    links: document.querySelectorAll('#sheet .link-list a').length,
    tabs: document.querySelectorAll('#tabs .tab').length,
    langOptions: document.querySelectorAll('#langSel option').length,
    topics: document.querySelectorAll('.topic').length,
    firstCard: (document.querySelector('.repo-name') || {}).textContent
  };
  document.title = 'SMOKE:' + JSON.stringify(window.__SMOKE__);
});
</script></body>""")
open(OUT, "w", encoding="utf-8").write(html)

print(f"built {OUT}")
print(f"  repos: {len(payload['repos'])}  readmes: {len(slim)}")
if "news" in payload:
    print(f"  ai news: {payload['news'].get('count')} 条 / {payload['news'].get('ok_sources')} 个源")
if "glossary" in payload:
    print(f"  glossary: {len(payload['glossary'].get('terms', []))} 条术语")
if "leaders" in payload:
    print(f"  x leaders: {len(payload['leaders'].get('leaders', []))} 位（含推文快照 {payload['leaders'].get('with_tweets', 0)} 位）")
print(f"  html size: {len(html.encode('utf-8'))/1048576:.2f} MB")
