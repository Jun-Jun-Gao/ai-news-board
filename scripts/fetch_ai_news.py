#!/usr/bin/env python3
"""抓取 AI 厂商动态 / 研究 / 媒体 / 中文资讯，归一化后写入 data/ai_news.json。

只依赖标准库。每个源独立失败，不影响其它源；结果里会记录每个源的成功与否。
"""
import json, os, re, ssl, html, hashlib, datetime, urllib.request, urllib.error
import concurrent.futures as cf
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "ai_news.json")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
CTX = ssl.create_default_context()
MAX_AGE_DAYS = 75          # 只保留 75 天内的动态
PER_SOURCE_CAP = 40        # 每个源最多保留多少条
TOTAL_CAP = 600

# id, 显示名, 分组, 类型, 地址, 语言
SOURCES = [
    # ---- 厂商官方 ----
    ("openai",       "OpenAI",            "厂商", "rss",  "https://openai.com/news/rss.xml", "en"),
    ("anthropic",    "Anthropic",         "厂商", "anth", "https://www.anthropic.com/news", "en"),
    ("deepseek",     "DeepSeek",          "厂商", "ds",   "https://api-docs.deepseek.com/news", "en"),
    ("google-ai",    "Google AI",         "厂商", "rss",  "https://blog.google/technology/ai/rss/", "en"),
    ("google-res",   "Google Research",   "厂商", "rss",  "https://research.google/blog/rss/", "en"),
    ("microsoft",    "Microsoft AI",      "厂商", "rss",  "https://news.microsoft.com/source/topics/ai/feed/", "en"),
    ("nvidia",       "NVIDIA",            "厂商", "rss",  "https://blogs.nvidia.com/feed/", "en"),
    ("huggingface",  "Hugging Face",      "厂商", "rss",  "https://huggingface.co/blog/feed.xml", "en"),
    ("qwen",         "阿里 Qwen",          "厂商", "rss",  "https://qwenlm.github.io/blog/index.xml", "en"),
    ("together",     "Together AI",       "厂商", "rss",  "https://www.together.ai/blog/rss.xml", "en"),
    ("elevenlabs",   "ElevenLabs",        "厂商", "rss",  "https://elevenlabs.io/blog/rss.xml", "en"),
    ("ollama",       "Ollama",            "厂商", "rss",  "https://ollama.com/blog/rss.xml", "en"),
    ("aws-ml",       "AWS Machine Learning", "厂商", "rss", "https://aws.amazon.com/blogs/machine-learning/feed/", "en"),
    ("minimax",      "MiniMax",           "厂商", "mini", "https://www.minimax.io/news", "en"),
    ("langchain",    "LangChain",         "厂商", "rss",  "https://www.langchain.com/blog/rss.xml", "en"),
    # ---- 研究机构 ----
    ("arxiv-ai",     "arXiv cs.AI",       "研究", "rss",  "https://rss.arxiv.org/rss/cs.AI", "en"),
    ("bair",         "Berkeley BAIR",     "研究", "rss",  "https://bair.berkeley.edu/blog/feed.xml", "en"),
    # ---- 媒体 / 社区 ----
    ("techcrunch",   "TechCrunch AI",     "媒体", "rss",  "https://techcrunch.com/category/artificial-intelligence/feed/", "en"),
    ("verge",        "The Verge AI",      "媒体", "rss",  "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "en"),
    ("techreview",   "MIT Tech Review AI", "媒体", "rss", "https://www.technologyreview.com/topic/artificial-intelligence/feed", "en"),
    ("techmeme",     "Techmeme",          "媒体", "rss",  "https://www.techmeme.com/feed.xml", "en"),
    ("ars",          "Ars Technica AI",   "媒体", "rss",  "https://arstechnica.com/ai/feed/", "en"),
    ("wired",        "Wired AI",          "媒体", "rss",  "https://www.wired.com/feed/tag/ai/latest/rss", "en"),
    ("zdnet",        "ZDNet AI",          "媒体", "rss",  "https://www.zdnet.com/topic/artificial-intelligence/rss.xml", "en"),
    ("decoder",      "The Decoder",       "媒体", "rss",  "https://the-decoder.com/feed/", "en"),
    ("marktechpost", "MarkTechPost",      "媒体", "rss",  "https://www.marktechpost.com/feed/", "en"),
    ("hn-ai",        "Hacker News (AI)",  "社区", "rss",  "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT&points=100", "en"),
    ("simonw",       "Simon Willison",    "社区", "rss",  "https://simonwillison.net/atom/everything/", "en"),
    # ---- 中文源 ----
    ("qbitai",       "量子位",             "中文", "rss",  "https://www.qbitai.com/feed", "zh"),
    ("infoq-ai",     "InfoQ AI",          "中文", "rss",  "https://www.infoq.cn/feed/ai", "zh"),
    ("ithome",       "IT之家",             "中文", "rss",  "https://www.ithome.com/rss/", "zh"),
    ("geekpark",     "极客公园",            "中文", "rss",  "https://www.geekpark.net/rss", "zh"),
    ("leiphone",     "雷峰网",             "中文", "rss",  "https://www.leiphone.com/feed", "zh"),
    ("tmtpost",      "钛媒体",             "中文", "rss",  "https://www.tmtpost.com/rss", "zh"),
    # ---- Newsletter ----
    ("importai",     "Import AI",         "通讯", "rss",  "https://importai.substack.com/feed", "en"),
    ("interconnects", "Interconnects",    "通讯", "rss",  "https://www.interconnects.ai/feed", "en"),
    ("latentspace",  "Latent Space",      "通讯", "rss",  "https://www.latent.space/feed", "en"),
    ("oneuseful",    "One Useful Thing",  "通讯", "rss",  "https://www.oneusefulthing.org/feed", "en"),
    ("smolai",       "Smol AI News",      "通讯", "rss",  "https://news.smol.ai/rss.xml", "en"),
]

# 分类规则：按顺序命中即止
TAG_RULES = [
    ("模型发布", r"releas|launch|introduc|unveil|announc|unpack|available now|now available|generally available|发布|推出|上线|开源模型|新模型"),
    ("开源", r"open[- ]?sourc|open[- ]?weight|weights|github repo|apache 2|mit licen|开源"),
    ("研究论文", r"paper|research|study|benchmark|arxiv|evaluat|experiment|论文|研究|基准"),
    ("产品功能", r"api|feature|update|improv|roll ?out|integrat|sdk|tool|agent|plugin|功能|插件|升级"),
    ("政策安全", r"regulat|policy|law|safety|safeguard|ethic|ban|compliance|监管|政策|安全|合规"),
    ("商业资本", r"fund|raise|valuat|acquir|partner|invest|revenue|ipo|deal|融资|收购|合作|投资|估值"),
    ("硬件算力", r"chip|gpu|tpu|data ?cent|datacenter|supercomput|silicon|算力|芯片|数据中心"),
]


# 综合科技媒体需要按关键词筛出 AI 相关内容，避免整站新闻淹没动态流。
# 对这类站点只匹配“标题”，否则摘要里偶然提到的 AI 也会把无关新闻带进来。
AI_ONLY_TITLE = re.compile(
    r"人工智能|大模型|大语言模型|生成式|多模态|智能体|具身智能|自动驾驶|智能驾驶|机器学习|深度学习|"
    r"算力|AI\s?芯片|超算|机器人|推理模型|开源模型|"
    r"(?<![A-Za-z])AI(?![A-Za-z])|AIGC|GPT|ChatGPT|Claude|Gemini|Llama|Qwen|DeepSeek|Kimi|Sora|Copilot|"
    r"OpenAI|Anthropic|DeepMind|英伟达|NVIDIA|智谱|月之暗面|商汤|科大讯飞|文心|通义|豆包|混元",
    re.I)
SECONDARY_FILTER = {"ithome", "geekpark", "leiphone", "tmtpost"}


def log(*a):
    print(*a, flush=True)


def fetch(url, timeout=25, tries=2):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/html, */*",
                "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return r.read(3000000)
        except Exception as e:  # noqa: BLE001
            last = e
    raise last


def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


BOILERPLATE = [
    re.compile(r"^\s*arXiv:\s*\S+\s*", re.I),
    re.compile(r"Announce Type:\s*\w+\s*", re.I),
    re.compile(r"Abstract:\s*", re.I),
    re.compile(r"^\s*公告类型[:：]\s*\S+\s*", re.I),
    re.compile(r"^\s*摘要[:：]\s*", re.I),
]


def strip_boilerplate(text):
    """去掉 arXiv RSS 自带的「arXiv:xxx / Announce Type / Abstract」样板文字。"""
    t = text or ""
    for _ in range(3):
        before = t
        for pat in BOILERPLATE:
            t = pat.sub("", t).strip()
        if t == before:
            break
    return t


def clip(s, n=320):
    s = (s or "").strip()
    if len(s) <= n:
        return s
    cut = s[:n]
    for sep in ("。", ". ", "！", "! ", "？", "? "):
        i = cut.rfind(sep)
        if i > n * 0.55:
            return cut[: i + len(sep)].strip()
    return cut.rstrip() + "…"


def parse_date(value):
    if not value:
        return None
    v = value.strip()
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(v)
        if dt:
            return dt.astimezone(datetime.timezone.utc)
    except Exception:
        pass
    v2 = v.replace("Z", "+00:00")
    for fmt in (None, "%Y-%m-%d", "%Y/%m/%d", "%b %d, %Y", "%d %b %Y", "%B %d, %Y"):
        try:
            dt = datetime.datetime.fromisoformat(v2) if fmt is None else datetime.datetime.strptime(v, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            return dt.astimezone(datetime.timezone.utc)
        except Exception:
            continue
    return None


def localname(tag):
    return tag.rsplit("}", 1)[-1].lower()


def pick_text(node, names):
    for child in node:
        if localname(child.tag) in names:
            if child.text and child.text.strip():
                return child.text
            # atom link / rss link
            if localname(child.tag) == "link":
                href = child.attrib.get("href")
                if href:
                    return href
    return ""


def parse_feed(xml_bytes):
    """返回 [(title, url, published_dt|None, summary)]，兼容 RSS 2.0 / Atom / RDF。"""
    out = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        # 有些源有非法字符，退化为正则解析
        txt = xml_bytes.decode("utf-8", "replace")
        for m in re.finditer(r"<(item|entry)\b.*?</\1>", txt, re.S | re.I):
            chunk = m.group(0)
            t = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", chunk, re.S | re.I)
            l = re.search(r"<link[^>]*href=\"([^\"]+)\"|<link[^>]*>(.*?)</link>", chunk, re.S | re.I)
            d = re.search(r"<(pubDate|published|updated|dc:date)[^>]*>(.*?)</\1>", chunk, re.S | re.I)
            s = re.search(r"<(description|summary|content:encoded)[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</\1>", chunk, re.S | re.I)
            url = (l.group(1) or l.group(2) or "").strip() if l else ""
            out.append((strip_html(t.group(1)) if t else "", url,
                        parse_date(strip_html(d.group(2))) if d else None,
                        strip_html(s.group(2)) if s else ""))
        return out

    for item in root.iter():
        if localname(item.tag) not in ("item", "entry"):
            continue
        title = summary = pub = link = ""
        for child in item:
            ln = localname(child.tag)
            if ln == "title" and not title:
                title = strip_html(child.text or "")
            elif ln in ("link",) and not link:
                link = (child.attrib.get("href") or (child.text or "")).strip()
            elif ln in ("pubdate", "published", "updated", "date") and not pub:
                pub = (child.text or "").strip()
            elif ln in ("description", "summary", "content", "encoded") and not summary:
                summary = strip_html(child.text or "")
        if not link:
            # RDF/部分源把 link 放在 guid
            for child in item:
                if localname(child.tag) in ("guid", "id") and (child.text or "").startswith("http"):
                    link = child.text.strip()
                    break
        if title or link:
            out.append((title, link, parse_date(pub), summary))
    return out


def clean_url(u):
    u = (u or "").strip()
    u = re.sub(r"[?&](utm_[^=&]+|ref|source|fbclid|gclid|mc_cid|mc_eid)=[^&]*", "", u)
    return u.rstrip("?&")


def classify(title, summary):
    text = (title + " " + summary).lower()
    for tag, pat in TAG_RULES:
        if re.search(pat, text):
            return tag
    return "其他"


# ---------------- 特殊源 ----------------
MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def scrape_anthropic(url):
    t = fetch(url).decode("utf-8", "replace")
    seen, items = set(), []
    for m in re.finditer(r'<a[^>]+href="(/news/[^"]+)"[^>]*>(.{0,600}?)</a>', t, re.S):
        href, inner = m.group(1), m.group(2)
        if href in seen:
            continue
        seen.add(href)
        text = strip_html(inner)
        dm = re.match(r"([A-Z][a-z]{2}) (\d{1,2}), (\d{4})", text)
        pub = None
        if dm:
            pub = datetime.datetime(int(dm.group(3)), MONTHS.get(dm.group(1), 1), int(dm.group(2)),
                                    tzinfo=datetime.timezone.utc)
            text = text[dm.end():].strip()
        parts = re.split(r"\s{2,}|\s\|\s", text)
        title = parts[-1].strip() if parts else text
        category = parts[-2].strip() if len(parts) > 1 and len(parts[-2]) < 30 else ""
        items.append((title, "https://www.anthropic.com" + href, pub,
                      (category + " · " if category else "") + "Anthropic 官方公告"))
    return items


def scrape_deepseek(url):
    base = "https://api-docs.deepseek.com"
    t = fetch(url).decode("utf-8", "replace")
    links = []
    for m in re.finditer(r'href="(/news/[^"#]+)"', t):
        if m.group(1) not in links:
            links.append(m.group(1))
    items = []
    for href in links[:4]:
        try:
            page = fetch(base + href).decode("utf-8", "replace")
        except Exception:
            continue
        tm = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
        title = strip_html(tm.group(1)) if tm else href
        title = re.sub(r"\s*[|\-]\s*DeepSeek.*$", "", title).strip()
        body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
        desc = ""
        pm = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]+)"', body, re.I)
        if pm:
            desc = strip_html(pm.group(1))
        dm = re.search(r"(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})", body)
        pub = datetime.datetime(int(dm.group(1)), int(dm.group(2)), int(dm.group(3)),
                                tzinfo=datetime.timezone.utc) if dm else None
        items.append((title, base + href, pub, desc or "DeepSeek 官方更新"))
    return items


def scrape_langchain(url):
    """索引页的锚点里没有文字，改为进入每篇文章抓 og:title / 描述 / 发布时间。"""
    t = fetch(url).decode("utf-8", "replace")
    slugs, seen = [], set()
    for m in re.finditer(r'href="(/blog/[^"#?]+)"', t):
        href = m.group(1).rstrip("/")
        if href in seen or href == "/blog":
            continue
        seen.add(href)
        slugs.append(href)
    items = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for href, meta in zip(slugs[:14], ex.map(enrich_from_page,
                                                  ["https://blog.langchain.dev" + s for s in slugs[:14]])):
            title, summary, pub = meta
            if not title:
                title = href.rsplit("/", 1)[-1].replace("-", " ").title()
            items.append((title[:180], "https://blog.langchain.dev" + href, pub,
                          summary or "LangChain 官方博客"))
    return items


def scrape_minimax(url):
    t = fetch(url).decode("utf-8", "replace")
    items, seen = [], set()
    for m in re.finditer(r'"title"\s*:\s*"([^"]{8,180})"[^{}]{0,400}?"(?:url|slug|link)"\s*:\s*"([^"]+)"', t):
        title, href = strip_html(m.group(1)), m.group(2)
        if not href.startswith("http"):
            href = "https://www.minimax.io" + ("" if href.startswith("/") else "/") + href
        if href in seen:
            continue
        seen.add(href)
        items.append((title, href, None, "MiniMax 官方动态"))
    if not items:  # 退化为普通链接抓取
        for m in re.finditer(r'<a[^>]+href="(/news/[^"]+|/blog/[^"]+)"[^>]*>(.{10,200}?)</a>', t, re.S):
            title = strip_html(m.group(2))
            if title and m.group(1) not in seen:
                seen.add(m.group(1))
                items.append((title, "https://www.minimax.io" + m.group(1), None, "MiniMax 官方动态"))
    return items[:15]


SCRAPERS = {"anth": scrape_anthropic, "ds": scrape_deepseek, "lc": scrape_langchain, "mini": scrape_minimax}


def enrich_from_page(url):
    """从文章页抽取 (标题, 描述, 发布时间)，用于索引页没有标题/日期的源。"""
    try:
        t = fetch(url).decode("utf-8", "replace")
    except Exception:
        return ("", "", None)
    def meta(prop):
        m = (re.search(r'<meta[^>]+(?:property|name)="' + prop + r'"[^>]+content="([^"]*)"', t, re.I)
             or re.search(r'<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + prop + r'"', t, re.I))
        return strip_html(m.group(1)) if m else ""
    title = meta("og:title") or meta("twitter:title")
    if not title:
        tm = re.search(r"<title[^>]*>(.*?)</title>", t, re.S | re.I)
        title = strip_html(tm.group(1)) if tm else ""
    title = re.sub(r"\s*[|\-–]\s*(LangChain|Blog).*$", "", title).strip()
    summary = meta("og:description") or meta("description")
    pub = None
    for pat in (r'"datePublished"\s*:\s*"([^"]+)"', r'property="article:published_time"[^>]+content="([^"]+)"',
                r'<time[^>]+datetime="([^"]+)"'):
        m = re.search(pat, t, re.I)
        if m:
            pub = parse_date(m.group(1))
            if pub:
                break
    return (title, summary, pub)


def collect_source(src):
    sid, name, group, kind, url, lang = src
    try:
        if kind in SCRAPERS:
            raw = SCRAPERS[kind](url)
        else:
            raw = parse_feed(fetch(url))
    except Exception as e:  # noqa: BLE001
        return {"id": sid, "name": name, "group": group, "ok": False, "items": 0, "error": f"{type(e).__name__}: {e}"}

    now = datetime.datetime.now(datetime.timezone.utc)

    def make(title, link, pub, summary):
        if sid == "arxiv-ai":
            title = strip_boilerplate(title)
            summary = strip_boilerplate(summary)
        return {
            "title": clip(title, 200),
            "url": clean_url(link),
            "source": name,
            "source_id": sid,
            "group": group,
            "lang": lang,
            "published": pub.isoformat().replace("+00:00", "Z") if pub else "",
            "ts": int(pub.timestamp()) if pub else 0,
            "summary": clip(summary, 320),
            "tag": classify(title, summary),
        }

    dated, undated = [], []
    for title, link, pub, summary in raw:
        if not title:
            continue
        if sid in SECONDARY_FILTER and not AI_ONLY_TITLE.search(title):
            continue                      # 综合科技站：仅标题命中 AI 关键词才保留
        (dated if pub else undated).append(make(title, link, pub, summary))
    dated.sort(key=lambda r: -r["ts"])

    rows = [r for r in dated if (now - datetime.datetime.fromtimestamp(r["ts"], datetime.timezone.utc)).days <= MAX_AGE_DAYS]
    rows = rows[:PER_SOURCE_CAP]
    # 有些重要厂商很久没发文（例如 Qwen 博客），至少保留最新几条，避免整块空白
    if len(rows) < 2:
        for r in dated[: 2 - len(rows)]:
            r["stale"] = True
            rows.append(r)
    for item in undated[:3]:
        item["undated"] = True
        rows.append(item)
    return {"id": sid, "name": name, "group": group, "ok": True, "items": len(rows), "error": ""}, rows


def main():
    log(f"抓取 {len(SOURCES)} 个 AI 资讯源…")
    all_items, report = [], []
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for res in ex.map(collect_source, SOURCES):
            if isinstance(res, dict):
                report.append(res)
                log(f"  -- {res['name']:<22} {res['error']}")
            else:
                meta, rows = res
                report.append(meta)
                all_items.extend(rows)
                flag = "OK" if rows else "--"
                log(f"  {flag} {meta['name']:<22} {len(rows):>3} 条")

    # 按 URL / 标题去重
    seen_url, seen_title, items = set(), set(), []
    for it in sorted(all_items, key=lambda r: -(r["ts"] or 0)):
        key_u = it["url"].rstrip("/").lower()
        key_t = re.sub(r"\W+", "", it["title"].lower())[:70]
        if key_u and key_u in seen_url:
            continue
        if key_t and key_t in seen_title:
            continue
        seen_url.add(key_u)
        seen_title.add(key_t)
        it["id"] = hashlib.sha1((it["url"] or it["title"]).encode("utf-8")).hexdigest()[:12]
        items.append(it)
        if len(items) >= TOTAL_CAP:
            break

    payload = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "count": len(items),
        "ok_sources": sum(1 for r in report if r["ok"] and r["items"]),
        "sources": report,
        "items": items,
    }
    json.dump(payload, open(OUT, "w"), ensure_ascii=False, indent=1)
    ok = payload["ok_sources"]
    log(f"\n完成：{len(items)} 条动态，来自 {ok}/{len(SOURCES)} 个可用源 -> {OUT}")
    now = datetime.datetime.now(datetime.timezone.utc)
    today = [i for i in items if i["ts"] and (now - datetime.datetime.fromtimestamp(i["ts"], datetime.timezone.utc)).days < 1]
    week = [i for i in items if i["ts"] and (now - datetime.datetime.fromtimestamp(i["ts"], datetime.timezone.utc)).days < 7]
    log(f"  近 24 小时：{len(today)} 条 · 近 7 天：{len(week)} 条")
    for i in items[:5]:
        log(f"  · [{i['source']}] {i['title'][:80]} ({i['published'][:10] or '无日期'})")


if __name__ == "__main__":
    main()
