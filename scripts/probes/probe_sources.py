#!/usr/bin/env python3
"""Probe candidate data sources: X/Twitter timelines and AI vendor feeds."""
import urllib.request, urllib.error, json, ssl, sys, concurrent.futures as cf

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
CTX = ssl.create_default_context()

TARGETS = [
    # ---- X / Twitter attempts ----
    ("x-syndication-html", "https://syndication.twitter.com/srv/timeline-profile/screen-name/sama"),
    ("x-syndication-api", "https://cdn.syndication.twimg.com/timeline/profile?screen_name=sama&dnt=false"),
    ("x-rsshub", "https://rsshub.app/twitter/user/sama"),
    ("x-nitter", "https://nitter.net/sama/rss"),
    ("x-jina", "https://r.jina.ai/https://x.com/sama"),
    # ---- vendor feeds ----
    ("openai-blog", "https://openai.com/blog/rss.xml"),
    ("openai-news", "https://openai.com/news/rss.xml"),
    ("anthropic-news", "https://www.anthropic.com/news"),
    ("anthropic-rss", "https://www.anthropic.com/rss.xml"),
    ("deepmind", "https://deepmind.google/blog/rss.xml"),
    ("google-ai", "https://blog.google/technology/ai/rss/"),
    ("google-research", "https://research.google/blog/rss/"),
    ("meta-ai", "https://ai.meta.com/blog/rss/"),
    ("ms-ai", "https://blogs.microsoft.com/ai/feed/"),
    ("nvidia", "https://blogs.nvidia.com/feed/"),
    ("huggingface", "https://huggingface.co/blog/feed.xml"),
    ("mistral", "https://mistral.ai/news/"),
    ("cohere", "https://cohere.com/blog/rss.xml"),
    ("stability", "https://stability.ai/news?format=rss"),
    ("qwen", "https://qwenlm.github.io/blog/index.xml"),
    ("deepseek-news", "https://api-docs.deepseek.com/news"),
    ("arxiv-ai", "https://rss.arxiv.org/rss/cs.AI"),
    ("arxiv-lg", "https://rss.arxiv.org/rss/cs.LG"),
    ("venturebeat-ai", "https://venturebeat.com/category/ai/feed/"),
    ("techcrunch-ai", "https://techcrunch.com/category/artificial-intelligence/feed/"),
    ("theverge-ai", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"),
    ("mit-tech-ai", "https://www.technologyreview.com/topic/artificial-intelligence/feed"),
    ("simonwillison", "https://simonwillison.net/atom/everything/"),
    ("hn-ai", "https://hnrss.org/newest?q=AI+OR+LLM&points=100"),
]


def probe(item):
    name, url = item
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/html, */*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            body = r.read(150000)
            code = r.status
            ctype = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return name, url, e.code, "", "", f"HTTP {e.code}"
    except Exception as e:
        return name, url, 0, "", "", f"{type(e).__name__}: {e}"
    txt = body.decode("utf-8", "replace")
    kind = ("rss" if ("<rss" in txt[:2000] or "<feed" in txt[:2000] or "<rdf:RDF" in txt[:2000])
            else "json" if txt.lstrip()[:1] in "{[" else "html")
    n_items = txt.count("<item") + txt.count("<entry")
    return name, url, code, ctype[:45], f"{kind} items={n_items} len={len(txt)}", ""


with cf.ThreadPoolExecutor(max_workers=12) as ex:
    for name, url, code, ctype, info, err in ex.map(probe, TARGETS):
        flag = "OK " if code == 200 and not err else "-- "
        print(f"{flag}{name:<20} {code:>3}  {info or err:<38} {ctype}")
