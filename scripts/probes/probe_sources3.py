#!/usr/bin/env python3
"""Third probe: structure of HTML-only vendor pages + newsletter/aggregator feeds."""
import urllib.request, urllib.error, ssl, re, collections, concurrent.futures as cf

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

HTML_PAGES = [
    ("anthropic", "https://www.anthropic.com/news"),
    ("deepseek", "https://api-docs.deepseek.com/news"),
    ("bytedance-seed", "https://seed.bytedance.com/en/blog"),
    ("minimax", "https://www.minimax.io/news"),
    ("stability", "https://stability.ai/news"),
    ("langchain", "https://blog.langchain.dev/"),
    ("deepmind", "https://deepmind.google/blog/"),
    ("meta-ai", "https://ai.meta.com/blog/"),
    ("mistral", "https://mistral.ai/news/"),
]

FEEDS = [
    ("importai", "https://importai.substack.com/feed"),
    ("interconnects", "https://www.interconnects.ai/feed"),
    ("latent-space", "https://www.latent.space/feed"),
    ("one-useful-thing", "https://www.oneusefulthing.org/feed"),
    ("smol-ai", "https://news.smol.ai/rss.xml"),
    ("techmeme", "https://www.techmeme.com/feed.xml"),
    ("the-batch", "https://www.deeplearning.ai/the-batch/feed/"),
    ("ars-technica-ai", "https://arstechnica.com/ai/feed/"),
    ("wired-ai", "https://www.wired.com/feed/tag/ai/latest/rss"),
    ("zdnet-ai", "https://www.zdnet.com/topic/artificial-intelligence/rss.xml"),
    ("the-decoder", "https://the-decoder.com/feed/"),
    ("aitopics", "https://www.marktechpost.com/feed/"),
    ("qbitai", "https://www.qbitai.com/feed"),
    ("jiqizhixin", "https://www.jiqizhixin.com/rss"),
    ("infoq-ai", "https://www.infoq.cn/feed/ai"),
    ("microsoft-ai-blog", "https://blogs.microsoft.com/ai/feed"),
    ("aws-ml", "https://aws.amazon.com/blogs/machine-learning/feed/"),
    ("ibm-research", "https://research.ibm.com/blog/rss"),
    ("salesforce-ai", "https://www.salesforce.com/blog/feed/"),
    ("sakana", "https://sakana.ai/rss.xml"),
    ("ai2", "https://allenai.org/rss.xml"),
    ("eleuther", "https://blog.eleuther.ai/index.xml"),
    ("bair", "https://bair.berkeley.edu/blog/feed.xml"),
    ("stanford-hai", "https://hai.stanford.edu/news/rss.xml"),
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
        return r.status, r.read(400000).decode("utf-8", "replace")


def check_html(item):
    name, url = item
    try:
        code, txt = fetch(url)
    except Exception as e:
        return f"-- {name:<16} ERR {type(e).__name__}"
    hints = []
    if "__NEXT_DATA__" in txt: hints.append("NEXT_DATA")
    if "application/ld+json" in txt: hints.append("ld+json")
    if "__NUXT__" in txt: hints.append("NUXT")
    if "window.__remixContext" in txt: hints.append("remix")
    # look for repeated article-ish anchors
    hrefs = re.findall(r'href="([^"]{4,120})"', txt)
    pat = collections.Counter()
    for h in hrefs:
        m = re.match(r"^/(news|blog|en/blog|research|posts?|article[s]?)/([^/\"?#]+)", h)
        if m:
            pat[m.group(1)] += 1
    # any ISO dates in the payload?
    dates = len(re.findall(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", txt))
    return (f"OK {name:<16} len={len(txt):<7} {'/'.join(hints) or '-':<12} "
            f"articleLinks={sum(pat.values()):<4} {dict(pat)} isoDates={dates}")


def check_feed(item):
    name, url = item
    try:
        code, txt = fetch(url)
    except Exception as e:
        return f"-- {name:<16} ERR {type(e).__name__}"
    n = txt.count("<item") + txt.count("<entry")
    kind = "rss" if re.search(r"<(rss|feed|rdf:RDF)", txt[:3000]) else "html"
    if kind == "html":
        return f"-- {name:<16} {code} html(不是订阅源) len={len(txt)}"
    return f"OK {name:<16} {code} {kind} items={n} len={len(txt)}"


print("=== HTML 型厂商页（判断能否抓取） ===")
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for line in ex.map(check_html, HTML_PAGES):
        print(line)
print("\n=== 订阅源（RSS/Atom） ===")
with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for line in ex.map(check_feed, FEEDS):
        print(line)
